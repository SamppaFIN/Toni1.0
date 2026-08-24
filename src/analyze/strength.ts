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

/**
 * Kuinka monen nykyisen kauden ottelun arvoinen EDELLINEN kausi on
 * mallin luottamusta arvioitaessa.
 *
 * Edellinen kausi on aitoa tietoa, mutta se on vuoden vanhaa ja
 * SEASON_REGRESSION on jo vaimentanut sen eroja. Kahdeksan ottelua on
 * konservatiivinen arvio: se riittää tekemään mallista puoliksi
 * uskottavan mutta ei anna sen kuvitella tietävänsä yhtä paljon kuin
 * kaudella joka on oikeasti pelattu.
 */
export const PREVIOUS_SEASON_WORTH = 8;

/**
 * Kuinka monta tehollista ottelua tarvitaan ennen kuin malli saa PUOLET
 * täydestä painostaan markkinaa vastaan.
 */
export const CONFIDENCE_HALF_POINT = 8;

/**
 * Nousijan prioria (PROMOTED_STRENGTH) vastaava ottelumäärä. Selvästi pienempi
 * kuin PREVIOUS_SEASON_WORTH: yleinen sääntö "nousijat ovat heikompia" on
 * paljon vähemmän informatiivinen kuin joukkueen oma edellinen kausi.
 */
export const PROMOTED_PRIOR_WORTH = 3;

/**
 * Mallin luottamus 0–1 — kuinka paljon dataa voimaluvun takana oikeasti on.
 *
 * MIKSI TÄMÄ ON OLEMASSA — kolmas tuotantovika 22.8.2026:
 * Blend-paino oli kiinteä 0.35 riippumatta siitä tiesikö malli mitään.
 * Kauden avauskierroksella (played = 0) voimaluvut tulivat regressoidusta
 * viime kaudesta ja olivat litistyneet 1.0:n ympärille — Liverpoolin
 * hyökkäysvoima oli 1.18 — mutta malli sai silti 35 %:n painon 10 toimiston
 * markkinaa ja Pinnaclen sharp-ankkuria vastaan. Tulos: Newcastle sai 31 %
 * kun markkina sanoi 25 %, ja siitä syntyi +40 %:n "edge" joka ei ollut
 * arvoa vaan mallin tietämättömyyttä.
 *
 * Kun mallilla ei ole dataa, oikea paino ei ole 0.35 vaan lähellä nollaa:
 * Pinnaclen linja sisältää enemmän informaatiota kuin vuoden vanha
 * regressoitu Poisson. Kauden edetessä paino nousee itsestään.
 *
 * NOUSIJA (ei edellistä kautta samassa sarjassa) saa luottamuksen 0, jolloin
 * malli ei osallistu lainkaan — juuri se tapaus jossa se oli pahimmin väärässä
 * (Hull City "edge +292 %", Coventry "+75 %").
 */
export function modelConfidence(playedThisSeason: number, hasPreviousSeason: boolean): number {
  const played = Number.isFinite(playedThisSeason) && playedThisSeason > 0 ? playedThisSeason : 0;
  const effective = played + (hasPreviousSeason ? PREVIOUS_SEASON_WORTH : 0);
  return effective / (effective + CONFIDENCE_HALF_POINT);
}

/**
 * Ottelun mallin luottamus: HEIKOMMAN puolen mukaan.
 *
 * Ottelun ennuste on vain niin hyvä kuin sen huonommin tunnettu joukkue.
 * Jos toinen on nousija josta ei tiedetä mitään, koko ottelun arvio on
 * epäluotettava vaikka toisesta tiedettäisiin kaikki.
 */
export function matchConfidence(home: StrengthResult, away: StrengthResult): number {
  return Math.min(sideConfidence(home), sideConfidence(away));
}

/**
 * Yhden joukkueen luottamus. Kolme tasoa:
 *   - edellinen kausi samassa sarjassa → PREVIOUS_SEASON_WORTH
 *   - nousija (PROMOTED_STRENGTH-priori) → PROMOTED_PRIOR_WORTH, heikompi
 *     mutta ei nolla: tiedämme nousijoista jotain, emme vain paljon
 *   - ei kumpaakaan → pelkkä kausidata
 */
function sideConfidence(s: StrengthResult): number {
  if (s.basis === 'league-average') {
    const effective = s.playedThisSeason + PROMOTED_PRIOR_WORTH;
    return effective / (effective + CONFIDENCE_HALF_POINT);
  }
  return modelConfidence(s.playedThisSeason, true);
}

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

/**
 * Nousijan priori. Empiirinen sääntö ylimmissä sarjoissa: noussut joukkue
 * tekee noin 15 % vähemmän ja päästää noin 15 % enemmän maaleja kuin sarjan
 * keskiverto. Luku on tarkoituksella maltillinen — se on priori jota data
 * korjaa, ei väite jonka pitäisi kestää yksinään.
 */
export const PROMOTED_STRENGTH: TeamStrength = { attack: 0.85, defense: 1.15 };

/**
 * Siirrä voimaa kohti prioria sitä enemmän mitä vähemmän otteluita on pelattu.
 * Kun `played` = 0, tulos on priori; kun dataa kertyy, se ottaa vallan.
 */
function blendToward(strength: TeamStrength, prior: TeamStrength, k: number, played: number): TeamStrength {
  const w = played / (played + k);
  return {
    attack: w * strength.attack + (1 - w) * prior.attack,
    defense: w * strength.defense + (1 - w) * prior.defense,
  };
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
  k: number = DEFAULT_SHRINKAGE_K,
  /** Nousijan oma priori alemmasta sarjasta (tiketti #68). Oletus = keskiverto nousija. */
  promotedPrior: TeamStrength = PROMOTED_STRENGTH
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

  // Vain nykyinen kausi → joukkue on noussut sarjaan (ylimmässä sarjassa
  // "ei edellistä kautta" tarkoittaa käytännössä nousijaa).
  //
  // Kutistus SARJAN KESKITASOON olisi väärä priori: se väittää nousijan olevan
  // keskiverto pääsarjajoukkue, mitä se ei ole. Juuri tämä tuotti 22.8.2026
  // pahimmat väärät positiiviset — Hull City "edge +292 %" ja Coventry "+75 %"
  // syntyivät siitä että malli piti nousijaa Manchester Unitedin veroisena.
  //
  // PROMOTED_STRENGTH on empiirinen sääntö: nousijat tekevät vähemmän ja
  // päästävät enemmän maaleja kuin sarjan keskiverto. Se on heikko priori
  // muttei tyhjä — ja heikko oikea priori on parempi kuin vahva väärä.
  if (!previous && current) {
    const enoughData = played >= k * 3;
    return {
      strength: enoughData
        ? shrinkStrength(rawStrength(current, league), played, k)
        : blendToward(shrinkStrength(rawStrength(current, league), played, k), promotedPrior, k, played),
      basis: enoughData ? 'current-season' : 'league-average',
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
  k?: number,
  /** Nousijan priori alemmasta sarjasta; ilman tata kaytetaan keskiverto nousijaa */
  promotedPrior?: TeamStrength
): (StrengthResult & { stats: TeamSeasonStats }) | null {
  const current = findTeam(currentSeason.teams, teamName);
  if (!current) return null;

  const previous = previousSeason ? findTeam(previousSeason.teams, teamName) : null;
  const league: LeagueAverages = {
    homeGoals: currentSeason.homeGoalsAvg,
    awayGoals: currentSeason.awayGoalsAvg,
  };

  return { ...combineSeasons(current, previous, league, k, promotedPrior), stats: current };
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
