// Tiketti #55: Käynnissä olevien otteluiden tilanne
//
// MITÄ TÄMÄ ANTAA JA MITÄ EI — lue tämä ennen kuin lisäät kenttiä:
//
// The Odds APIn /scores-pääte palauttaa VAIN tuloksen ja tilan. Se ei anna
// pallonhallintaa, laukauksia, kulmia eikä kortteja. Sama koskee
// football-data.orgia ilmaistasolla. API-Footballissa nämä olisivat, mutta
// meidän avaimemme ilmaistaso kattaa vain kaudet 2022–2024 (claude.md,
// gotcha 11), joten se ei auta käynnissä olevaan otteluun.
//
// Tähän ei siis keksitä hallintaprosenttia. Tekaistu tilastoluku näyttäisi
// oikealta datalta ja olisi pahempi kuin puuttuva luku — sama periaate kuin
// tiketissä 32 (ei keksittyjä maalintekijöitä).
//
// KVOOTTA: /scores ilman daysFrom-parametria maksaa 1 krediitin per sarja ja
// palauttaa käynnissä olevat + tulevat. daysFrom nostaisi hinnan kahteen, ja
// päättyneet tulokset haetaan jo erikseen (results.ts), joten sitä ei käytetä.
//
// Ajo: npm run live

import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

interface ScoresApiEvent {
  id: string;
  sport_key?: string;
  commence_time: string;
  completed: boolean;
  home_team: string;
  away_team: string;
  last_update?: string | null;
  scores: Array<{ name: string; score: string }> | null;
}

export interface LiveMatch {
  match_key: string;
  league: string;
  home: string;
  away: string;
  kickoff: string;
  /** null ennen ottelun alkua tai jos lähde ei vielä anna tulosta */
  home_score: number | null;
  away_score: number | null;
  completed: boolean;
  /** Arvio kuluneesta peliajasta minuutteina — EI virallinen kello */
  minute: number | null;
  last_update: string | null;
}

export interface LiveFile {
  schema_version: 1;
  generated_at: string;
  /** Kentät joita mikään ilmaislähteemme ei tarjoa — näytetään käyttäjälle rehellisesti */
  unavailable: string[];
  matches: LiveMatch[];
}

/** Kentät joita EI ole saatavilla. Näytetään UI:ssa, jottei käyttäjä oleta niitä puuttuvaksi bugiksi. */
export const UNAVAILABLE_STATS = ['pallonhallinta', 'laukaukset', 'kulmat', 'kortit'];

/**
 * Arvioitu peliminuutti aloitusajasta.
 *
 * Tämä on ARVIO eikä virallinen kello: se ei tiedä puoliajasta, lisäajoista
 * eikä keskeytyksistä. Siksi se katkaistaan 90:een ja UI merkitsee sen
 * likimääräiseksi. Väärä tarkka minuutti olisi pahempi kuin rehellinen arvio.
 */
export function estimateMinute(kickoff: string, now: Date, completed: boolean): number | null {
  if (completed) return null;
  const start = Date.parse(kickoff);
  if (!Number.isFinite(start)) return null;
  const elapsed = Math.floor((now.getTime() - start) / 60000);
  if (elapsed < 0) return null;
  // Puoliaika ~15 min: 45 min jälkeen kello käytännössä pysähtyy hetkeksi
  const playing = elapsed <= 45 ? elapsed : Math.max(45, elapsed - 15);
  return Math.min(playing, 90);
}

function scoreOf(event: ScoresApiEvent, team: string): number | null {
  const row = event.scores?.find((s) => s.name === team);
  if (!row) return null;
  const n = Number(row.score);
  return Number.isFinite(n) ? n : null;
}

/** Puhdas muunnos — testattavissa ilman verkkoa */
export function toLiveMatches(events: ScoresApiEvent[], league: string, now: Date): LiveMatch[] {
  const out: LiveMatch[] = [];
  for (const e of events) {
    const started = Date.parse(e.commence_time) <= now.getTime();
    // Vain käynnissä olevat ja juuri päättyneet — tulevat ovat jo kierroskortilla
    if (!started) continue;
    out.push({
      match_key: e.id,
      league,
      home: e.home_team,
      away: e.away_team,
      kickoff: e.commence_time,
      home_score: scoreOf(e, e.home_team),
      away_score: scoreOf(e, e.away_team),
      completed: Boolean(e.completed),
      minute: estimateMinute(e.commence_time, now, Boolean(e.completed)),
      last_update: e.last_update ?? null,
    });
  }
  return out.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

async function fetchLive(sportKey: string): Promise<{ events: ScoresApiEvent[]; remaining: string | null; cost: string | null }> {
  // Ei daysFrom → 1 krediitti, vain käynnissä olevat ja tulevat
  const params = new URLSearchParams({ apiKey: config.odds.apiKey });
  const res = await fetch(`${config.odds.baseUrl}/sports/${sportKey}/scores/?${params}`);
  if (!res.ok) throw new Error(`Odds API /scores ${sportKey}: ${res.status} ${res.statusText}`);
  return {
    events: (await res.json()) as ScoresApiEvent[],
    remaining: res.headers.get('x-requests-remaining'),
    cost: res.headers.get('x-requests-last'),
  };
}

export function writeLiveFile(publicDir: string, file: LiveFile): string {
  const dir = path.join(publicDir, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, 'live.json');
  writeFileSync(dest, JSON.stringify(file, null, 2), 'utf8');
  return dest;
}

export async function buildLiveFile(now = new Date()): Promise<LiveFile> {
  const matches: LiveMatch[] = [];
  for (const sportKey of config.odds.footballSports) {
    try {
      const { events, remaining, cost } = await fetchLive(sportKey);
      matches.push(...toLiveMatches(events, sportKey, now));
      console.log(`[Live] ${sportKey}: ${events.length} tapahtumaa (kvootta jäljellä ${remaining ?? '?'}, hinta ${cost ?? '?'})`);
    } catch (err) {
      // Yhden sarjan pettäminen ei saa estää toisen näyttämistä
      console.warn(`[Live] ${sportKey} epäonnistui: ${(err as Error).message}`);
    }
  }
  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    unavailable: UNAVAILABLE_STATS,
    matches,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!config.odds.apiKey) {
    console.error('[Live] ODDS_API_KEY puuttuu');
    process.exit(1);
  }
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  buildLiveFile()
    .then((file) => {
      const dest = writeLiveFile(publicDir, file);
      const live = file.matches.filter((m) => !m.completed);
      console.log(`[Live] ${file.matches.length} ottelua (${live.length} kaynnissa) → ${dest}`);
      for (const m of file.matches) {
        console.log(`  ${m.home} ${m.home_score ?? '-'}–${m.away_score ?? '-'} ${m.away}${m.completed ? ' (paattynyt)' : ` (~${m.minute ?? '?'}'`+')'}`);
      }
    })
    .catch((err) => {
      console.error('[Live] epäonnistui:', err.message);
      process.exit(1);
    });
}
