// Kierroskortit käsin syötetyistä kertoimista — ilman The Odds APIa
//
// MIKSI TÄMÄ ON OLEMASSA:
//
// `snapshot:live` rakentaa kortit kerroinhaun ympärille: ilman
// ODDS_API_KEYtä se ei tuota mitään, eikä siis myöskään tunnuslukuja, Eloa,
// uutisia tai analyysiä. `odds:manual` taas lisää käsin syötetyt hinnat
// OLEMASSA OLEVAAN snapshottiin — se ei osaa luoda korttia ottelulle jota
// siellä ei ole.
//
// Väliin jäi se tilanne joka on käytännössä yleisin: kierros on tiedossa
// (kalenterissa), hinnat on luettu käsin toimiston sivulta, mutta korttia ei
// synny kummallakaan ajolla.
//
// Tämä täyttää sen. Ottelut tulevat kalenterista (fixtures.json, ESPN),
// hinnat käsisyöttötiedostosta, ja KORTTI RAKENNETAAN SAMALLA buildCard():lla
// kuin tuotannossa — joten tunnusluvut, Elo, uutiset, Poisson, blendi, edge
// ja Kelly lasketaan täsmälleen samoin. Mikään luku ei voi erota siitä mitä
// putki tuottaisi samasta syötteestä.
//
// VAIN OTTELUT JOILLE ON HINTA. Kertoimeton ottelu ei saa korttia, koska
// kortin sisältö on hinta — sellaiset näkyvät otteluohjelmana ja niiden
// mallin arvio previews.json:issa.
//
// Ajo: npm run snapshot:manual

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sportOf } from '../leagues.js';
import { buildMatchId, teamRef, FootballOddsEvent } from '../ingest/odds-football.js';
import { loadManualOdds, applyManualOdds, unmatchedEvents, ManualOddsFile } from '../ingest/odds-manual.js';
import { fetchStatsFor, LeagueStatsPair } from '../ingest/stats.js';
import { fetchAllFeeds, attachNews, MatchNews } from '../ingest/news-football.js';
import { buildCard, fetchEloMapFor, EloLookup, liigaEloProvider } from './live-snapshot.js';
import { buildSnapshot, writeSnapshot } from './snapshot.js';
import { MatchCard, Snapshot } from '../types-football.js';
import { FixtureMatch, FixturesFile } from './fixtures.js';

/** Kuinka pitkälle eteenpäin kierros ulottuu */
const HORIZON_DAYS = Number(process.env.MANUAL_SNAPSHOT_HORIZON_DAYS || 5);

/**
 * Kalenterin ottelu kerroinhaun tapahtuman muotoon, aluksi ILMAN hintoja.
 *
 * `applyManualOdds` täyttää `odds`-listan niille joille löytyy rivi; muut
 * jäävät tyhjiksi ja karsiutuvat. Tyhjä lista on siis tässä tarkoituksellinen
 * välitila eikä puute.
 */
export function asOddsEvent(m: FixtureMatch): FootballOddsEvent {
  return {
    eventId: m.espn_id,
    sportKey: m.sport_key,
    league: m.league,
    kickoff: m.kickoff,
    home: teamRef(m.home),
    away: teamRef(m.away),
    odds: [],
    totals: [],
  };
}

/** Ottelut aikaikkunassa, alkamattomat, aikajärjestyksessä */
export function upcomingFixtures(calendar: FixturesFile, now: Date, horizonDays = HORIZON_DAYS): FixtureMatch[] {
  const until = now.getTime() + horizonDays * 86_400_000;
  return calendar.matches
    .filter((m) => m.status === 'upcoming')
    .filter((m) => {
      const t = Date.parse(m.kickoff);
      return Number.isFinite(t) && t > now.getTime() && t <= until;
    })
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

export interface BuildResult {
  snapshot: Snapshot;
  /** Rivit jotka eivät osuneet yhteenkään otteluun — kirjoitusvirhe nimessä */
  unmatched: number;
}

export async function buildManualSnapshot(
  calendar: FixturesFile,
  file: ManualOddsFile,
  now = new Date(),
  bankroll = 100
): Promise<BuildResult> {
  const events = upcomingFixtures(calendar, now).map(asOddsEvent);

  const added = applyManualOdds(events, file);
  const missed = unmatchedEvents(events, file);
  for (const m of missed) {
    // Mennyt kierros ei tasmaa eika kuulukaan. Tulevan kierroksen rivi joka
    // ei tasmaa on kirjoitusvirhe joukkuenimessa, ja hiljainen ohitus
    // nayttaisi tasan samalta kuin "kertoimia ei ollut".
    console.warn(`[Kasisyotto] rivi ei tasmannyt yhteenkaan otteluun: ${m.date} ${m.home} vs ${m.away}`);
  }

  const priced = events.filter((e) => e.odds.length);
  console.log(`[Kasisyotto] ${file.bookmaker}: ${added} ottelulle hinnat, ${events.length - priced.length} ilman`);
  if (!priced.length) return { snapshot: buildSnapshot([], 'live', now.toISOString(), []), unmatched: missed.length };

  const leagues = [...new Set(priced.map((e) => e.sportKey))];

  const statsByLeague = new Map<string, LeagueStatsPair | null>();
  const eloByLeague = new Map<string, EloLookup | null>();
  for (const sportKey of leagues) {
    statsByLeague.set(sportKey, await fetchStatsFor(sportKey, now));
    try {
      const map = await fetchEloMapFor(sportKey);
      if (map?.size) {
        eloByLeague.set(sportKey, map);
        console.log(`[Elo] ${sportKey}: ${map.size} joukkuetta`);
      }
    } catch (err) {
      // Elo on lisatieto, ei ehto analyysille
      console.warn(`[Elo] ${sportKey}: ${(err as Error).message}`);
    }
  }

  const matchId = (e: FootballOddsEvent) => buildMatchId(e.sportKey, e.kickoff, e.home.name, e.away.name);

  let newsByMatch = new Map<string, MatchNews>();
  try {
    const articles = await fetchAllFeeds();
    newsByMatch = await attachNews(
      priced.map((e) => ({
        matchId: matchId(e),
        home: e.home,
        away: e.away,
        league: e.league,
        sport: sportOf(e.sportKey),
      })),
      articles,
      now
    );
  } catch (err) {
    console.warn(`[News] uutishaku epäonnistui — ottelut jäävät ilman uutisia: ${(err as Error).message}`);
  }

  const cards: MatchCard[] = priced.map((e) =>
    buildCard(
      e,
      statsByLeague.get(e.sportKey) ?? null,
      newsByMatch.get(matchId(e)) ?? null,
      { now, bankroll },
      eloByLeague.get(e.sportKey) ?? null,
      null
    )
  );
  cards.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  // Lahteet nimelta: kerroinhakua EI ajettu, joten The Odds API ei ole
  // taman ajon lahde vaikka se on sita tuotannossa.
  const providers = [`${file.bookmaker} (kasin syotetty)`];
  const liigaElo = eloByLeague.get('icehockey_liiga');
  if (liigaElo) providers.push(liigaEloProvider(liigaElo));
  for (const pair of statsByLeague.values()) {
    if (pair && !providers.includes(pair.current.source)) providers.push(pair.current.source);
  }
  if ([...newsByMatch.values()].some((n) => n.news.length)) providers.push('RSS-uutissyötteet');

  return { snapshot: buildSnapshot(cards, 'live', now.toISOString(), providers), unmatched: missed.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

  const file = loadManualOdds();
  if (!file) {
    console.error('✗ Käsin syötettyjä kertoimia ei ole (data/veikkaus-odds-manual.json puuttuu tai ei kelpaa).');
    process.exit(1);
  }

  const calendar = JSON.parse(readFileSync(path.join(publicDir, 'data', 'fixtures.json'), 'utf8')) as FixturesFile;

  const { snapshot, unmatched } = await buildManualSnapshot(calendar, file);

  if (!snapshot.matches.length) {
    console.warn(`\n⚠️  Yhdellekään tulevalle ottelulle ei ollut hintaa (${unmatched} riviä ei täsmännyt) — today.json jätetään koskematta.`);
    process.exit(0);
  }

  const { todayPath, historyPath } = writeSnapshot(snapshot, publicDir);
  console.log(`\n✓ ${snapshot.matches.length} korttia (${snapshot.leagues.join(', ')})`);
  console.log(`  ${todayPath}\n  ${historyPath}`);
  console.log(`  lähteet: ${snapshot.providers.join(' · ')}\n`);

  let flagged = 0;
  for (const m of snapshot.matches) {
    const best = m.analysis.edges.reduce((a, b) => (b.edge > a.edge ? b : a));
    if (best.flag !== 'none') flagged++;
    const icon = best.flag === 'strong' ? '💎' : best.flag === 'candidate' ? '🟡' : '⚫';
    const elo = m.stats ? `${m.stats.home.elo ?? '—'}/${m.stats.away.elo ?? '—'}` : '—';
    console.log(
      `${icon} ${(m.home.name + ' – ' + m.away.name).padEnd(40)} ${m.kickoff.slice(5, 16).replace('T', ' ')}` +
        `  kerroin ${m.best.home.toFixed(2)}/${m.best.draw.toFixed(2)}/${m.best.away.toFixed(2)}` +
        `  malli ${(m.model.probs.home * 100).toFixed(0)}/${(m.model.probs.draw * 100).toFixed(0)}/${(m.model.probs.away * 100).toFixed(0)}` +
        `  markkina ${(m.market.implied.home * 100).toFixed(0)}/${(m.market.implied.draw * 100).toFixed(0)}/${(m.market.implied.away * 100).toFixed(0)}` +
        `  Elo ${elo}  uutisia ${m.news.length}`
    );
    for (const e of m.analysis.edges) {
      if (e.flag === 'none') continue;
      console.log(
        `     ${e.flag === 'strong' ? '💎' : '🟡'} ${e.side.padEnd(5)} @${e.odds.toFixed(2)}  edge ${(e.edge * 100).toFixed(1)} %  → panos ${e.stake_suggestion.toFixed(2)} €`
      );
    }
  }
  console.log(`\nValue-kohteita: ${flagged}/${snapshot.matches.length} ottelussa.`);
  if (unmatched) console.log(`${unmatched} käsisyöttöriviä ei täsmännyt (mennyt kierros tai kirjoitusvirhe).`);
}
