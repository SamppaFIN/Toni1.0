import { describe, it, expect } from 'vitest';
import { calculatePDO, interpretPDO } from '../analyze/pdo.js';

describe('PDO-laskenta', () => {
  it('laskee PDO:n oikein normaalilla datalla', () => {
    const result = calculatePDO({ goalsFor: 30, shotsFor: 300, goalsAgainst: 25, shotsAgainst: 280 });
    expect(result.shootingPct).toBeCloseTo(10.0, 0);
    expect(result.savePct).toBeCloseTo((280 - 25) / 280 * 100, 0);
    expect(result.pdo).toBeCloseTo(10.0 + (280 - 25) / 280 * 100, 0);
  });

  it('PDO = 100 kun LS% ja SV% ovat molemmat 50', () => {
    const result = calculatePDO({ goalsFor: 50, shotsFor: 100, goalsAgainst: 50, shotsAgainst: 100 });
    expect(result.shootingPct).toBeCloseTo(50, 0);
    expect(result.savePct).toBeCloseTo(50, 0);
    expect(result.pdo).toBeCloseTo(100, 0);
  });

  it('käsittelee nollat oikein', () => {
    const result = calculatePDO({ goalsFor: 0, shotsFor: 0, goalsAgainst: 5, shotsAgainst: 10 });
    expect(result.shootingPct).toBe(0);
    expect(result.savePct).toBe(50);
    expect(result.pdo).toBe(50);
  });

  it('interpretPDO: >102 on ylisuorittamista', () => {
    expect(interpretPDO(103)).toBe('overperforming');
    expect(interpretPDO(105)).toBe('overperforming');
  });

  it('interpretPDO: <98 on alisuorittamista', () => {
    expect(interpretPDO(97)).toBe('underperforming');
    expect(interpretPDO(90)).toBe('underperforming');
  });

  it('interpretPDO: 98-102 on normaali', () => {
    expect(interpretPDO(100)).toBe('normal');
    expect(interpretPDO(99.5)).toBe('normal');
  });
});
