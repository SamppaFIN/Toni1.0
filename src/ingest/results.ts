// Tiketti #33: Oikeiden lopputulosten haku
//
// Ilman lopputuloksia tarkkuusmittarit ovat tyhjä kuori. The Odds APIn
// /scores-pääte antaa päättyneiden otteluiden tulokset (2 krediittiä per sarja).
//
// Tulokset kerätään kumulatiivisesti public/data/results.json:iin, koska
// /scores palauttaa vain viimeiset päivät. Kerran menetettyä tulosta ei saa
// takaisin ilmaistasolla.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { buildMatchId, leagueLabel, teamRef } from './odds-football.js';
import { MarketSide } from '../types-football.js';

/** Kuinka montaa päivää taaksepäin haetaan. API sallii 1–3. */
const DAYS_FROM = 3;

interface ScoresApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  scores: Array<{ name: string; score: string }> | null;
  last_update: string | null;
}

export interface MatchResult {
  match_id: string;
  sport_key: string;
  league: string;
  kickoff: string;
  home: string;
  away: string;
  home_score: number;
  away_score: number;
  outcome: MarketSide;
  /** Aina false — tämä tiedosto sisältää vain oikeita tuloksia */
  simulated: false;
  recorded_at: string;
}

export interface ResultsFile {
  schema_version: 1;
  updated_at: string;
  results: MatchResult[];
}

export function outcomeOf(homeScore: number, awayScore: number): MarketSide {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

/** Muunna API-vastaus tuloksiksi. Keskeneräiset ja puutteelliset ohitetaan. */
export function parseScores(events: ScoresApiEvent[], recordedAt: string): MatchResult[] {
  const results: MatchResult[] = [];

  for (const event of events) {
    if (!event.completed || !event.scores?.length) continue;

    // Pisteet nimen perusteella, ei listan järjestyksen — sama varovaisuus
    // kuin kertoimien poiminnassa
    const home = event.scores.find((s) => s.name === event.home_team);
    const away = event.scores.find((s) => s.name === event.away_team);
    if (!home || !away) continue;

    const homeScore = Number(home.score);
    const awayScore = Number(away.score);
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) continue;

    results.push({
      match_id: buildMatchId(event.sport_key, event.commence_time, event.home_team, event.away_team),
      sport_key: event.sport_key,
      league: leagueLabel(event.sport_key),
      kickoff: new Date(event.commence_time).toISOString(),
      home: teamRef(event.home_team).name,
      away: teamRef(event.away_team).name,
      home_score: homeScore,
      away_score: awayScore,
      outcome: outcomeOf(homeScore, awayScore),
      simulated: false,
      recorded_at: recordedAt,
    });
  }

  return results;
}

async function fetchScores(sportKey: string): Promise<{ events: ScoresApiEvent[]; remaining: string | null }> {
  const params = new URLSearchParams({ apiKey: config.odds.apiKey, daysFrom: String(DAYS_FROM) });
  const res = await fetch(`${config.odds.baseUrl}/sports/${sportKey}/scores/?${params}`);
  if (!res.ok) throw new Error(`Odds API /scores ${sportKey}: ${res.status} ${res.statusText}`);
  return { events: (await res.json()) as ScoresApiEvent[], remaining: res.headers.get('x-requests-remaining') };
}

export function readResults(publicDir: string): ResultsFile {
  const file = path.join(publicDir, 'data', 'results.json');
  if (!existsSync(file)) return { schema_version: 1, updated_at: new Date(0).toISOString(), results: [] };
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as ResultsFile;
  } catch {
    console.warn('[Results] results.json on vioittunut — aloitetaan tyhjästä');
    return { schema_version: 1, updated_at: new Date(0).toISOString(), results: [] };
  }
}

/** Yhdistä uudet tulokset olemassa oleviin. Duplikaatit tunnistetaan match_id:llä. */
export function mergeResults(existing: MatchResult[], incoming: MatchResult[]): { merged: MatchResult[]; added: number } {
  const byId = new Map(existing.map((r) => [r.match_id, r]));
  let added = 0;

  for (const result of incoming) {
    if (byId.has(result.match_id)) continue;
    byId.set(result.match_id, result);
    added++;
  }

  const merged = [...byId.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  return { merged, added };
}

export function writeResults(publicDir: string, results: MatchResult[]): string {
  const dir = path.join(publicDir, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'results.json');
  const payload: ResultsFile = { schema_version: 1, updated_at: new Date().toISOString(), results };
  writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

/** Hae ja tallenna päättyneiden otteluiden tulokset */
export async function ingestResults(publicDir: string, now = new Date()): Promise<{ added: number; total: number }> {
  if (!config.odds.apiKey) {
    console.warn('[Results] ODDS_API_KEY puuttuu — ohitetaan');
    return { added: 0, total: 0 };
  }

  const existing = readResults(publicDir);
  let all = existing.results;
  let added = 0;

  for (const sportKey of config.odds.footballSports) {
    try {
      const { events, remaining } = await fetchScores(sportKey);
      const parsed = parseScores(events, now.toISOString());
      const merge = mergeResults(all, parsed);
      all = merge.merged;
      added += merge.added;
      console.log(
        `[Results] ${leagueLabel(sportKey)}: ${parsed.length} päättynyttä, ${merge.added} uutta — kvootta jäljellä ${remaining ?? '?'}`
      );
    } catch (err) {
      console.warn(`[Results] ${sportKey}: haku epäonnistui — ${(err as Error).message}`);
    }
  }

  if (added) writeResults(publicDir, all);
  else console.log('[Results] Ei uusia tuloksia');

  return { added, total: all.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  const { added, total } = await ingestResults(publicDir);
  console.log(`\n✓ ${added} uutta tulosta, yhteensä ${total} kirjattu`);

  const results = readResults(publicDir).results;
  for (const r of results.slice(-10)) {
    console.log(`  ${r.kickoff.slice(0, 16).replace('T', ' ')}  ${r.home} ${r.home_score}–${r.away_score} ${r.away}  (${r.outcome})`);
  }
}
