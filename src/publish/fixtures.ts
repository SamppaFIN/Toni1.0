// Tiketti #74: Otteluohjelmakalenteri — koko kausi, kaikki seuratut sarjat
//
// today.json sisältää vain lähipäivien ottelut, koska The Odds API antaa
// kertoimia vain niille. Aikajanakontrolli tarvitsee enemmän: käyttäjä haluaa
// selata seuraavaan kierrokseen ja nähdä mitä on tulossa, myös silloin kun
// kertoimia ei vielä ole julkaistu.
//
// LÄHDE ON ESPN, EI THE ODDS API. Tämä on tarkoituksellista:
//   - ESPN antaa koko kauden ohjelman ilmaiseksi ja ilman avainta
//   - The Odds API veloittaa krediitin per sarja per haku (500/kk)
// Kalenterin hakeminen kertoimien kautta polttaisi kuukauden kvootan
// muutamassa päivässä — sama laskuvirhe jonka tein tiketissä #65.
//
// KERTOIMET LIITETÄÄN, EI HAETA. Jos today.json (tai arkisto) tuntee saman
// ottelun, kalenteri merkitsee sen `has_odds`-lipulla ja kantaa mukanaan sen
// `match_id`:n, jotta UI osaa avata oikean kortin. Liitos tehdään
// NORMALISOIDUILLA NIMILLÄ + päivällä, ei ID-vertailuna: ESPN:n ja Odds APIn
// nimet eroavat ("Brighton & Hove Albion" vs "Brighton"), ja ID-vertailu
// epäonnistuisi hiljaa — sama sudenkuoppa kuin tiketissä #65.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { leagueFor, leagueName } from '../leagues.js';
import { normalizeClubName } from './live-snapshot.js';
import { Snapshot } from '../types-football.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

/** Kuinka monta päivää taaksepäin kalenteri ulottuu (menneet kierrokset) */
export const DAYS_BACK = 21;
/** Kuinka monta päivää eteenpäin (tulevat kierrokset) */
export const DAYS_FORWARD = 35;

export interface FixtureMatch {
  /** ESPN:n tapahtuma-ID — kalenterin oma avain, aina olemassa */
  espn_id: string;
  /** Kertoimien match_id jos ottelu tunnistettiin snapshotista, muuten null */
  match_id: string | null;
  /** Ottelupäivä paikallisittain UTC:ssä, YYYY-MM-DD */
  date: string;
  kickoff: string;
  sport_key: string;
  league: string;
  home: string;
  away: string;
  status: 'upcoming' | 'live' | 'finished';
  home_score: number | null;
  away_score: number | null;
  /** Onko kohteelle julkaistu kertoimia */
  has_odds: boolean;
}

export interface FixtureDay {
  date: string;
  matches: number;
  /** Montako ottelua joille on kertoimet */
  with_odds: number;
  leagues: string[];
}

export interface FixturesFile {
  schema_version: 1;
  generated_at: string;
  range: { from: string; to: string };
  /** VAIN päivät joilla on vähintään yksi ottelu — tyhjää päivää ei listata */
  days: FixtureDay[];
  matches: FixtureMatch[];
}

// ─── ESPN ─────────────────────────────────────────────────────────────────

interface EspnCompetitor {
  homeAway?: string;
  score?: string | number | null;
  team?: { displayName?: string; shortDisplayName?: string };
}
interface EspnEvent {
  id?: string;
  date?: string;
  status?: { type?: { state?: string; completed?: boolean } };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * ESPN:n tilakoodi omaksi tilaksemme.
 *
 * Tuntematon tila tulkitaan `upcoming`iksi vain jos aloitus on tulevaisuudessa.
 * Muuten se on `finished` — muuten mennyt ottelu jäisi ikuisesti roikkumaan
 * "tulossa"-tilaan jos ESPN palauttaa oudon koodin.
 */
export function fixtureStatus(state: string | undefined, completed: boolean | undefined, kickoff: string, now: Date): FixtureMatch['status'] {
  if (completed || state === 'post') return 'finished';
  if (state === 'in') return 'live';
  if (state === 'pre') return 'upcoming';
  return Date.parse(kickoff) > now.getTime() ? 'upcoming' : 'finished';
}

function score(c: EspnCompetitor | undefined): number | null {
  const n = Number(c?.score);
  return Number.isFinite(n) ? n : null;
}

export function parseFixtures(events: EspnEvent[], sportKey: string, now: Date): FixtureMatch[] {
  const out: FixtureMatch[] = [];

  for (const ev of events) {
    const comps = ev.competitions?.[0]?.competitors ?? [];
    const home = comps.find((c) => c.homeAway === 'home');
    const away = comps.find((c) => c.homeAway === 'away');
    const homeName = home?.team?.displayName;
    const awayName = away?.team?.displayName;

    // Ilman nimiä tai aikaa rivi ei ole ottelu — pudotetaan hiljaa,
    // koska ESPN palauttaa toisinaan keskeneräisiä paikanvaraajia.
    if (!ev.id || !ev.date || !homeName || !awayName) continue;
    const kickoff = new Date(ev.date).toISOString();

    out.push({
      espn_id: String(ev.id),
      match_id: null,
      date: kickoff.slice(0, 10),
      kickoff,
      sport_key: sportKey,
      league: leagueName(sportKey),
      home: homeName,
      away: awayName,
      status: fixtureStatus(ev.status?.type?.state, ev.status?.type?.completed, kickoff, now),
      home_score: score(home),
      away_score: score(away),
      has_odds: false,
    });
  }

  return out;
}

async function fetchLeagueFixtures(espnCode: string, from: Date, to: Date): Promise<EspnEvent[]> {
  const url = `${BASE}/${espnCode}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${espnCode}: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  return data.events ?? [];
}

// ─── Kertoimien liittäminen ───────────────────────────────────────────────

/** Liitosavain: päivä + normalisoidut nimet. EI ID-vertailua (ks. tiedoston alku). */
export function joinKey(date: string, home: string, away: string): string {
  return `${date}|${normalizeClubName(home)}|${normalizeClubName(away)}`;
}

/**
 * Merkitse kertoimet niihin otteluihin jotka snapshot tuntee.
 *
 * Palauttaa uuden taulukon — syöte ei muutu, jotta funktio on testattava
 * ilman sivuvaikutuksia.
 */
export function attachOdds(fixtures: FixtureMatch[], snapshots: Snapshot[]): FixtureMatch[] {
  const known = new Map<string, string>();

  for (const snap of snapshots) {
    for (const m of snap.matches ?? []) {
      const day = m.kickoff?.slice(0, 10);
      if (!day) continue;
      // Ensimmäinen osuma voittaa: uusin snapshot annetaan ensin
      const key = joinKey(day, m.home.name, m.away.name);
      if (!known.has(key)) known.set(key, m.id);
    }
  }

  return fixtures.map((f) => {
    const id = known.get(joinKey(f.date, f.home, f.away));
    return id ? { ...f, match_id: id, has_odds: true } : f;
  });
}

/**
 * Ottelut jotka VAIN snapshot tuntee.
 *
 * ESPN on ensisijainen lähde, mutta se ei ole aukoton: `fin.1` palauttaa
 * HTTP 200 ja tyhjän listan vaikka Veikkausliigaa pelataan. Ilman tätä
 * täydennystä seurattu sarja katoaisi kalenterista kokonaan, vaikka meillä
 * on siitä kertoimet — ja käyttäjä lukisi tyhjän päivän niin ettei otteluita
 * ole, kun tosiasiassa vain ohjelmalähde vaikeni.
 *
 * Nämä rivit saavat `espn_id`:kseen match_id:n, koska ESPN-tunnistetta ei ole.
 * Se on eri avaruus, mutta yksikäsitteinen, ja maaliaikajana jää saamatta —
 * mikä on parempi kuin ottelun katoaminen.
 */
export function fixturesFromSnapshots(
  snapshots: Snapshot[],
  known: Set<string>,
  now: Date
): FixtureMatch[] {
  const out = new Map<string, FixtureMatch>();

  for (const snap of snapshots) {
    for (const m of snap.matches ?? []) {
      if (!m.kickoff) continue;
      const date = m.kickoff.slice(0, 10);
      const key = joinKey(date, m.home.name, m.away.name);
      if (known.has(key) || out.has(key)) continue;

      const sportKey = m.id.split(':')[0];
      out.set(key, {
        espn_id: m.id,
        match_id: m.id,
        date,
        kickoff: m.kickoff,
        sport_key: sportKey,
        league: m.league || leagueName(sportKey),
        home: m.home.name,
        away: m.away.name,
        status: Date.parse(m.kickoff) > now.getTime() ? 'upcoming' : 'finished',
        home_score: null,
        away_score: null,
        has_odds: true,
      });
    }
  }

  return [...out.values()];
}

// ─── Päivien kokoaminen ───────────────────────────────────────────────────

/**
 * Kokoa päivälista. Vain päivät joilla on otteluita — käyttäjä ei halua
 * selata tyhjien päivien läpi, ja tyhjä päivä aikajanalla näyttää virheeltä.
 */
export function buildDays(fixtures: FixtureMatch[]): FixtureDay[] {
  const byDay = new Map<string, FixtureMatch[]>();
  for (const f of fixtures) {
    const list = byDay.get(f.date);
    if (list) list.push(f);
    else byDay.set(f.date, [f]);
  }

  return [...byDay.entries()]
    .map(([date, list]) => ({
      date,
      matches: list.length,
      with_odds: list.filter((f) => f.has_odds).length,
      leagues: [...new Set(list.map((f) => f.league))].sort(),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Julkaisu ─────────────────────────────────────────────────────────────

/** Lue snapshotit joista kertoimet tunnistetaan: today.json + tuoreimmat historiasta */
export function readKnownSnapshots(publicDir: string, limit = 8): Snapshot[] {
  const out: Snapshot[] = [];
  const dataDir = path.join(publicDir, 'data');

  const today = path.join(dataDir, 'today.json');
  if (existsSync(today)) {
    try {
      out.push(JSON.parse(readFileSync(today, 'utf8')));
    } catch {
      console.warn('[Fixtures] today.json vioittunut — ohitetaan');
    }
  }

  const historyDir = path.join(dataDir, 'history');
  if (existsSync(historyDir)) {
    const files = readdirSync(historyDir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);
    for (const f of files) {
      try {
        out.push(JSON.parse(readFileSync(path.join(historyDir, f), 'utf8')));
      } catch {
        /* yksi vioittunut tiedosto ei saa estää kalenteria */
      }
    }
  }

  return out;
}

export async function buildFixtures(publicDir: string, now = new Date()): Promise<FixturesFile> {
  const from = new Date(now.getTime() - DAYS_BACK * 86_400_000);
  const to = new Date(now.getTime() + DAYS_FORWARD * 86_400_000);

  const all: FixtureMatch[] = [];
  for (const sportKey of config.odds.footballSports) {
    const league = leagueFor(sportKey);
    if (!league?.espn) {
      console.warn(`[Fixtures] ${sportKey}: ei ESPN-koodia — ohitetaan`);
      continue;
    }
    try {
      const events = await fetchLeagueFixtures(league.espn, from, to);
      const parsed = parseFixtures(events, sportKey, now);
      all.push(...parsed);
      console.log(`[Fixtures] ${league.name}: ${parsed.length} ottelua`);
    } catch (err) {
      // Yhden sarjan pettäminen ei saa tyhjentää koko kalenteria
      console.warn(`[Fixtures] ${league.name} epäonnistui: ${(err as Error).message}`);
    }
  }

  const snapshots = readKnownSnapshots(publicDir);
  const withOdds = attachOdds(all, snapshots);

  // Täydennä sarjoilla joita ESPN ei palauttanut (ks. fixturesFromSnapshots)
  const seen = new Set(withOdds.map((f) => joinKey(f.date, f.home, f.away)));
  const extra = fixturesFromSnapshots(snapshots, seen, now);
  if (extra.length) console.log(`[Fixtures] +${extra.length} ottelua snapshoteista joita ESPN ei palauttanut`);

  const merged = [...withOdds, ...extra];
  merged.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.home.localeCompare(b.home));

  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    range: { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) },
    days: buildDays(merged),
    matches: merged,
  };
}

export function writeFixtures(publicDir: string, file: FixturesFile): string {
  const dir = path.join(publicDir, 'data');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'fixtures.json');
  writeFileSync(out, JSON.stringify(file, null, 2) + '\n', 'utf8');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  buildFixtures(publicDir)
    .then((file) => {
      const out = writeFixtures(publicDir, file);
      const oddsDays = file.days.filter((d) => d.with_odds > 0).length;
      console.log(
        `\n${file.matches.length} ottelua · ${file.days.length} päivää joilla otteluita · ${oddsDays} päivää joilla kertoimia`
      );
      console.log(`✓ ${out}`);
    })
    .catch((err) => {
      console.error('[Fixtures]', err);
      process.exit(1);
    });
}
