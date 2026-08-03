import { describe, it, expect } from 'vitest';
import { calculateZScore, seasonStats, interpretZScore } from '../analyze/zscore.js';

describe('Pelaaja z-score', () => {
  const seasonGames = [
    { playerId: 1, date: '2026-01-01', points: 1 },
    { playerId: 1, date: '2026-01-02', points: 0 },
    { playerId: 1, date: '2026-01-03', points: 2 },
    { playerId: 1, date: '2026-01-04', points: 1 },
    { playerId: 1, date: '2026-01-05', points: 1 },
    { playerId: 1, date: '2026-01-06', points: 0 },
    { playerId: 1, date: '2026-01-07', points: 1 },
    { playerId: 1, date: '2026-01-08', points: 1 },
  ];

  it('laskee kauden keskiarvon ja keskihajonnan', () => {
    const stats = seasonStats(seasonGames);
    expect(stats.avg).toBeGreaterThan(0);
    expect(stats.stdDev).toBeGreaterThan(0);
     expect(stats.avg).toBeCloseTo(7 / 8, 1);
  });

  it('kuuma pelaaja: z > 1.5', () => {
    const { avg, stdDev } = seasonStats(seasonGames);
    const hotGames = [{ playerId: 1, date: '2026-01-09', points: 3 }, { playerId: 1, date: '2026-01-10', points: 4 }];
    const z = calculateZScore(hotGames, avg, stdDev);
    expect(z).toBeGreaterThan(1.5);
  });

  it('kylmä pelaaja: z < -1.5', () => {
    // Korkea kauden ka (2.0), pienet pisteet viime peleissä (0,0)
    const hotSeason = [
      { playerId: 2, date: '2026-01-01', points: 3 },
      { playerId: 2, date: '2026-01-02', points: 2 },
      { playerId: 2, date: '2026-01-03', points: 3 },
      { playerId: 2, date: '2026-01-04', points: 1 },
      { playerId: 2, date: '2026-01-05', points: 2 },
      { playerId: 2, date: '2026-01-06', points: 3 },
      { playerId: 2, date: '2026-01-07', points: 2 },
      { playerId: 2, date: '2026-01-08', points: 0 }, // hieman laskee ka:ta
    ];
    const { avg, stdDev } = seasonStats(hotSeason);
    // Viimeisissä 2 pelissä 0 pistettä → selvästi alle kauden ka:n
    const coldGames = [
      { playerId: 2, date: '2026-01-09', points: 0 },
      { playerId: 2, date: '2026-01-10', points: 0 },
    ];
    const z = calculateZScore(coldGames, avg, stdDev);
    expect(z).toBeLessThan(-1.5);
  });

  it('interpretZScore toimii', () => {
    expect(interpretZScore(2.0)).toBe('hot');
    expect(interpretZScore(0.5)).toBe('normal');
    expect(interpretZScore(-2.0)).toBe('cold');
  });

  it('tyhjällä datalla z-score on 0', () => {
    expect(calculateZScore([], 1, 0.5)).toBe(0);
  });

  it('nollakeskihajonnalla z-score on 0', () => {
    expect(calculateZScore([{ playerId: 1, date: 'x', points: 1 }], 1, 0)).toBe(0);
  });
});
