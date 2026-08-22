// Tiketti #26: Poisson-malli jalkapallolle
// Elo riittää jääkiekon 1X2:een, mutta jalkapallossa arvo asuu maalimarkkinoissa
// (O/U 2.5, BTTS, tarkat tulokset). Poisson antaa kaikki nämä samasta λ-parista.
//
// λ_koti   = kotijoukkueen hyökkäysvoima × vierasjoukkueen puolustusheikkous × sarjan koti-ka
// λ_vieras = vierasjoukkueen hyökkäysvoima × kotijoukkueen puolustusheikkous × sarjan vieras-ka
//
// Dixon–Coles-korjaus (rho) kompensoi Poissonin tunnetun heikkouden: se aliarvioi
// matalat tulokset (0-0, 1-0, 0-1, 1-1) joita jalkapallossa on selvästi liikaa.

import { pathToFileURL } from 'node:url';
import { SideProbs, ScoreProb } from '../types-football.js';

/** Sarjan keskiarvot — nämä normalisoivat joukkuevoimat */
export interface LeagueAverages {
  /** Kotijoukkueiden maalikeskiarvo sarjassa, tyypillisesti ~1.5 */
  homeGoals: number;
  /** Vierasjoukkueiden maalikeskiarvo sarjassa, tyypillisesti ~1.2 */
  awayGoals: number;
}

/** Joukkueen suhteellinen voima — 1.0 = sarjan keskitaso */
export interface TeamStrength {
  /** > 1 = tekee enemmän maaleja kuin keskiverto */
  attack: number;
  /** > 1 = päästää enemmän maaleja kuin keskiverto (siis heikompi puolustus) */
  defense: number;
}

export const DEFAULT_LEAGUE: LeagueAverages = { homeGoals: 1.5, awayGoals: 1.2 };

/**
 * Kuinka monen ottelun painoarvo priorilla (DEFAULT_LEAGUE) on sarjan
 * maalikeskiarvoja laskettaessa.
 *
 * MIKSI TÄMÄ ON OLEMASSA — todellinen tuotantovika 22.8.2026:
 * Valioliigan avauskierroksella oli pelattu tasan yksi ottelu (Arsenal 3–0
 * Coventry). Vierasjoukkueet olivat siis tehneet 0 maalia 1 ottelussa, joten
 * mitattu awayGoalsAvg oli 0.00. Siitä seurasi λ_vieras = 0 KAIKKIIN yhdeksään
 * Valioliigan otteluun: malli väitti että jokainen vierasjoukkue tekee nolla
 * maalia varmuudella (btts = 0, vierasvoitto = 0), ja tuotti +292 %:n
 * "edgejä" jotka olivat puhdasta laskentaroskaa.
 *
 * Vanha suoja `homeMatches > 0 && awayMatches > 0` esti vain nollalla jaon,
 * ei mieletöntä otosta. Yksi ottelu läpäisi portin.
 *
 * Painoksi on valittu 10 ottelua tarkoituksellisen pieneksi: tehtävä on tehdä
 * yhden ottelun otoksesta vaaraton, EI korvata mitattua dataa. Sarjat eroavat
 * oikeasti toisistaan (Veikkausliiga ei ole Valioliiga), joten liian vahva
 * globaali priori vääristäisi juuri sen eron jota malli tarvitsee.
 *
 * Vaikutus: 1 ottelu → priori kantaa (0 maalia → 1.09, ei 0.00). 38 ottelua →
 * mitattu data painaa 79 %. Täysi kausi → priori on kohinaa.
 */
export const LEAGUE_AVG_PRIOR_MATCHES = 10;

/**
 * Sarjan maalikeskiarvot kutistettuna prioriin otoskoon mukaan.
 *
 *   ka = (mitatut_maalit + priori × K) / (ottelut + K)
 *
 * Palauttaa aina positiiviset keskiarvot, joten λ ei voi mennä nollaan
 * vaikka sarjassa ei olisi tehty yhtään maalia.
 */
export function shrinkLeagueAverages(
  homeGoals: number,
  homeMatches: number,
  awayGoals: number,
  awayMatches: number,
  prior: LeagueAverages = DEFAULT_LEAGUE,
  k: number = LEAGUE_AVG_PRIOR_MATCHES
): LeagueAverages {
  const shrink = (goals: number, matches: number, priorMean: number) => {
    const g = Number.isFinite(goals) && goals >= 0 ? goals : 0;
    const n = Number.isFinite(matches) && matches > 0 ? matches : 0;
    return (g + priorMean * k) / (n + k);
  };
  return {
    homeGoals: shrink(homeGoals, homeMatches, prior.homeGoals),
    awayGoals: shrink(awayGoals, awayMatches, prior.awayGoals),
  };
}

/** Dixon–Coles-parametri. 0 = puhdas Poisson. Empiirisesti ~-0.03…-0.15. */
export const DEFAULT_RHO = -0.05;

const MAX_GOALS = 8;

/**
 * Laske joukkueen hyökkäys- ja puolustusvoima maalikeskiarvoista.
 * Voimat ovat suhdelukuja sarjan keskiarvoon — siksi ne ovat vertailukelpoisia sarjojen yli.
 */
export function teamStrength(
  goalsForPerGame: number,
  goalsAgainstPerGame: number,
  league: LeagueAverages = DEFAULT_LEAGUE
): TeamStrength {
  const avgGoals = (league.homeGoals + league.awayGoals) / 2;
  if (avgGoals <= 0) return { attack: 1, defense: 1 };
  return {
    attack: goalsForPerGame / avgGoals,
    defense: goalsAgainstPerGame / avgGoals,
  };
}

/**
 * Kutistuskerroin otoskoon mukaan. Kolmen ottelun maalikeskiarvo ei ole
 * voimaestimaatti vaan kohinaa: 3 ottelua 2.2 maalia/peli voi olla 6-0-voitto
 * ja kaksi 0-0:aa. Kutistetaan voima kohti sarjan keskitasoa (1.0) sitä
 * enemmän mitä vähemmän otteluita on pelattu.
 *
 *   paino = pelatut / (pelatut + k)
 *
 * k = 6 tarkoittaa että 6 ottelun jälkeen luotetaan puoliksi omaan dataan.
 * Ilman tätä malli tuottaa alkukaudesta 10 %:n "edgejä" jotka ovat pelkkää
 * otantavirhettä — ja juuri niihin vedonlyöjä palaa rahansa.
 */
export const DEFAULT_SHRINKAGE_K = 6;

export function shrinkStrength(
  strength: TeamStrength,
  gamesPlayed: number,
  k: number = DEFAULT_SHRINKAGE_K
): TeamStrength {
  const played = Math.max(0, gamesPlayed);
  const weight = played / (played + k);
  return {
    attack: 1 + (strength.attack - 1) * weight,
    defense: 1 + (strength.defense - 1) * weight,
  };
}

/** Odotetut maalimäärät (λ) ottelulle */
export function expectedGoals(
  home: TeamStrength,
  away: TeamStrength,
  league: LeagueAverages = DEFAULT_LEAGUE
): { lambdaHome: number; lambdaAway: number } {
  return {
    lambdaHome: home.attack * away.defense * league.homeGoals,
    lambdaAway: away.attack * home.defense * league.awayGoals,
  };
}

/** Poissonin pistetodennäköisyys: P(X = k) kun keskiarvo on lambda */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // Lasketaan logaritmeissa jotta k! ei ylivuoda
  let logFactorial = 0;
  for (let i = 2; i <= k; i++) logFactorial += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial);
}

/**
 * Dixon–Coles-kerroin τ matalille tuloksille.
 * Nostaa 0-0 ja 1-1 todennäköisyyttä, laskee 1-0 ja 0-1:n — juuri niin kuin
 * jalkapallossa oikeasti käy, koska maalit eivät ole täysin riippumattomia.
 */
function tau(x: number, y: number, lambdaHome: number, lambdaAway: number, rho: number): number {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

/**
 * Tulosmatriisi: matrix[kotimaalit][vierasmaalit] = todennäköisyys.
 * Normalisoitu niin että kaikkien alkioiden summa = 1.0 (myös rho-korjauksen jälkeen).
 */
export function scoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = DEFAULT_RHO,
  maxGoals: number = MAX_GOALS
): number[][] {
  const matrix: number[][] = [];
  let total = 0;

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway) * tau(h, a, lambdaHome, lambdaAway, rho);
      // τ voi teoriassa mennä negatiiviseksi äärimmäisillä rho-arvoilla — leikataan nollaan
      matrix[h][a] = Math.max(0, p);
      total += matrix[h][a];
    }
  }

  // Normalisointi: rho-korjaus ja matriisin katkaisu (maxGoals) vievät summan pois ykkösestä
  if (total > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) matrix[h][a] /= total;
    }
  }

  return matrix;
}

/** 1X2-todennäköisyydet tulosmatriisista */
export function outcomeProbs(matrix: number[][]): SideProbs {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (h > a) home += matrix[h][a];
      else if (h === a) draw += matrix[h][a];
      else away += matrix[h][a];
    }
  }
  return { home, draw, away };
}

/** P(maaleja yhteensä > line). Line on puolilukuinen (2.5) → ei tasapelin mahdollisuutta. */
export function overProb(matrix: number[][], line = 2.5): number {
  let over = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (h + a > line) over += matrix[h][a];
    }
  }
  return over;
}

/** P(molemmat joukkueet tekevät maalin) */
export function bttsProb(matrix: number[][]): number {
  let btts = 0;
  for (let h = 1; h < matrix.length; h++) {
    for (let a = 1; a < matrix[h].length; a++) btts += matrix[h][a];
  }
  return btts;
}

/** N todennäköisintä tarkkaa tulosta, laskevassa järjestyksessä */
export function topScores(matrix: number[][], n = 5): ScoreProb[] {
  const all: ScoreProb[] = [];
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) all.push({ score: `${h}-${a}`, p: matrix[h][a] });
  }
  return all.sort((x, y) => y.p - x.p).slice(0, n);
}

export interface PoissonPrediction {
  lambdaHome: number;
  lambdaAway: number;
  probs: SideProbs;
  over25: number;
  btts: number;
  topScores: ScoreProb[];
}

/**
 * Ennuste suoraan λ-arvoista.
 *
 * Tarvitaan kun λ:aa on säädetty uutistiedon perusteella (tiketti 29):
 * joukkuevoimista lasketaan λ, siihen tehdään loukkaantumiskorjaus, ja
 * lopullinen jakauma lasketaan korjatuista arvoista.
 */
export function predictFromLambda(
  lambdaHome: number,
  lambdaAway: number,
  rho: number = DEFAULT_RHO
): PoissonPrediction {
  const matrix = scoreMatrix(lambdaHome, lambdaAway, rho);
  return {
    lambdaHome,
    lambdaAway,
    probs: outcomeProbs(matrix),
    over25: overProb(matrix, 2.5),
    btts: bttsProb(matrix),
    topScores: topScores(matrix, 5),
  };
}

/** Koko Poisson-ennuste yhdellä kutsulla */
export function predictPoisson(
  home: TeamStrength,
  away: TeamStrength,
  league: LeagueAverages = DEFAULT_LEAGUE,
  rho: number = DEFAULT_RHO
): PoissonPrediction {
  const { lambdaHome, lambdaAway } = expectedGoals(home, away, league);
  const matrix = scoreMatrix(lambdaHome, lambdaAway, rho);
  return {
    lambdaHome,
    lambdaAway,
    probs: outcomeProbs(matrix),
    over25: overProb(matrix, 2.5),
    btts: bttsProb(matrix),
    topScores: topScores(matrix, 5),
  };
}

/**
 * Sovita λ uutis-/loukkaantumistiedon perusteella.
 * delta on suhteellinen: -0.10 = 10 % vähemmän odotettuja maaleja.
 */
export function adjustLambda(lambda: number, delta: number): number {
  return Math.max(0.1, lambda * (1 + delta));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Tasavahvat keskitason joukkueet
  const even = predictPoisson({ attack: 1, defense: 1 }, { attack: 1, defense: 1 });
  console.log('Tasavahvat (attack 1.0, defense 1.0):');
  console.log(`  λ: ${even.lambdaHome.toFixed(2)} - ${even.lambdaAway.toFixed(2)}`);
  console.log(`  1X2: ${(even.probs.home * 100).toFixed(1)}% / ${(even.probs.draw * 100).toFixed(1)}% / ${(even.probs.away * 100).toFixed(1)}%`);
  console.log(`  Yli 2.5: ${(even.over25 * 100).toFixed(1)}%  BTTS: ${(even.btts * 100).toFixed(1)}%`);
  console.log(`  Todennäköisimmät: ${even.topScores.map((s) => `${s.score} (${(s.p * 100).toFixed(1)}%)`).join(', ')}`);

  // Vahva koti vs. heikko vieras
  const strong = predictPoisson({ attack: 1.4, defense: 0.7 }, { attack: 0.8, defense: 1.3 });
  console.log('\nVahva koti vs. heikko vieras:');
  console.log(`  λ: ${strong.lambdaHome.toFixed(2)} - ${strong.lambdaAway.toFixed(2)}`);
  console.log(`  1X2: ${(strong.probs.home * 100).toFixed(1)}% / ${(strong.probs.draw * 100).toFixed(1)}% / ${(strong.probs.away * 100).toFixed(1)}%`);
  console.log(`  Yli 2.5: ${(strong.over25 * 100).toFixed(1)}%  BTTS: ${(strong.btts * 100).toFixed(1)}%`);
}
