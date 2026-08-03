// Tiketti #6: Marginaalin poisto + implied probability
// Laskee vedonvälittäjän katteen pois ja palauttaa puhtaan markkinaimplisiittisen todennäköisyyden.

import { ParsedOdds } from '../ingest/odds.js';

export interface ImpliedProbs {
  home_prob: number;
  draw_prob: number;
  away_prob: number;
  margin: number; // kirjanpitäjän kate
}

/**
 * Marginaalin poisto — normalisoi kertoimet niin että summa = 1.0.
 * implied_prob_i = (1 / odds_i) / sum_j(1 / odds_j)
 */
export function removeMargin(homeOdds: number, drawOdds: number, awayOdds: number): ImpliedProbs {
  const invHome = 1 / homeOdds;
  const invDraw = 1 / drawOdds;
  const invAway = 1 / awayOdds;
  const sum = invHome + invDraw + invAway;

  return {
    home_prob: invHome / sum,
    draw_prob: invDraw / sum,
    away_prob: invAway / sum,
    margin: sum - 1, // > 0: bookmakerin etu
  };
}

/** Käsittelee koko ParsedOdds-array ja lisää implied_prob:t */
export function computeAllImpliedProbs(snapshots: ParsedOdds[]): Array<ParsedOdds & ImpliedProbs> {
  return snapshots.map((s) => ({
    ...s,
    ...removeMargin(s.home_odds, s.draw_odds, s.away_odds),
  }));
}

// Yksikkötesti ajettavissa suoraan
if (import.meta.url === `file://${process.argv[1]}`) {
  // Tunnettu testitapaus: tasakertoimet 2.0 / 3.0 / 4.0
  const result = removeMargin(2.0, 3.0, 4.0);
  console.log('Test: odds 2.0/3.0/4.0');
  console.log(`  home: ${result.home_prob.toFixed(4)} (expected ~0.4615)`);
  console.log(`  draw: ${result.draw_prob.toFixed(4)} (expected ~0.3077)`);
  console.log(`  away: ${result.away_prob.toFixed(4)} (expected ~0.2308)`);
  console.log(`  sum:  ${(result.home_prob + result.draw_prob + result.away_prob).toFixed(4)} (expected 1.0000)`);
  console.log(`  margin: ${result.margin.toFixed(4)} (expected ~0.0833)`);

  const ok = Math.abs(result.home_prob + result.draw_prob + result.away_prob - 1.0) < 0.001;
  console.log(ok ? '✓ PASS' : '✗ FAIL');
}
