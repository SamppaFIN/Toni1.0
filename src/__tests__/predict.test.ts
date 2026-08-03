import { describe, it, expect } from 'vitest';
import { predictGame, checkPrediction, accuracyRate } from '../analyze/predict.js';

describe('Otteluennusteet', () => {
  it('kotijoukkueella on etu tasavahvoja vastaan', () => {
    const p = predictGame(1500, 1500);
    expect(p.home_win_prob).toBeGreaterThan(p.away_win_prob);
  });

  it('todennäköisyydet summautuvat ykköseen', () => {
    const p = predictGame(1500, 1500);
    const sum = p.home_win_prob + p.draw_prob + p.away_win_prob;
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('selvästi vahvemman joukkueen voitto on todennäköisin', () => {
    const p = predictGame(1700, 1300);
    expect(p.home_win_prob).toBeGreaterThan(0.5);
    expect(p.predicted_winner).toBe('home');
  });

  it('tasapelin todennäköisyys on suurempi kun joukkueet ovat tasavahvoja', () => {
    const pClose = predictGame(1500, 1500);
    const pFar = predictGame(1700, 1300);
    expect(pClose.draw_prob).toBeGreaterThan(pFar.draw_prob);
  });

  it('checkPrediction tunnistaa oikean kotivoiton', () => {
    const result = checkPrediction('home', 3, 1);
    expect(result.actualWinner).toBe('home');
    expect(result.wasCorrect).toBe(true);
  });

  it('checkPrediction tunnistaa väärän ennusteen', () => {
    const result = checkPrediction('home', 1, 3);
    expect(result.actualWinner).toBe('away');
    expect(result.wasCorrect).toBe(false);
  });

  it('checkPrediction tunnistaa tasapelin', () => {
    const result = checkPrediction('draw', 2, 2);
    expect(result.actualWinner).toBe('draw');
    expect(result.wasCorrect).toBe(true);
  });

  it('accuracyRate laskee oikein', () => {
    const predictions = [
      { was_correct: true } as any,
      { was_correct: false } as any,
      { was_correct: true } as any,
      { was_correct: null as any } as any, // ei ratkennut
    ];
    const a = accuracyRate(predictions);
    expect(a.total).toBe(3);
    expect(a.correct).toBe(2);
    expect(a.rate).toBeCloseTo(2 / 3, 2);
  });
});
