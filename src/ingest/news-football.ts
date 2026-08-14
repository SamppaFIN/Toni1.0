// Tiketti #29: Jalkapallouutisten haku ja liittäminen otteluihin
//
// Kuusi RSS-syötettä, ~300 juttua per ajo, joista tyypillisesti 1–5 liittyy
// päivän otteluihin. Suhde on tarkoituksellinen: mieluummin muutama oikea
// uutinen kuin kymmenen sinnepäin osuvaa.
//
// Ajo: npx tsx src/ingest/news-football.ts

import { pathToFileURL } from 'node:url';
import Parser from 'rss-parser';
import { NewsItem, TeamRef } from '../types-football.js';
import { buildTeamPattern, mentionsTeam, isAboutFootball, TeamPattern } from './news-match.js';
import { extractFootballEvents, affectsModel, LAMBDA_DELTA } from '../engine/nlp-football.js';
import { cached } from './cache.js';

export interface FeedSource {
  name: string;
  url: string;
  /** true = syöte on pelkkää jalkapalloa, jolloin kontekstisanoja ei tarvita */
  footballOnly: boolean;
}

/**
 * Syötteet testattu 14.8.2026 — kaikki HTTP 200 ja sisältöä:
 * BBC 81, Guardian 66, IS 100, Iltalehti 20, Yle Urheilu 20, ESPN 19 juttua.
 */
export const FEEDS: FeedSource[] = [
  { name: 'BBC Sport', url: 'https://feeds.bbci.co.uk/sport/football/rss.xml', footballOnly: true },
  { name: 'The Guardian', url: 'https://www.theguardian.com/football/rss', footballOnly: true },
  { name: 'Iltalehti', url: 'https://www.iltalehti.fi/rss/jalkapallo.xml', footballOnly: true },
  { name: 'ESPN', url: 'https://www.espn.com/espn/rss/soccer/news', footballOnly: true },
  // Nämä kattavat kaikki lajit, joten jalkapallokonteksti pitää päätellä tekstistä
  { name: 'Ilta-Sanomat', url: 'https://www.is.fi/rss/urheilu.xml', footballOnly: false },
  { name: 'Yle Urheilu', url: 'https://feeds.yle.fi/uutiset/v1/recent.rss?publisherIds=YLE_URHEILU', footballOnly: false },
];

/** Kuinka vanhoja juttuja huomioidaan */
const MAX_AGE_HOURS = 72;

/** Enintään näin monta uutista per ottelu — kortti ei ole uutisvirta */
const MAX_PER_MATCH = 5;

export interface Article {
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  /** Otsikko + kuvaus yhdessä, tästä etsitään joukkueet ja tapahtumat */
  text: string;
  footballOnly: boolean;
}

const parser = new Parser({ timeout: 20000 });

async function fetchFeed(feed: FeedSource): Promise<Article[]> {
  const parsed = await parser.parseURL(feed.url);

  return (parsed.items ?? []).map((item) => {
    const title = (item.title ?? '').trim();
    const description = (item.contentSnippet ?? item.content ?? '').replace(/<[^>]+>/g, ' ').trim();
    return {
      title,
      url: item.link ?? '',
      source: feed.name,
      publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
      text: `${title}. ${description}`.slice(0, 1200),
      footballOnly: feed.footballOnly,
    };
  });
}

/** Hae kaikki syötteet. Yhden syötteen kaatuminen ei estä muita. */
export async function fetchAllFeeds(): Promise<Article[]> {
  const articles: Article[] = [];
  const seenUrls = new Set<string>();

  for (const feed of FEEDS) {
    try {
      const items = await cached(`rss-${feed.name}`, () => fetchFeed(feed), 30 * 60_000); // 30 min
      let added = 0;
      for (const article of items) {
        // Duplikaattien esto source_url:n perusteella (sama juttu voi olla
        // useassa syötteessä, ja sama syöte voi toistaa jutun)
        if (!article.url || seenUrls.has(article.url)) continue;
        seenUrls.add(article.url);
        articles.push(article);
        added++;
      }
      console.log(`[News] ${feed.name}: ${added} juttua`);
    } catch (err) {
      console.warn(`[News] ${feed.name}: haku epäonnistui — ${(err as Error).message}`);
    }
  }

  return articles;
}

export interface MatchNewsInput {
  matchId: string;
  home: TeamRef;
  away: TeamRef;
  /** Sarjan nimi vahvistaa monitulkintaiset joukkuenimet */
  league?: string;
  homeAliases?: string[];
  awayAliases?: string[];
}

export interface MatchNews {
  matchId: string;
  news: NewsItem[];
  /** Uutisikkuna: tuore korkean varmuuden tapahtuma */
  newsWindow: boolean;
  /** λ-korjaukset joita tapahtumat aiheuttavat */
  lambdaAdjustments: Array<{ side: 'home' | 'away'; delta: number; reason: string }>;
}

/**
 * Liitä uutiset otteluihin.
 *
 * Erittely tehdään vain niille jutuille jotka osuvat johonkin otteluun —
 * 300 jutun LLM-erittely olisi hidasta ja kallista, ja 295 niistä ei liity
 * mihinkään päivän otteluun.
 */
export async function attachNews(
  matches: MatchNewsInput[],
  articles: Article[],
  now = new Date()
): Promise<Map<string, MatchNews>> {
  const cutoff = now.getTime() - MAX_AGE_HOURS * 3600_000;
  const fresh = articles.filter((a) => {
    const t = Date.parse(a.publishedAt);
    return !Number.isFinite(t) || t >= cutoff;
  });

  const patterns = new Map<string, { home: TeamPattern; away: TeamPattern }>();
  for (const m of matches) {
    patterns.set(m.matchId, {
      home: buildTeamPattern(m.home.name, m.homeAliases ?? [], m.home.short, m.league),
      away: buildTeamPattern(m.away.name, m.awayAliases ?? [], m.away.short, m.league),
    });
  }

  const result = new Map<string, MatchNews>();
  for (const m of matches) result.set(m.matchId, { matchId: m.matchId, news: [], newsWindow: false, lambdaAdjustments: [] });

  // Vaihe 1: kerää kaikki osumat. Erittelyä ei tehdä vielä, koska osa
  // osumista karsiutuu MAX_PER_MATCH-rajassa — turha LLM-kutsu on turha kulu.
  interface Candidate {
    article: Article;
    side: 'home' | 'away';
    team: string;
    strength: 'strong' | 'weak';
  }
  const candidates = new Map<string, Candidate[]>();
  for (const m of matches) candidates.set(m.matchId, []);

  for (const article of fresh) {
    // Kaikkien lajien syötteessä joukkuenimi ei riitä: Ilves ja TPS ovat myös
    // jääkiekkoseuroja, ja jääkiekkojuttu ei kerro mitään jalkapallo-ottelusta.
    if (!isAboutFootball(article.text, article.footballOnly)) continue;

    for (const m of matches) {
      const p = patterns.get(m.matchId)!;
      const homeHit = mentionsTeam(article.text, p.home);
      const awayHit = mentionsTeam(article.text, p.away);
      if (!homeHit.matched && !awayHit.matched) continue;

      // Kumpi joukkue on jutun kohde? Vahva osuma voittaa heikon.
      const side: 'home' | 'away' =
        homeHit.strength === 'strong' && awayHit.strength !== 'strong'
          ? 'home'
          : awayHit.strength === 'strong' && homeHit.strength !== 'strong'
            ? 'away'
            : homeHit.matched
              ? 'home'
              : 'away';

      candidates.get(m.matchId)!.push({
        article,
        side,
        team: side === 'home' ? m.home.name : m.away.name,
        strength: (homeHit.strength === 'strong' || awayHit.strength === 'strong' ? 'strong' : 'weak'),
      });
    }
  }

  // Vaihe 2: vahvat ensin, sitten tuoreimmat. Näin heikko osuma ei syrjäytä
  // vahvaa pelkästään koska se tuli syötteestä aiemmin.
  let extracted = 0;
  for (const m of matches) {
    const kept = candidates
      .get(m.matchId)!
      .sort((a, b) => {
        if (a.strength !== b.strength) return a.strength === 'strong' ? -1 : 1;
        return Date.parse(b.article.publishedAt) - Date.parse(a.article.publishedAt);
      })
      .slice(0, MAX_PER_MATCH);

    const entry = result.get(m.matchId)!;

    for (const c of kept) {
      const { events, method } = await extractFootballEvents(c.article.text, c.team);
      extracted++;
      const event = events[0];

      entry.news.push({
        title: c.article.title,
        url: c.article.url,
        source: c.article.source,
        published_at: c.article.publishedAt,
        event_type: event?.event_type ?? null,
        team: c.team,
        player: event?.player || null,
        confidence: event?.confidence ?? null,
        impact: event?.impact ?? null,
      });

      // λ-korjaus vain korkean varmuuden tapahtumista, ja vain LLM voi
      // tuottaa niitä — avainsanaluokittelun confidence on aina alle kynnyksen
      if (event && method === 'llm' && affectsModel(event)) {
        entry.lambdaAdjustments.push({
          side: c.side,
          delta: LAMBDA_DELTA[event.event_type],
          reason: `${c.team}: ${event.impact || event.event_type} (varmuus ${(event.confidence * 100).toFixed(0)} %)`,
        });

        // Uutisikkuna: tapahtuma julkaistu alle 30 min sitten → markkina ei
        // ole todennäköisesti vielä reagoinut.
        //
        // Huom: täydellinen uutisikkuna vaatisi myös tarkistuksen ettei kerroin
        // ole liikkunut. Se onnistuu vertaamalla edelliseen history-snapshottiin
        // ja tulee tiketissä 33 kun historiaa on kertynyt.
        const ageMin = (now.getTime() - Date.parse(c.article.publishedAt)) / 60000;
        if (Number.isFinite(ageMin) && ageMin >= 0 && ageMin < 30) entry.newsWindow = true;
      }
    }

    // Uusin ensin näytettäväksi
    entry.news.sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
  }

  const withNews = [...result.values()].filter((r) => r.news.length).length;
  console.log(
    `[News] ${fresh.length} tuoretta juttua → ${withNews}/${matches.length} ottelulle uutisia, ${extracted} eriteltyä`
  );

  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { buildLiveSnapshot } = await import('../publish/live-snapshot.js');

  const articles = await fetchAllFeeds();
  console.log(`\nYhteensä ${articles.length} juttua kuudesta syötteestä.\n`);

  // Näytä mihin päivän otteluihin uutisia löytyi
  const snapshot = await buildLiveSnapshot();
  const inputs = snapshot.matches.map((m) => ({ matchId: m.id, home: m.home, away: m.away, league: m.league }));
  const news = await attachNews(inputs, articles);

  for (const m of snapshot.matches) {
    const entry = news.get(m.id)!;
    console.log(`${m.home.name} vs ${m.away.name} — ${entry.news.length} uutista${entry.newsWindow ? ' ⚡ UUTISIKKUNA' : ''}`);
    for (const n of entry.news) {
      const conf = n.confidence !== null ? ` [${n.event_type}, varmuus ${(n.confidence * 100).toFixed(0)} %]` : '';
      console.log(`   • ${n.title.slice(0, 88)}`);
      console.log(`     ${n.source} · ${n.published_at.slice(0, 16).replace('T', ' ')}${conf}`);
    }
    for (const adj of entry.lambdaAdjustments) {
      console.log(`   ⚙️ λ-korjaus ${adj.side} ${(adj.delta * 100).toFixed(0)} %: ${adj.reason}`);
    }
  }
}
