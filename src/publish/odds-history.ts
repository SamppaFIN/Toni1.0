// Tiketti #75: Kerroinhistoria — miten hinta ja mallin arvio liikkuivat
//
// `public/data/history/*.json` sisältää täydet snapshotit, yksi per cron-ajo.
// Ne ovat oikea lähde mutta väärä muoto selaimelle: 30 tiedostoa × koko
// päivän ottelukortit on megatavuja, ja niistä pitäisi kaivaa yksi ottelu
// kerrallaan.
//
// Tämä moduuli kääntää saman datan OTTELUKESKEISEKSI aikasarjaksi: yksi rivi
// per ottelu, sisällä havaintopisteet ajan yli. Selain lataa yhden tiedoston
// ja saa koko kierroksen kerroinliikkeen.
//
// KUMULATIIVINEN, EI KORVAAVA. Uusi ajo liittää havainnot vanhojen perään.
// Tämä on olennaista: history/-hakemistoa siivotaan aikanaan, mutta
// kerroinhistoria on nimenomaan se osa jota halutaan säilyttää. Jos tiedosto
// rakennettaisiin joka kerta tyhjästä, se kutistuisi sitä mukaa kun
// lähdetiedostot poistuvat.
//
// Duplikaatit tunnistetaan aikaleimasta: sama ajo kahdesti ei kasvata sarjaa.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Snapshot, MatchCard, SideProbs, MarketSide, ValueFlagLevel } from '../types-football.js';
import { readResults } from '../ingest/results.js';

/** Yksi havainto: mitä markkina ja malli sanoivat tiettynä hetkenä */
export interface OddsPoint {
  /** Snapshotin generated_at */
  at: string;
  /** Paras saatavilla ollut kerroin per kohde */
  odds: Partial<Record<MarketSide, number>>;
  /** Minkä toimiston hinta se oli */
  book: Partial<Record<MarketSide, string>>;
  /** Mallin todennäköisyys */
  model: SideProbs;
  /** Markkinan todennäköisyys marginaalin poiston jälkeen */
  implied: SideProbs;
  /** Laskettu etu per kohde */
  edge: Partial<Record<MarketSide, number>>;
  /** Value-lippu per kohde */
  flag: Partial<Record<MarketSide, ValueFlagLevel>>;
  /** Suositeltu panos euroina, 0 jos ei suositusta */
  stake: Partial<Record<MarketSide, number>>;
}

export interface OddsTimeline {
  match_id: string;
  league: string;
  sport_key: string;
  kickoff: string;
  home: string;
  away: string;
  points: OddsPoint[];
  /**
   * Avaushavainnon toimistorivit ja tunnusluvut — KERRAN per ottelu, ei per
   * havainto (tiketti #83).
   *
   * Selain rakentaa naista ottelukortin menneille paiville. Ilman niita
   * kortti jaisi ilman kerroinvertailua ja tunnuslukuja, ja pelattu ottelu
   * nayttaisi silta ettei siita ollut dataa -- vaikka koko analyysi on
   * tallessa.
   *
   * Per havainto tallennettuna nama kolminkertaistaisivat tiedoston koon.
   * Avaushavainto riittaa, koska analyysi luetaan siita muutenkin.
   */
  opening?: {
    books: unknown[];
    best: unknown;
    stats: unknown;
    /** Taydet edge-rivit sellaisenaan — selaimen ei tarvitse rekonstruoida vajaasti */
    edges: unknown[];
    home_team: unknown;
    away_team: unknown;
    model_extra: unknown;
  } | null;
  /** Toteutunut tulos jos tiedossa */
  result: { outcome: MarketSide; home_score: number; away_score: number } | null;
}

export interface OddsHistoryFile {
  schema_version: 1;
  generated_at: string;
  matches: OddsTimeline[];
}

const SIDES: MarketSide[] = ['home', 'draw', 'away'];

/**
 * Poimi yksi havainto ottelukortista.
 *
 * Palauttaa null jos kortilla ei ole kertoimia lainkaan — tyhjä havainto
 * täyttäisi aikasarjan riveillä joista ei näe mitään.
 */
export function pointFrom(match: MatchCard, at: string): OddsPoint | null {
  const edges = match.analysis?.edges ?? [];
  if (!edges.length) return null;

  const point: OddsPoint = {
    at,
    odds: {},
    book: {},
    model: match.model.probs,
    implied: match.market.implied,
    edge: {},
    flag: {},
    stake: {},
  };

  for (const side of SIDES) {
    const row = edges.find((e) => e.side === side);
    if (!row) continue;
    point.odds[side] = row.odds;
    if (row.book) point.book[side] = row.book;
    point.edge[side] = row.edge;
    point.flag[side] = row.flag;
    if (row.stake_suggestion > 0) point.stake[side] = row.stake_suggestion;
  }

  return point;
}

/**
 * Avaushavainnon lisatiedot: toimistorivit, tunnusluvut ja joukkuemetadata.
 *
 * Nama ovat kortin renderointia varten eivatka analyysia -- analyysi on jo
 * `points`-sarjassa. Siksi ne otetaan sellaisenaan ilman uudelleenmuotoilua.
 */
function openingFrom(match: MatchCard): OddsTimeline['opening'] {
  const m = match as unknown as Record<string, unknown>;
  return {
    books: (m.odds as unknown[]) ?? [],
    best: m.best ?? null,
    stats: m.stats ?? null,
    edges: (match.analysis?.edges as unknown[]) ?? [],
    home_team: match.home,
    away_team: match.away,
    model_extra: match.model
      ? {
          method: match.model.method,
          lambda_home: match.model.lambda_home,
          lambda_away: match.model.lambda_away,
          poisson_probs: match.model.poisson_probs,
          blend_weight: match.model.blend_weight,
          over25: match.model.over25,
          btts: match.model.btts,
        }
      : null,
  };
}

/** Onko havaintopiste jo sarjassa — sama ajo kahdesti ei saa kasvattaa sitä */
function hasPoint(timeline: OddsTimeline, at: string): boolean {
  return timeline.points.some((p) => p.at === at);
}

/**
 * Liitä snapshotit olemassa olevaan historiaan.
 *
 * Syöte ei muutu; palautetaan uusi tiedostorakenne.
 */
export function mergeSnapshots(existing: OddsHistoryFile | null, snapshots: Array<{ snapshot: Snapshot }>): OddsTimeline[] {
  const byId = new Map<string, OddsTimeline>();
  for (const t of existing?.matches ?? []) {
    byId.set(t.match_id, { ...t, points: [...t.points] });
  }

  for (const { snapshot } of snapshots) {
    const at = snapshot.generated_at;
    if (!at) continue;

    for (const match of snapshot.matches ?? []) {
      const point = pointFrom(match, at);
      if (!point) continue;

      let timeline = byId.get(match.id);
      if (!timeline) {
        timeline = {
          match_id: match.id,
          league: match.league,
          sport_key: match.id.split(':')[0],
          kickoff: match.kickoff,
          home: match.home.name,
          away: match.away.name,
          points: [],
          opening: openingFrom(match),
          result: null,
        };
        byId.set(match.id, timeline);
      } else if (!timeline.opening) {
        // Vanhassa tiedostossa ei ole avaustietoja; taydennetaan ne kun
        // ottelu tulee uudelleen vastaan
        timeline.opening = openingFrom(match);
      }

      if (!hasPoint(timeline, at)) timeline.points.push(point);
    }
  }

  for (const t of byId.values()) t.points.sort((a, b) => a.at.localeCompare(b.at));

  return [...byId.values()].sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

/** Liitä toteutuneet tulokset aikasarjoihin */
export function attachResults(
  timelines: OddsTimeline[],
  results: Array<{ match_id: string; outcome: MarketSide; home_score: number; away_score: number }>
): OddsTimeline[] {
  const byId = new Map(results.map((r) => [r.match_id, r]));
  return timelines.map((t) => {
    const r = byId.get(t.match_id);
    return r ? { ...t, result: { outcome: r.outcome, home_score: r.home_score, away_score: r.away_score } } : t;
  });
}

// ─── Luku ja kirjoitus ────────────────────────────────────────────────────

export function readHistorySnapshots(publicDir: string): Array<{ file: string; snapshot: Snapshot }> {
  const dir = path.join(publicDir, 'data', 'history');
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => {
      try {
        return { file, snapshot: JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Snapshot };
      } catch {
        console.warn(`[OddsHistory] ${file} vioittunut — ohitetaan`);
        return null;
      }
    })
    .filter((x): x is { file: string; snapshot: Snapshot } => x !== null);
}

export function readExisting(publicDir: string): OddsHistoryFile | null {
  const p = path.join(publicDir, 'data', 'odds-history.json');
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as OddsHistoryFile;
  } catch {
    console.warn('[OddsHistory] odds-history.json vioittunut — rakennetaan uudelleen historiasta');
    return null;
  }
}

export function buildOddsHistory(publicDir: string, now = new Date()): OddsHistoryFile {
  const snapshots = readHistorySnapshots(publicDir);
  const merged = mergeSnapshots(readExisting(publicDir), snapshots);

  let results: Array<{ match_id: string; outcome: MarketSide; home_score: number; away_score: number }> = [];
  try {
    results = readResults(publicDir).results as typeof results;
  } catch {
    console.warn('[OddsHistory] tuloksia ei voitu lukea — aikasarjat jäävät ilman lopputuloksia');
  }

  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    matches: attachResults(merged, results),
  };
}

export function writeOddsHistory(publicDir: string, file: OddsHistoryFile): string {
  const dir = path.join(publicDir, 'data');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'odds-history.json');
  writeFileSync(out, JSON.stringify(file) + '\n', 'utf8');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  const file = buildOddsHistory(publicDir);
  const out = writeOddsHistory(publicDir, file);

  const settled = file.matches.filter((m) => m.result).length;
  const moved = file.matches.filter((m) => m.points.length > 1).length;
  console.log(`\n${file.matches.length} ottelua · ${settled} ratkennut · ${moved} jolla useampi havainto`);

  const byLeague = new Map<string, number>();
  for (const m of file.matches) byLeague.set(m.league, (byLeague.get(m.league) ?? 0) + 1);
  for (const [league, n] of [...byLeague].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${league}: ${n}`);
  }
  console.log(`✓ ${out}`);
}
