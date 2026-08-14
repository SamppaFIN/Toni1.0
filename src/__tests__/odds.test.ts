import { describe, it, expect } from 'vitest';
import { filterBookmakers, computeBestOdds } from '../ingest/odds.js';
import type { ParsedOdds } from '../ingest/odds.js';

function snap(bookmaker: string, h: number, d: number, a: number): ParsedOdds {
  return {
    home_team: 'Tappara',
    away_team: 'Ilves',
    bookmaker,
    home_odds: h,
    draw_odds: d,
    away_odds: a,
    fetched_at: '2026-08-13T10:00:00Z',
  };
}

describe('Toimistofiltteri', () => {
  const all = [snap('bet365', 2.1, 3.5, 3.2), snap('Pinnacle', 2.2, 3.4, 3.3), snap('unibet', 2.05, 3.6, 3.1)];

  it('tyhjällä allowlistalla palauttaa kaikki', () => {
    expect(filterBookmakers(all, [])).toHaveLength(3);
  });

  it('suodattaa vain sallitut toimistot (case-insensitive)', () => {
    const res = filterBookmakers(all, ['BET365', 'pinnacle']);
    expect(res.map((s) => s.bookmaker)).toEqual(['bet365', 'Pinnacle']);
  });

  it('ilman osumia palauttaa tyhjän listan', () => {
    expect(filterBookmakers(all, ['veikkaus'])).toHaveLength(0);
  });
});

describe('Paras kerroin', () => {
  it('valitsee parhaan kertoimen kullekin kohteelle eri toimistoista', () => {
    const best = computeBestOdds([
      snap('bet365', 2.10, 3.50, 3.20),
      snap('Pinnacle', 2.20, 3.40, 3.30),
      snap('Unibet', 2.05, 3.60, 3.10),
    ]);
    expect(best).not.toBeNull();
    expect(best!.home_odds).toBe(2.20);
    expect(best!.home_best).toBe('Pinnacle');
    expect(best!.draw_odds).toBe(3.60);
    expect(best!.draw_best).toBe('Unibet');
    expect(best!.away_odds).toBe(3.30);
    expect(best!.away_best).toBe('Pinnacle');
    expect(best!.bookmakerCount).toBe(3);
  });

  it('yhdellä snapshotilla palauttaa sen kertoimet', () => {
    const best = computeBestOdds([snap('Veikkaus', 2.35, 3.60, 2.90)]);
    expect(best!.home_odds).toBe(2.35);
    expect(best!.home_best).toBe('Veikkaus');
    expect(best!.bookmakerCount).toBe(1);
  });

  it('tyhjällä listalla palauttaa null', () => {
    expect(computeBestOdds([])).toBeNull();
  });
});
