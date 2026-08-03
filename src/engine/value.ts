// Tiketti #8: Value-moottori + kynnyslogiikka + uutisikkuna
// Tunnistaa ylikertoimet: missä markkina on väärässä.
// edge = model_prob × odds − 1
// edge > 0.03 → ylikerroinkandidaatti
// edge > 0.05 → vahva signaali

import { ImpliedProbs } from '../analyze/margin.js';
import { PredictionResult } from '../analyze/predict.js';

export type MarketSide = 'home' | 'draw' | 'away';

export interface ValueCheck {
  side: MarketSide;
  odds: number;
  model_prob: number;
  implied_prob: number;
  edge: number;
  is_value: boolean;
  is_strong: boolean;
}

/**
 * Tarkista onko jollain 1X2-markkinan puolella ylikerrointa.
 * @param model — oman mallin todennäköisyydet
 * @param implied — markkinan implisiittiset todennäköisyydet
 * @param odds — kertoimet (home, draw, away)
 */
export function checkValue(
  model: PredictionResult,
  implied: ImpliedProbs,
  odds: [number, number, number]
): ValueCheck[] {
  const sides: Array<{ side: MarketSide; model_prob: number; implied_prob: number; odds: number }> = [
    { side: 'home', model_prob: model.home_win_prob, implied_prob: implied.home_prob, odds: odds[0] },
    { side: 'draw', model_prob: model.draw_prob, implied_prob: implied.draw_prob, odds: odds[1] },
    { side: 'away', model_prob: model.away_win_prob, implied_prob: implied.away_prob, odds: odds[2] },
  ];

  return sides.map((s) => {
    const edge = s.model_prob * s.odds - 1;
    return {
      side: s.side,
      odds: s.odds,
      model_prob: s.model_prob,
      implied_prob: s.implied_prob,
      edge,
      is_value: edge > 0.03,
      is_strong: edge > 0.05,
    };
  });
}

/**
 * Tarkista onko uutisikkuna voimassa:
 * - news_event.confidence > 0.7
 * - odds-snapshot < 30 min uutisen julkaisusta
 * - kerroin ei ole liikkunut (tarkistetaan vertaamalla aiempaan snapshotiin)
 */
export function isNewsWindowValid(
  newsConfidence: number,
  newsPublishedAt: string,
  oddsFetchedAt: string,
  previousOdds?: [number, number, number],
  currentOdds?: [number, number, number]
): boolean {
  if (newsConfidence < 0.7) return false;

  const newsTime = new Date(newsPublishedAt).getTime();
  const oddsTime = new Date(oddsFetchedAt).getTime();
  const diffMinutes = (oddsTime - newsTime) / 60000;

  // Odds pitää olla haettu alle 30 min uutisen jälkeen
  if (diffMinutes > 30 || diffMinutes < 0) return false;

  // Tarkista ettei kerroin ole liikkunut (jos vertailudataa)
  if (previousOdds && currentOdds) {
    const moved = previousOdds.some((prev, i) => Math.abs(prev - currentOdds[i]) > 0.05);
    if (moved) return false; // markkina on jo reagoinut
  }

  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Testi: malli näkee 40% kotivoitolle, markkina vain 30% → edge = 1.33
  const mockModel: PredictionResult = {
    home_win_prob: 0.40,
    draw_prob: 0.28,
    away_win_prob: 0.32,
    predicted_winner: 'draw',
  };
  const mockImplied: ImpliedProbs = {
    home_prob: 0.30,
    draw_prob: 0.28,
    away_prob: 0.42,
    margin: 0.05,
  };
  const mockOdds: [number, number, number] = [3.20, 3.40, 2.30];

  const checks = checkValue(mockModel, mockImplied, mockOdds);
  console.log('Value check tulokset:');
  checks.forEach((c) => {
    const flag = c.is_strong ? '💎 VAHVA' : c.is_value ? '🟡 kandidaatti' : '⚫ ei arvoa';
    console.log(`  ${c.side}: edge ${(c.edge * 100).toFixed(1)}%, model ${(c.model_prob * 100).toFixed(0)}% vs implied ${(c.implied_prob * 100).toFixed(0)}% → ${flag}`);
  });
}
