// Kierrosennusteet ilman kertoimia — previews.json
//
// MIKSI OMA TIEDOSTO EIKÄ today.json:
//
// Kortti (today.json) on rakennettu hinnan ympärille: paras kerroin, kate,
// edge ja Kelly-panos ovat sen sisältö. Ilman kertoimia jokainen niistä on
// määrittelemätön — `bestOdds` palauttaisi nollat ja edge laskettaisiin
// muodossa `model_prob × 0 − 1 = −1`, eli kortti näyttäisi jokaisesta
// kohteesta −100 %:n odotusarvoa. Se on laskennan artefakti eikä havainto,
// ja käyttäjä lukisi siitä jotain mitä malli ei sano.
//
// Ennuste ilman hintaa on silti arvokas: se kertoo mitä malli odottaa. Vakio-
// tyyppisessä kohteessa hintaa ei edes ole, vaan valitaan 1, X tai 2.
//
// Tämä tiedosto sisältää siis SEN MITÄ MALLI SANOO, ei sitä kannattaako
// vedota. Kun kertoimet myöhemmin saapuvat, today.json ohittaa tämän.
//
// ERIKOISTEKIJÄT ovat johdettuja havaintoja samasta datasta — ei uusi
// tietolähde vaan se osa syötettä joka jää mallin numeron alle piiloon.
// Jokainen niistä sanoo MISTÄ se tulee, jotta käyttäjä voi olla eri mieltä.
//
// Ajo: npm run previews -- 2026-09-12

import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { sportOf, leagueName } from '../leagues.js';
import { applyDrawBoost } from '../analyze/hockey-draws.js';
import { predictPoisson, predictFromLambda, adjustLambda } from '../analyze/poisson.js';
import { strengthForTeam, matchConfidence, StrengthResult } from '../analyze/strength.js';
import { fetchStatsFor, LeagueStatsPair } from '../ingest/stats.js';
import { fetchAllFeeds, attachNews, MatchNews } from '../ingest/news-football.js';
import { fetchEloMapFor, EloLookup, eloFor } from './live-snapshot.js';
import { SideProbs, MarketSide, NewsItem } from '../types-football.js';
import { FixtureMatch } from './fixtures.js';
import { TeamSeasonStats } from '../types-football.js';

/** strengthForTeam palauttaa voiman JA sen tilastorivin josta se laskettiin */
type StrengthWithStats = StrengthResult & { stats: TeamSeasonStats };

/** Yksi erikoistekijä: havainto joka ei näy 1X2-prosentissa */
export interface PreviewFactor {
  /** Kumpaa joukkuetta koskee, tai null kun koskee ottelua */
  side: 'home' | 'away' | null;
  /** Lyhyt otsikko, esim. "Ei pääsarjahistoriaa" */
  label: string;
  /** Mistä havainto tulee — käyttäjän pitää voida tarkistaa se */
  detail: string;
  /** Kumman suuntaan tämä puhuu, jos kumpaankaan */
  leans: MarketSide | null;
}

export interface MatchPreviewRow {
  match_id: string | null;
  league: string;
  sport_key: string;
  kickoff: string;
  date: string;
  home: string;
  away: string;
  /** Mallin 1X2 — summautuu ykköseen */
  probs: SideProbs;
  pick: MarketSide;
  lambda_home: number | null;
  lambda_away: number | null;
  over25: number | null;
  btts: number | null;
  top_score: string | null;
  /** Mallin luottamus 0..1: kuinka paljon dataa numeron takana on */
  confidence: number;
  elo_home: number | null;
  elo_away: number | null;
  elo_diff: number | null;
  form_home: string | null;
  form_away: string | null;
  basis_home: string | null;
  basis_away: string | null;
  factors: PreviewFactor[];
  news: NewsItem[];
}

export interface PreviewsFile {
  schema_version: 1;
  generated_at: string;
  date: string;
  source: string;
  matches: MatchPreviewRow[];
}

const SCHEMA_VERSION = 1 as const;

/** Kotietu Elo-pisteinä — sama luku kuin jalkapallon kausi-Elossa */
const FOOTBALL_HOME_ADVANTAGE = 55;

function argmax(p: SideProbs): MarketSide {
  return (['home', 'draw', 'away'] as MarketSide[]).reduce((b, s) => (p[s] > p[b] ? s : b), 'home');
}

function round(n: number, d = 4): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// ─── Erikoistekijät ───────────────────────────────────────────────────────

/**
 * Voiton putki tai tappioputki viimeisistä otteluista.
 *
 * VAIN YHTENÄINEN PUTKI lasketaan, ei "3 voittoa viidestä": sekoitettu
 * muoto on jo mukana voimaluvussa maalien kautta, eikä siitä tule erillistä
 * havaintoa. Yhtenäinen putki sen sijaan kertoo jotain mitä maalisummat
 * eivät — että tila on pysynyt samana.
 */
export function streakOf(form: string | null): { kind: 'W' | 'L' | 'D'; length: number } | null {
  if (!form) return null;
  const last = form[form.length - 1] as 'W' | 'L' | 'D';
  if (!last) return null;
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) n++;
  return n >= 3 ? { kind: last, length: n } : null;
}

/** Lepopäivät edellisestä ottelusta. null kun edellistä ei tiedetä. */
export function restDays(kickoff: string, previousKickoff: string | null): number | null {
  if (!previousKickoff) return null;
  const diff = (Date.parse(kickoff) - Date.parse(previousKickoff)) / 86_400_000;
  return Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
}

/**
 * Kerää ottelun erikoistekijät.
 *
 * Nämä EIVÄT muuta mallin lukua — se on jo laskettu samasta datasta. Ne
 * kertovat mikä syötteessä on poikkeuksellista, jotta käyttäjä näkee milloin
 * numeron takana on jotain mitä numero ei kerro.
 */
export function collectFactors(input: {
  home: StrengthWithStats | null;
  away: StrengthWithStats | null;
  eloHome: number | null;
  eloAway: number | null;
  restHome: number | null;
  restAway: number | null;
  news: NewsItem[];
}): PreviewFactor[] {
  const out: PreviewFactor[] = [];
  const { home, away, eloHome, eloAway, restHome, restAway, news } = input;

  // 1. Nousija ilman pääsarjahistoriaa: voima on sarjan keskitaso eli arvaus.
  //    Tämä on tärkein yksittäinen varaus, koska se koskee koko numeroa.
  for (const [side, s] of [['home', home], ['away', away]] as const) {
    if (s && s.basis === 'league-average') {
      out.push({
        side,
        label: 'Ei pääsarjahistoriaa',
        detail: `Voimaluku on sarjan keskitaso: edelliseltä kaudelta ei ole dataa tästä sarjasta (${s.playedThisSeason} ottelua tällä kaudella). Mallin arvio on tälle joukkueelle selvästi epävarmempi.`,
        leans: null,
      });
    }
  }

  // 2. Yhtenäinen voitto- tai tappioputki
  for (const [side, s] of [['home', home], ['away', away]] as const) {
    const streak = streakOf(s?.stats?.form ?? null);
    if (!streak || streak.kind === 'D') continue;
    out.push({
      side,
      label: streak.kind === 'W' ? `${streak.length} voittoa putkeen` : `${streak.length} tappiota putkeen`,
      detail: `Muoto ${s!.stats.form}. Putki ei ole mallin syöte — maalit ovat — joten tämä on lisähavainto eikä osa prosenttia.`,
      leans: streak.kind === 'W' ? side : side === 'home' ? 'away' : 'home',
    });
  }

  // 3. Koti-/vieraskyvyttömyys: maaliton puolikausi on eri asia kuin heikko
  //    maaliero, ja se katoaa kokonaissummiin.
  if (home?.stats && home.stats.home_played && home.stats.home_gf === 0) {
    out.push({
      side: 'home',
      label: 'Ei maalia kotona',
      detail: `${home.stats.home_played} kotiottelua, 0 tehtyä maalia.`,
      leans: 'away',
    });
  }
  if (away?.stats && away.stats.away_played && away.stats.away_gf === 0) {
    out.push({
      side: 'away',
      label: 'Ei maalia vieraissa',
      detail: `${away.stats.away_played} vierasottelua, 0 tehtyä maalia.`,
      leans: 'home',
    });
  }

  // 4. Elo-ero. Kotietu mukaan, koska ilman sitä luku vastaa väärään
  //    kysymykseen: neutraalilla kentällä pelattavaan otteluun.
  if (eloHome !== null && eloAway !== null) {
    const net = eloHome + FOOTBALL_HOME_ADVANTAGE - eloAway;
    if (Math.abs(net) >= 40) {
      out.push({
        side: null,
        label: `Elo-ero ${net > 0 ? '+' : ''}${Math.round(net)}`,
        detail: `${Math.round(eloHome)} vs ${Math.round(eloAway)}, kotietu +${FOOTBALL_HOME_ADVANTAGE} mukaan luettuna. Elo EI ole mallin syöte — se lasketaan tuloksista ja toimii tässä riippumattomana toisena mielipiteenä.`,
        leans: net > 0 ? 'home' : 'away',
      });
    }
  }

  // 5. Lepo. Kolme päivää tai vähemmän on kasautuma; kuusi päivää enemmän
  //    kuin vastustajalla on mitattava ero.
  for (const [side, rest] of [['home', restHome], ['away', restAway]] as const) {
    if (rest !== null && rest <= 3) {
      out.push({
        side,
        label: `${rest} päivää lepoa`,
        detail: 'Edellisestä ottelusta on kulunut enintään kolme vuorokautta.',
        leans: side === 'home' ? 'away' : 'home',
      });
    }
  }
  if (restHome !== null && restAway !== null && Math.abs(restHome - restAway) >= 4) {
    const rested = restHome > restAway ? 'home' : 'away';
    out.push({
      side: null,
      label: 'Epätasainen lepo',
      detail: `Koti ${restHome} vrk, vieras ${restAway} vrk.`,
      leans: rested,
    });
  }

  // 6. Uutiset joilla on tunnistettu tapahtumatyyppi. Matala varmuus
  //    sanotaan, koska avainsanaluokittelu erehtyy eikä se saa näyttää
  //    mitatulta (#29).
  for (const n of news) {
    if (!n.event_type) continue;
    out.push({
      side: null,
      label: `Uutinen: ${n.event_type}`,
      detail: `${n.team ?? '?'} — ${n.title} (${n.source}${n.confidence !== null ? `, varmuus ${Math.round(n.confidence * 100)} %` : ''})`,
      leans: null,
    });
  }

  return out;
}

// ─── Rakennus ─────────────────────────────────────────────────────────────

export function buildPreviewRow(
  fixture: FixtureMatch,
  stats: LeagueStatsPair | null,
  elo: EloLookup | null,
  news: MatchNews | null,
  previousKickoff: { home: string | null; away: string | null }
): MatchPreviewRow | null {
  const sportKey = fixture.sport_key;
  const emptySeason = !stats || !stats.current.teams.length;

  const home = emptySeason ? null : strengthForTeam(fixture.home, stats!.current, stats!.previous, config.model.shrinkageK);
  const away = emptySeason ? null : strengthForTeam(fixture.away, stats!.current, stats!.previous, config.model.shrinkageK);

  // Ilman molempien voimalukua ei ole ennustetta. Rivi jätetään pois sen
  // sijaan että julkaistaisiin sarjan keskitason arvaus mallin numerona.
  if (!home || !away) return null;

  const league = { homeGoals: stats!.current.homeGoalsAvg, awayGoals: stats!.current.awayGoalsAvg };
  let poisson = predictPoisson(home.strength, away.strength, league, config.model.rho);
  if (sportOf(sportKey) === 'hockey') poisson = { ...poisson, probs: applyDrawBoost(poisson.probs) };

  // Uutisten λ-korjaukset: vain korkean varmuuden tapahtumat (ks. nlp-football)
  const adj = news?.lambdaAdjustments ?? [];
  if (adj.length) {
    const dh = adj.filter((a) => a.side === 'home').reduce((s, a) => s + a.delta, 0);
    const da = adj.filter((a) => a.side === 'away').reduce((s, a) => s + a.delta, 0);
    poisson = predictFromLambda(adjustLambda(poisson.lambdaHome, dh), adjustLambda(poisson.lambdaAway, da), config.model.rho);
    if (sportOf(sportKey) === 'hockey') poisson = { ...poisson, probs: applyDrawBoost(poisson.probs) };
  }

  // eloFor() eika suora get(): Elo-kartan avain riippuu sarjasta, ja vain
  // toisella normalisoinnilla kysyminen jatti englantilaiset sarjat ilman
  // Eloa taysin aanettomasti.
  const eloHome = eloFor(fixture.home, elo)?.elo ?? null;
  const eloAway = eloFor(fixture.away, elo)?.elo ?? null;

  const probs: SideProbs = {
    home: round(poisson.probs.home),
    draw: round(poisson.probs.draw),
    away: round(poisson.probs.away),
  };

  return {
    match_id: fixture.match_id ?? null,
    league: fixture.league,
    sport_key: sportKey,
    kickoff: fixture.kickoff,
    date: fixture.date,
    home: fixture.home,
    away: fixture.away,
    probs,
    pick: argmax(probs),
    lambda_home: round(poisson.lambdaHome, 3),
    lambda_away: round(poisson.lambdaAway, 3),
    over25: round(poisson.over25),
    btts: round(poisson.btts),
    top_score: poisson.topScores[0]?.score ?? null,
    confidence: round(matchConfidence(home, away), 3),
    elo_home: eloHome,
    elo_away: eloAway,
    elo_diff: eloHome !== null && eloAway !== null ? Math.round(eloHome - eloAway) : null,
    form_home: home.stats.form,
    form_away: away.stats.form,
    basis_home: home.basis,
    basis_away: away.basis,
    factors: collectFactors({
      home,
      away,
      eloHome,
      eloAway,
      restHome: restDays(fixture.kickoff, previousKickoff.home),
      restAway: restDays(fixture.kickoff, previousKickoff.away),
      news: news?.news ?? [],
    }),
    news: news?.news ?? [],
  };
}

export function writePreviews(file: PreviewsFile, publicDir: string): string {
  const dir = path.join(publicDir, 'data');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'previews.json');
  writeFileSync(out, JSON.stringify(file) + '\n', 'utf8');
  return out;
}

/**
 * Edellisen ottelun alkamisaika joukkueittain — lepopäiviä varten.
 *
 * Luetaan kalenterista: päättyneet ottelut ennen kohdepäivää. Ilman
 * kalenteria lepo jää tuntemattomaksi, mikä on eri asia kuin "hyvin levännyt".
 */
export function lastKickoffBefore(matches: FixtureMatch[], date: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of matches) {
    if (m.date >= date) continue;
    for (const team of [m.home, m.away]) {
      const prev = out.get(team);
      if (!prev || m.kickoff > prev) out.set(team, m.kickoff);
    }
  }
  return out;
}

export async function buildPreviews(date: string, calendar: { matches: FixtureMatch[] }, now = new Date()): Promise<PreviewsFile> {
  const day = calendar.matches.filter((m) => m.date === date);
  if (!day.length) throw new Error(`Kalenterissa ei ole otteluita päivälle ${date}`);

  const leagues = [...new Set(day.map((m) => m.sport_key))];
  console.log(`[Previews] ${date}: ${day.length} ottelua, ${leagues.length} sarjaa`);

  const statsByLeague = new Map<string, LeagueStatsPair | null>();
  const eloByLeague = new Map<string, EloLookup | null>();
  for (const sportKey of leagues) {
    statsByLeague.set(sportKey, await fetchStatsFor(sportKey, now));
    try {
      eloByLeague.set(sportKey, await fetchEloMapFor(sportKey));
    } catch (err) {
      console.warn(`[Previews] ${sportKey}: Elo-lukuja ei saatu — ${(err as Error).message}`);
      eloByLeague.set(sportKey, null);
    }
  }

  // Uutiset kerran kaikille otteluille
  let newsByMatch = new Map<string, MatchNews>();
  try {
    const articles = await fetchAllFeeds();
    newsByMatch = await attachNews(
      day.map((m) => ({
        matchId: m.match_id ?? `${m.sport_key}:${m.date}:${m.home}-${m.away}`,
        home: { name: m.home, short: m.home.slice(0, 3).toUpperCase(), color: '#888' },
        away: { name: m.away, short: m.away.slice(0, 3).toUpperCase(), color: '#888' },
        league: m.league,
        sport: sportOf(m.sport_key),
      })),
      articles,
      now
    );
  } catch (err) {
    console.warn(`[Previews] uutishaku epäonnistui — ${(err as Error).message}`);
  }

  const lastKickoff = lastKickoffBefore(calendar.matches, date);

  const rows: MatchPreviewRow[] = [];
  for (const fixture of day.sort((a, b) => a.kickoff.localeCompare(b.kickoff))) {
    const key = fixture.match_id ?? `${fixture.sport_key}:${fixture.date}:${fixture.home}-${fixture.away}`;
    const row = buildPreviewRow(
      fixture,
      statsByLeague.get(fixture.sport_key) ?? null,
      eloByLeague.get(fixture.sport_key) ?? null,
      newsByMatch.get(key) ?? null,
      { home: lastKickoff.get(fixture.home) ?? null, away: lastKickoff.get(fixture.away) ?? null }
    );
    if (row) rows.push(row);
    else console.warn(`[Previews] ${fixture.home} vs ${fixture.away}: ei voimalukuja — jätetään pois`);
  }

  const sources = [...new Set([...statsByLeague.values()].filter(Boolean).map((s) => s!.current.source))];

  return {
    schema_version: SCHEMA_VERSION,
    generated_at: now.toISOString(),
    date,
    source: sources.join(' · ') || 'ei lähdettä',
    matches: rows,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  const { readFileSync } = await import('node:fs');

  const target = process.argv[2] || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const calendar = JSON.parse(readFileSync(path.join(publicDir, 'data', 'fixtures.json'), 'utf8')) as {
    matches: FixtureMatch[];
  };

  const file = await buildPreviews(target, calendar);
  const out = writePreviews(file, publicDir);

  console.log(`\n✓ ${file.matches.length} ennustetta päivälle ${target}`);
  console.log(`  ${out}\n`);

  for (const m of file.matches) {
    const pick = m.pick === 'home' ? '1' : m.pick === 'draw' ? 'X' : '2';
    const p = (m.probs[m.pick] * 100).toFixed(0);
    console.log(
      `${pick}  ${(m.home + ' – ' + m.away).padEnd(44)} ${(m.probs.home * 100).toFixed(0).padStart(3)}/${(m.probs.draw * 100).toFixed(0).padStart(2)}/${(m.probs.away * 100).toFixed(0).padStart(3)}` +
        `  varmin ${p} %  luottamus ${(m.confidence * 100).toFixed(0)} %  λ ${m.lambda_home?.toFixed(2)}–${m.lambda_away?.toFixed(2)}` +
        `${m.factors.length ? `  · ${m.factors.length} erikoistekijää` : ''}`
    );
    for (const f of m.factors) console.log(`      ${f.side ? (f.side === 'home' ? '🏠' : '✈️') : '⚪'} ${f.label}${f.leans ? ` → ${f.leans}` : ''}`);
  }
}
