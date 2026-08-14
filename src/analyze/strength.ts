// Tiketti #24 (vaihtoehto C): Joukkuevoimat kahdesta kaudesta
//
// Ongelma jonka tämä ratkaisee: kauden alussa nykyisen kauden data on hyödytöntä.
// Kolme ottelua kertoo maalikeskiarvon jonka luottamusväli on käytännössä koko
// mahdollisten arvojen alue. `shrinkStrength()` (poisson.ts) kutistaa voiman
// kohti sarjan keskitasoa 1.0, mikä on turvallista muttei kovin informatiivista:
// se sanoo "en tiedä mitään", vaikka tiedämme paljon — viime kauden.
//
// Parempi priori on EDELLISEN KAUDEN voima:
//
//   voima = w × tämä_kausi + (1 − w) × edellinen_kausi,   w = pelatut/(pelatut+k)
//
// Kauden alussa (w ≈ 0) luotetaan viime kauteen. Kauden edetessä nykyinen data
// ottaa vallan. Jos edellistä kautta ei ole (nousija, uusi sarja), kutistetaan
// sarjan keskitasoon kuten ennen.
//
// Yksi varaus: edellinen kausi on eri joukkue. Pelaajat vaihtuvat, valmentaja
// vaihtuu, nousija kohtaa kovempaa vastusta. Siksi edellisen kauden voimaa
// vaimennetaan kohti keskitasoa REGRESSION-kertoimella ennen käyttöä.

import { pathToFileURL } from 'node:url';
import { TeamStrength, LeagueAverages, teamStrength, shrinkStrength, DEFAULT_SHRINKAGE_K } from './poisson.js';
import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';
import { findTeam } from '../ingest/team-match.js';

/**
 * Kuinka paljon edellisen kauden voimasta jää voimaan.
 * 0.75 = neljäsosa erosta keskitasoon regressoituu pois kausien välissä.
 * Empiirinen arvio: joukkueiden suhteellinen voima on melko pysyvää, mutta
 * ei täysin — kokoonpanot muuttuvat.
 */
export const SEASON_REGRESSION = 0.75;

export interface StrengthResult {
  strength: TeamStrength;
  /** Mistä voima muodostui — näytetään ottelukortilla läpinäkyvyyden vuoksi */
  basis: 'current-season' | 'blended' | 'previous-season' | 'league-average';
  /** Nykyisen kauden paino blendissä */
  currentWeight: number;
  playedThisSeason: number;
}

/** Raakavoima joukkueen kausitilastoista */
export function rawStrength(stats: TeamSeasonStats, league: LeagueAverages): TeamStrength {
  if (!stats.played) return { attack: 1, defense: 1 };
  return teamStrength(stats.gf / stats.played, stats.ga / stats.played, league);
}

/** Regressoi voima kohti sarjan keskitasoa annetulla kertoimella */
export function regressToMean(s: TeamStrength, factor: number): TeamStrength {
  return {
    attack: 1 + (s.attack - 1) * factor,
    defense: 1 + (s.defense - 1) * factor,
  };
}

/**
 * Yhdistä nykyinen ja edellinen kausi joukkuevoimaksi.
 *
 * @param current  tämän kauden tilastot
 * @param previous edellisen kauden tilastot, tai null jos ei saatavilla
 * @param league   sarjan maalikeskiarvot (nykyiseltä kaudelta)
 * @param k        kutistuksen k — montako ottelua kunnes nykyinen kausi painaa puolet
 */
export function combineSeasons(
  current: TeamSeasonStats | null,
  previous: TeamSeasonStats | null,
  league: LeagueAverages,
  k: number = DEFAULT_SHRINKAGE_K
): StrengthResult {
  const played = current?.played ?? 0;

  // Ei dataa lainkaan → sarjan keskitaso
  if (!current && !previous) {
    return { strength: { attack: 1, defense: 1 }, basis: 'league-average', currentWeight: 0, playedThisSeason: 0 };
  }

  // Vain edellinen kausi (kausi ei ole alkanut) → regressoitu viime kausi
  if (!played && previous) {
    return {
      strength: regressToMean(rawStrength(previous, league), SEASON_REGRESSION),
      basis: 'previous-season',
      currentWeight: 0,
      playedThisSeason: 0,
    };
  }

  // Vain nykyinen kausi (nousija tai puuttuva historia) → kutistus keskitasoon
  if (!previous && current) {
    return {
      strength: shrinkStrength(rawStrength(current, league), played, k),
      basis: played >= k * 3 ? 'current-season' : 'league-average',
      currentWeight: played / (played + k),
      playedThisSeason: played,
    };
  }

  // Molemmat → painotettu blendi
  const w = played / (played + k);
  const cur = rawStrength(current!, league);
  const prev = regressToMean(rawStrength(previous!, league), SEASON_REGRESSION);

  return {
    strength: {
      attack: w * cur.attack + (1 - w) * prev.attack,
      defense: w * cur.defense + (1 - w) * prev.defense,
    },
    basis: w > 0.8 ? 'current-season' : 'blended',
    currentWeight: w,
    playedThisSeason: played,
  };
}

/**
 * Hae joukkueen voima sarjatilastoista nimen perusteella.
 * Palauttaa null jos joukkuetta ei löytynyt — kutsuja päättää putoaako
 * market-only-tilaan.
 */
export function strengthForTeam(
  teamName: string,
  currentSeason: LeagueSeasonStats,
  previousSeason: LeagueSeasonStats | null,
  k?: number
): (StrengthResult & { stats: TeamSeasonStats }) | null {
  const current = findTeam(currentSeason.teams, teamName);
  if (!current) return null;

  const previous = previousSeason ? findTeam(previousSeason.teams, teamName) : null;
  const league: LeagueAverages = {
    homeGoals: currentSeason.homeGoalsAvg,
    awayGoals: currentSeason.awayGoalsAvg,
  };

  return { ...combineSeasons(current, previous, league, k), stats: current };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const league: LeagueAverages = { homeGoals: 1.55, awayGoals: 1.25 };
  const mk = (played: number, gf: number, ga: number): TeamSeasonStats => ({
    name: 'Testi',
    aliases: [],
    rank: 1,
    played,
    won: 0,
    draw: 0,
    lost: 0,
    gf,
    ga,
    home_played: null,
    home_gf: null,
    home_ga: null,
    away_played: null,
    away_gf: null,
    away_ga: null,
    form: null,
    points: 0,
  });

  // Vahva viime kausi (71 maalia 38 ottelussa), nykyinen kausi juuri alkanut
  const prev = mk(38, 71, 27);
  console.log('Vahva joukkue viime kaudelta (71-27 / 38 ottelua):\n');
  console.log('  pelatut  hyökkäys  puolustus  peruste            nyk. paino');
  for (const played of [0, 1, 3, 6, 12, 24, 38]) {
    const cur = played ? mk(played, Math.round(1.9 * played), Math.round(0.8 * played)) : null;
    const r = combineSeasons(cur, prev, league);
    console.log(
      `  ${String(played).padStart(7)}  ${r.strength.attack.toFixed(3).padStart(8)}  ${r.strength.defense.toFixed(3).padStart(9)}  ${r.basis.padEnd(18)} ${(r.currentWeight * 100).toFixed(0)}%`
    );
  }

  console.log('\nVertailu — ilman edellisen kauden prioria (pelkkä kutistus keskitasoon):');
  for (const played of [0, 3, 6]) {
    const cur = played ? mk(played, Math.round(1.9 * played), Math.round(0.8 * played)) : null;
    const withPrior = combineSeasons(cur, prev, league).strength.attack;
    const withoutPrior = combineSeasons(cur, null, league).strength.attack;
    console.log(`  ${played} ottelua: priorilla ${withPrior.toFixed(3)}, ilman ${withoutPrior.toFixed(3)}`);
  }
}
