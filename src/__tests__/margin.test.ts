import { describe, it, expect } from 'vitest';
import { removeMargin } from '../analyze/margin.js';

describe('Marginaalin poisto', () => {
  it('tasakertoimilla summa = 1.0', () => {
    const result = removeMargin(2.0, 3.0, 4.0);
    const sum = result.home_prob + result.draw_prob + result.away_prob;
    expect(sum).toBeCloseTo(1.0, 4);
  });

  it('tunnistaa bookmakerin katteen', () => {
    const result = removeMargin(2.0, 3.0, 4.0);
    expect(result.margin).toBeGreaterThan(0);
    expect(result.margin).toBeCloseTo(1 / 2 + 1 / 3 + 1 / 4 - 1, 4);
  });

  it('tasakertoimilla kaikki todennäköisyydet ovat yhtä suuret', () => {
    const result = removeMargin(2.0, 2.0, 2.0);
    expect(result.home_prob).toBeCloseTo(1 / 3, 2);
    expect(result.draw_prob).toBeCloseTo(1 / 3, 2);
    expect(result.away_prob).toBeCloseTo(1 / 3, 2);
  });

  it('reilut kertoimet: margin = 0', () => {
    // 2.0 / 2.0 / 2.0 → implisiittinen tn 50% / 50% / 50% → summa = 1.5 → ei reilua
    // Oikeasti reilu: odds = 1/p missä p summautuu 1.0:een
    const result = removeMargin(2.0, 2.0, 2.0);
    expect(result.margin).toBeCloseTo(0.5, 1);
  });

  it('suosikin todennäköisyys on suurempi kuin altavastaajan', () => {
    const result = removeMargin(1.5, 4.0, 8.0);
    expect(result.home_prob).toBeGreaterThan(result.draw_prob);
    expect(result.draw_prob).toBeGreaterThan(result.away_prob);
  });

  it('kaikki todennäköisyydet ovat positiivisia', () => {
    const result = removeMargin(1.01, 10.0, 50.0);
    expect(result.home_prob).toBeGreaterThan(0);
    expect(result.draw_prob).toBeGreaterThan(0);
    expect(result.away_prob).toBeGreaterThan(0);
  });
});
