// Tiketti #12: Otteluennusteet + onnistumisseuranta
// Ennustaa jokaisen ottelun Elo-pohjaisesti ja träkkää osumatarkkuuden.

import { Winner, GamePrediction } from '../types.js';

const HOME_ADVANTAGE = 40; // kotietu Elo-pisteissä (Liigassa ~55% kotivoittoja)

/** Laske voittotodennäköisyys Elo-kaavalla + kotiedulla */
export function winProbHome(homeElo: number, awayElo: number): number {
  return 1 / (1 + Math.pow(10, (awayElo - (homeElo + HOME_ADVANTAGE)) / 400));
}

export interface PredictionResult {
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  predicted_winner: Winner;
}

/**
 * Generoi 1X2-ennuste Elo-lukemista.
 * Tasapelin tn estimoidaan Elo-eron perusteella — pieni ero → suurempi tasapelin tn.
 */
export function predictGame(homeElo: number, awayElo: number): PredictionResult {
  const rawHome = winProbHome(homeElo, awayElo);

  // Estimoidaan tasapelin todennäköisyys: max kun Elo-ero ~0, pienenee eron kasvaessa
  const eloDiff = Math.abs((homeElo + HOME_ADVANTAGE) - awayElo);
  const drawFactor = Math.max(0.15, 0.28 - eloDiff / 1200); // 15-28% tasapeli

  const homeProb = rawHome * (1 - drawFactor);
  const awayProb = (1 - rawHome) * (1 - drawFactor);
  const drawProb = drawFactor;

  // Normalisoidaan varmuuden vuoksi
  const total = homeProb + drawProb + awayProb;

  const winner: Winner =
    homeProb > drawProb && homeProb > awayProb ? 'home' :
    awayProb > homeProb && awayProb > drawProb ? 'away' : 'draw';

  return {
    home_win_prob: homeProb / total,
    draw_prob: drawProb / total,
    away_win_prob: awayProb / total,
    predicted_winner: winner,
  };
}

/** Vertaa ennustetta todelliseen tulokseen */
export function checkPrediction(
  predicted: Winner,
  homeScore: number,
  awayScore: number
): { actualWinner: Winner; wasCorrect: boolean; notes: string } {
  let actualWinner: Winner;
  if (homeScore > awayScore) actualWinner = 'home';
  else if (awayScore > homeScore) actualWinner = 'away';
  else actualWinner = 'draw';

  return {
    actualWinner,
    wasCorrect: predicted === actualWinner,
    notes: '', // täydennä tarvittaessa esim. 'jatkoaika', 'rl-voitto'
  };
}

/** Laske onnistumisprosentti */
export function accuracyRate(predictions: GamePrediction[]): {
  total: number;
  correct: number;
  rate: number;
} {
  const resolved = predictions.filter((p) => p.was_correct !== null);
  const correct = resolved.filter((p) => p.was_correct).length;
  return {
    total: resolved.length,
    correct,
    rate: resolved.length > 0 ? correct / resolved.length : 0,
  };
}

/** Liukuva onnistumis-% viimeiselle N ottelulle */
export function rollingAccuracy(predictions: GamePrediction[], window: number): number {
  const resolved = predictions.filter((p) => p.was_correct !== null).slice(-window);
  if (resolved.length === 0) return 0;
  return resolved.filter((p) => p.was_correct).length / resolved.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Testi: tasavahvat joukkueet
  const p1 = predictGame(1500, 1500);
  console.log('Tasavahvat (1500 vs 1500, kotietu +40):');
  console.log(`  Koti: ${(p1.home_win_prob * 100).toFixed(1)}%`);
  console.log(`  Tasa: ${(p1.draw_prob * 100).toFixed(1)}%`);
  console.log(`  Vieras: ${(p1.away_win_prob * 100).toFixed(1)}%`);
  console.log(`  Ennuste: ${p1.predicted_winner}`);

  // Testi: selvä ero
  const p2 = predictGame(1700, 1300);
  console.log('\nSelvä ero (1700 vs 1300):');
  console.log(`  Koti: ${(p2.home_win_prob * 100).toFixed(1)}%`);
  console.log(`  Tasa: ${(p2.draw_prob * 100).toFixed(1)}%`);
  console.log(`  Vieras: ${(p2.away_win_prob * 100).toFixed(1)}%`);
  console.log(`  Ennuste: ${p2.predicted_winner}`);

  // Testaa tulosvertailu
  const check = checkPrediction(p2.predicted_winner, 4, 1);
  console.log(`\nTulos 4-1 → ${check.actualWinner}, oikein: ${check.wasCorrect}`);
}
