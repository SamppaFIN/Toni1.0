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
 * Varalähde: sarjataulukko ESPN:n ottelutuloksista.
 *
 * Palauttaa null jos sarjalle ei ole ESPN-koodia tai haku pettää sekin.
 * TYHJÄ KAUSI HYLÄTÄÄN: nolla pelattua ottelua ei kerro joukkueista mitään,
 * ja tyhjä taulukko näyttäisi kutsujalle toimivalta lähteeltä (#103:n
 * emptySeason-ansa). Silloin on rehellisempi jäädä market-only-tilaan.
 *
 * Edellinen kausi haetaan myös: ilman sitä kolmen ottelun kutistus vetäisi
 * kaikki joukkueet sarjan keskitasoon ja malli sanoisi jokaisesta ottelusta
 * lähes samaa.
 */
async function espnFallback(sportKey: string, year: number, now: Date): Promise<LeagueStatsPair | null> {
  const { hasEspnStats, fetchEspnStatsPair } = await import('./stats-espn.js');
  if (!hasEspnStats(sportKey)) return null;

  try {
    const pair = await fetchEspnStatsPair(sportKey, year, now);
    if (!pair.current.teams.length) {
      console.warn(`[Stats] ${sportKey}: ESPN-varalähde palautti tyhjän kauden — ei käytetä`);
      return null;
    }
    const played = Math.round(pair.current.teams.reduce((s, t) => s + t.played, 0) / 2);
    console.log(
      `[Stats] ${sportKey}: VARALÄHDE ESPN — ${pair.current.teams.length} joukkuetta, ${played} ottelua` +
        `${pair.previous ? `, priori kaudelta ${pair.previous.season}` : ', ei prioria'}`
    );
    return pair;
  } catch (err) {
    console.warn(`[Stats] ${sportKey}: ESPN-varalähde epäonnistui myös — ${(err as Error).message}`);
    return null;
  }
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
    // Ensisijainen lähde petti. ENNEN tästä seurasi suoraan market-only, mutta
    // samat tulokset ovat ESPN:ssä ilmaiseksi ja sarjataulukko on niistä
    // johdettavissa — Elo laskettiin niistä jo ennestään (#57). Yleisin syy
    // tulla tänne on puuttuva FOOTBALL_DATA_TOKEN, jolloin koko jalkapallo
    // olisi ilman voimalukuja vaikka data on saatavilla.
    console.warn(`[Stats] ${sportKey} (${year}): haku epäonnistui — ${(err as Error).message}`);

    const espn = await espnFallback(sportKey, year, now);
    if (espn) return espn;

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
