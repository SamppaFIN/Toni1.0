// Tiketti #65: Ottelutulokset ESPN:stä ilman kvoottaa
//
// MIKSI TÄMÄ KORVAA THE ODDS APIN /scores-PÄÄTTEEN:
// Tuloshaku maksoi 2 krediittiä PER SARJA. Kahdella sarjalla se oli 120
// krediittiä kuukaudessa, mutta kahdeksalla se olisi 480 — ja kerroinhaku vie
// jo 480. Yhteensä 960 eli lähes kaksinkertainen ilmaistason 500:aan.
// Kvootta olisi loppunut noin 15 päivässä.
//
// ESPN antaa samat tulokset ilmaiseksi ja ilman avainta (ks. results-espn.ts).
//
// TUNNISTEEN ONGELMA JA SEN RATKAISU:
// `buildMatchId` johtaa tunnisteen joukkueen NIMESTÄ, ja lähteet kirjoittavat
// nimet eri tavoin: ESPN "Brighton & Hove Albion" → B&H, The Odds API
// "Brighton and Hove Albion" → BAH. Suora vaihto tuottaisi eri tunnisteet,
// eivätkä mittarit löytäisi tuloksia ennusteille — hiljainen vika juuri siinä
// kohdassa jota ei kukaan katso päivittäin.
//
// Siksi tunnistetta EI johdeta ESPN:n nimestä vaan ETSITÄÄN historiasta:
// jokaiselle ESPN-tulokselle haetaan vastaava ottelu snapshot-historiasta
// normalisoiduilla nimillä ja ottelupäivällä, ja käytetään SEN tunnistetta.
// Näin tunniste on täsmälleen se jota ennuste käyttää — ei arvattu.

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { config } from '../config.js';
import { MatchResult, readResults, writeResults, mergeResults } from './results.js';
import { fetchSeasonResultsEspn, hasEspnResults } from './results-espn.js';
import { normalizeClubName } from '../publish/live-snapshot.js';
import { readHistory } from '../publish/metrics.js';
import { leagueLabel } from './odds-football.js';

/** Historian ottelut haettavassa muodossa: normalisoitu avain → tunniste ja metatiedot */
export interface HistoryIndex {
  byKey: Map<string, { id: string; league: string; kickoff: string; home: string; away: string }>;
}

/** Avain joka on riippumaton siitä miten lähde kirjoittaa nimen */
export function matchKey(day: string, home: string, away: string): string {
  return `${day}|${normalizeClubName(home)}|${normalizeClubName(away)}`;
}

/**
 * Indeksoi snapshot-historia. Sama ottelu esiintyy monessa snapshotissa
 * (2 ajoa/vrk), mutta tunniste on niissä sama — ensimmäinen kelpaa.
 */
export function buildHistoryIndex(publicDir: string): HistoryIndex {
  const byKey = new Map<string, { id: string; league: string; kickoff: string; home: string; away: string }>();
  for (const entry of readHistory(publicDir)) {
    for (const m of entry.snapshot.matches ?? []) {
      const key = matchKey(m.kickoff.slice(0, 10), m.home.name, m.away.name);
      if (!byKey.has(key)) {
        byKey.set(key, { id: m.id, league: m.league, kickoff: m.kickoff, home: m.home.name, away: m.away.name });
      }
    }
  }
  return { byKey };
}

/**
 * Yhdistä ESPN-tulokset historian otteluihin.
 *
 * Ottelu jota EI löydy historiasta ohitetaan: sille ei ole ennustetta, joten
 * tulos ei kertoisi mallista mitään. Se olisi vain rivi jota mikään ei lue.
 */
export function matchResultsToHistory(
  espnResults: Array<{ date: string; home: string; away: string; homeScore: number; awayScore: number; outcome: 'home' | 'draw' | 'away' }>,
  index: HistoryIndex,
  sportKey: string,
  recordedAt: string
): { results: MatchResult[]; unmatched: string[] } {
  const results: MatchResult[] = [];
  const unmatched: string[] = [];

  for (const r of espnResults) {
    const hit = index.byKey.get(matchKey(r.date, r.home, r.away));
    if (!hit) {
      unmatched.push(`${r.date} ${r.home}–${r.away}`);
      continue;
    }
    results.push({
      match_id: hit.id,
      sport_key: sportKey,
      league: hit.league,
      kickoff: hit.kickoff,
      home: hit.home,
      away: hit.away,
      home_score: r.homeScore,
      away_score: r.awayScore,
      outcome: r.outcome,
      simulated: false,
      recorded_at: recordedAt,
    });
  }
  return { results, unmatched };
}

export async function ingestResultsFromEspn(publicDir: string, now = new Date()) {
  const index = buildHistoryIndex(publicDir);
  const existing = readResults(publicDir);
  let all = existing.results;
  let added = 0;

  for (const sportKey of config.odds.footballSports) {
    if (!hasEspnResults(sportKey)) {
      console.log(`[Results] ${leagueLabel(sportKey)}: ei ESPN-lähdettä — ohitetaan`);
      continue;
    }
    try {
      const espn = await fetchSeasonResultsEspn(sportKey, now);
      const { results, unmatched } = matchResultsToHistory(espn, index, sportKey, now.toISOString());
      const merge = mergeResults(all, results);
      all = merge.merged;
      added += merge.added;
      console.log(
        `[Results] ${leagueLabel(sportKey)}: ${espn.length} päättynyttä, ${results.length} tunnistettu, ${merge.added} uutta` +
          (unmatched.length ? ` — ${unmatched.length} ei löytynyt historiasta` : '')
      );
    } catch (err) {
      console.warn(`[Results] ${sportKey}: haku epäonnistui — ${(err as Error).message}`);
    }
  }

  writeResults(publicDir, all);
  return { added, total: all.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  const { added, total } = await ingestResultsFromEspn(publicDir);
  console.log(`\n✓ ${added} uutta tulosta, yhteensä ${total} kirjattu (0 krediittiä käytetty)`);
}
