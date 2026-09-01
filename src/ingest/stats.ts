// Tiketti #24: Tilastolähteiden rekisteri
//
// Yksi sarja, yksi adapteri. Kertoimet tulevat aina The Odds API:sta, mutta
// tunnusluvut riippuvat sarjasta:
//
//   Veikkausliiga             → Wikipedia (sarjataulukko)
//   Valioliiga, Championship, → football-data.org (API, mitatut koti/vieras-splitit)
//   La Liga, Serie A, ym.
//   muut                      → ei lähdettä → malli jää market-only-tilaan
//
// Jokainen adapteri hakee sekä nykyisen että edellisen kauden: edellinen kausi
// on priori jolla kauden alun otantaongelma vältetään (ks. analyze/strength.ts).

import { LeagueSeasonStats } from '../types-football.js';
import { fetchLeagueStats } from './stats-footballdata.js';
import { fetchVeikkausliigaStats } from './stats-wikipedia.js';

export interface LeagueStatsPair {
  current: LeagueSeasonStats;
  previous: LeagueSeasonStats | null;
}

/**
 * The Odds APIn sarjatunniste → tilastolähde.
 * Kausivuosi annetaan erikseen, koska sarjat eivät ala samaan aikaan:
 * Veikkausliiga on kalenterikausi, Valioliiga syksy–kevät.
 */
type StatsFetcher = (year: number) => Promise<LeagueSeasonStats>;

const SOURCES: Record<string, { fetch: StatsFetcher; seasonYear: (now: Date) => number }> = {
  soccer_finland_veikkausliiga: {
    fetch: fetchVeikkausliigaStats,
    // Kalenterikausi: kausi 2026 pelataan vuonna 2026
    seasonYear: (now) => now.getUTCFullYear(),
  },
  soccer_epl: {
    fetch: (year) => fetchLeagueStats('PL', year),
    // Syksy–kevät: kausi "2026" alkaa elokuussa 2026 ja päättyy keväällä 2027
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_efl_champ: {
    fetch: (year) => fetchLeagueStats('ELC', year),
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_spain_la_liga: {
    fetch: (year) => fetchLeagueStats('PD', year),
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_italy_serie_a: {
    fetch: (year) => fetchLeagueStats('SA', year),
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_germany_bundesliga: {
    fetch: (year) => fetchLeagueStats('BL1', year),
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_france_ligue_one: {
    fetch: (year) => fetchLeagueStats('FL1', year),
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_netherlands_eredivisie: {
    fetch: (year) => fetchLeagueStats('DED', year),
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_portugal_primeira_liga: {
    fetch: (year) => fetchLeagueStats('PPL', year),
    seasonYear: seasonYearAutumnSpring,
  },
  soccer_uefa_champs_league: {
    fetch: (year) => fetchLeagueStats('CL', year),
    seasonYear: seasonYearAutumnSpring,
  },
};

/** Syksy–kevät-kaudessa heinäkuusta eteenpäin ollaan jo uudessa kaudessa */
function seasonYearAutumnSpring(now: Date): number {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

export function hasStatsSource(sportKey: string): boolean {
  return sportKey in SOURCES;
}

/**
 * Hae sarjan nykyisen ja edellisen kauden tilastot.
 *
 * Palauttaa null jos lähdettä ei ole tai haku epäonnistuu. Epäonnistuminen ei
 * kaada putkea: kertoimet ovat silti käytettävissä ja malli jää market-only-
 * tilaan. Raaputus on hauras, ja hauras lähde ei saa estää koko analyysiä.
 */
export async function fetchStatsFor(sportKey: string, now = new Date()): Promise<LeagueStatsPair | null> {
  // Tiketti #92: Liigalla on oma lahde joka tuottaa SEKA nykyisen etta
  // edellisen kauden yhdella kutsulla -- rakenne on eri kuin
  // jalkapallolahteilla, joten se ohitetaan tassa eika SOURCES-kartassa.
  if (sportKey === 'icehockey_liiga') {
    const { fetchLiigaStats } = await import('./stats-liiga.js');
    return fetchLiigaStats(now);
  }

  const source = SOURCES[sportKey];
  if (!source) {
    console.log(`[Stats] ${sportKey}: ei tilastolähdettä — malli jää market-only-tilaan`);
    return null;
  }

  const year = source.seasonYear(now);

  let current: LeagueSeasonStats;
  try {
    current = await source.fetch(year);
  } catch (err) {
    console.warn(`[Stats] ${sportKey} (${year}): haku epäonnistui — ${(err as Error).message}`);
    console.warn('[Stats] → malli jää market-only-tilaan tälle sarjalle');
    return null;
  }

  // Edellinen kausi on priori. Jos sitä ei saa, se ei ole virhe —
  // kutistus sarjan keskitasoon toimii varamenetelmänä.
  let previous: LeagueSeasonStats | null = null;
  try {
    previous = await source.fetch(year - 1);
  } catch (err) {
    console.log(`[Stats] ${sportKey} (${year - 1}): edellistä kautta ei saatu — käytetään pelkkää kutistusta`);
  }

  const playedTotal = current.teams.reduce((s, t) => s + t.played, 0);
  console.log(
    `[Stats] ${current.league} ${current.season}: ${current.teams.length} joukkuetta, ${Math.round(playedTotal / 2)} ottelua pelattu` +
      `${previous ? `, priori kaudelta ${previous.season}` : ', ei prioria'} (${current.source})`
  );

  return { current, previous };
}
