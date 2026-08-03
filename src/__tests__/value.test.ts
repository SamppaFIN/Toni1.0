import { describe, it, expect } from 'vitest';
import { checkValue, isNewsWindowValid } from '../engine/value.js';
import type { PredictionResult } from '../analyze/predict.js';
import type { ImpliedProbs } from '../analyze/margin.js';

describe('Value-moottori', () => {
  const model: PredictionResult = {
    home_win_prob: 0.40,
    draw_prob: 0.28,
    away_win_prob: 0.32,
    predicted_winner: 'draw',
  };

  const implied: ImpliedProbs = {
    home_prob: 0.30,
    draw_prob: 0.28,
    away_prob: 0.42,
    margin: 0.05,
  };

  const odds: [number, number, number] = [3.20, 3.40, 2.30];

  it('tunnistaa ylikertoimen kun malli > markkina', () => {
    const checks = checkValue(model, implied, odds);
    const home = checks[0]; // model 40% vs implied 30%
    expect(home.edge).toBeGreaterThan(0);
    expect(home.is_value).toBe(true); // edge > 3%
  });

  it('ei tunnista arvoa kun malli ≤ markkina', () => {
    const checks = checkValue(model, implied, odds);
    const away = checks[2]; // model 32% vs implied 42%
    expect(away.edge).toBeLessThan(0);
    expect(away.is_value).toBe(false);
  });

  it('vahva signaali kun edge > 5%', () => {
    // Luo tilanne jossa edge > 5%
    const strongModel: PredictionResult = { ...model, home_win_prob: 0.50 };
    const checks = checkValue(strongModel, implied, odds);
    expect(checks[0].is_strong).toBe(true);
  });

  it('kaikki kolme puolta palautetaan', () => {
    const checks = checkValue(model, implied, odds);
    expect(checks).toHaveLength(3);
    expect(checks.map(c => c.side)).toEqual(['home', 'draw', 'away']);
  });
});

describe('Uutisikkuna', () => {
  const now = new Date();
  const newsTime = new Date(now.getTime() - 10 * 60000); // 10 min sitten
  const oddsTime = new Date(now.getTime() - 5 * 60000); // 5 min sitten

  it('voimassa kun confidence > 0.7 ja alle 30 min', () => {
    const valid = isNewsWindowValid(
      0.85,
      newsTime.toISOString(),
      oddsTime.toISOString()
    );
    expect(valid).toBe(true);
  });

  it('ei voimassa kun confidence < 0.7', () => {
    const valid = isNewsWindowValid(
      0.5,
      newsTime.toISOString(),
      oddsTime.toISOString()
    );
    expect(valid).toBe(false);
  });

  it('ei voimassa kun yli 30 min uutisesta', () => {
    const oldNews = new Date(now.getTime() - 40 * 60000);
    const valid = isNewsWindowValid(
      0.85,
      oldNews.toISOString(),
      oddsTime.toISOString()
    );
    expect(valid).toBe(false);
  });

  it('ei voimassa kun kerroin on liikkunut', () => {
    const valid = isNewsWindowValid(
      0.85,
      newsTime.toISOString(),
      oddsTime.toISOString(),
      [3.20, 3.40, 2.30],
      [3.00, 3.60, 2.60] // yli 0.05 muutos
    );
    expect(valid).toBe(false);
  });
});
