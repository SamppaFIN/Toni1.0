import { describe, it, expect } from 'vitest';
import { kellyStake, edgeOf, DEFAULT_KELLY } from '../engine/kelly.js';

describe('Kelly-kaava', () => {
  it('laskee täyden Kellyn oikein käsin lasketusta tapauksesta', () => {
    // p=0.55, kerroin 2.0 → b=1, q=0.45 → f* = (1×0.55 − 0.45)/1 = 0.10
    const r = kellyStake(0.55, 2.0, 1000, { fraction: 1, cap: 1 });
    expect(r.full_fraction).toBeCloseTo(0.10, 6);
    expect(r.stake).toBeCloseTo(100, 2);
  });

  it('nollaedge → panos 0', () => {
    // p=0.5, kerroin 2.0 → f* = (1×0.5 − 0.5)/1 = 0
    const r = kellyStake(0.5, 2.0, 1000);
    expect(r.full_fraction).toBeCloseTo(0, 6);
    expect(r.stake).toBe(0);
  });

  it('negatiivinen edge → panos 0, ei negatiivinen panos', () => {
    const r = kellyStake(0.40, 2.0, 1000);
    expect(r.full_fraction).toBeLessThan(0);
    expect(r.stake).toBe(0);
    expect(r.fraction).toBe(0);
  });

  it('murto-Kelly neljäsosaa täydestä', () => {
    const full = kellyStake(0.55, 2.0, 1000, { fraction: 1, cap: 1 });
    const quarter = kellyStake(0.55, 2.0, 1000, { fraction: 0.25, cap: 1 });
    expect(quarter.fraction).toBeCloseTo(full.fraction * 0.25, 6);
  });

  it('katto rajoittaa panoksen ja merkitsee sen', () => {
    // Raskas suosikki: p=0.90, kerroin 1.5 → b=0.5, f* = (0.45−0.10)/0.5 = 0.70
    // murto-Kelly 25 % → 0.175, mikä ylittää 2 %:n katon selvästi
    const r = kellyStake(0.90, 1.5, 1000);
    expect(r.full_fraction).toBeCloseTo(0.70, 6);
    expect(r.capped).toBe(true);
    expect(r.fraction).toBe(DEFAULT_KELLY.cap);
    expect(r.stake).toBeCloseTo(20, 2);
  });

  it('ei merkitse kattoa kun se ei osu', () => {
    // p=0.52, kerroin 2.0 → f* = 0.04 → murto 0.01 < katto 0.02
    const r = kellyStake(0.52, 2.0, 1000);
    expect(r.capped).toBe(false);
    expect(r.fraction).toBeCloseTo(0.01, 6);
  });

  it('panos skaalautuu kassan mukaan', () => {
    const small = kellyStake(0.55, 2.0, 100);
    const big = kellyStake(0.55, 2.0, 1000);
    expect(big.stake).toBeCloseTo(small.stake * 10, 2);
  });

  it('panos pyöristetään sentteihin', () => {
    const r = kellyStake(0.523, 2.13, 137.77);
    expect(r.stake).toBe(Math.round(r.stake * 100) / 100);
  });
});

describe('Kelly — kelvottomat syötteet', () => {
  it('kerroin 1.0 tai alle → 0', () => {
    expect(kellyStake(0.9, 1.0, 1000).stake).toBe(0);
    expect(kellyStake(0.9, 0.5, 1000).stake).toBe(0);
  });

  it('todennäköisyys 0 tai 1 → 0', () => {
    expect(kellyStake(0, 2.0, 1000).stake).toBe(0);
    expect(kellyStake(1, 2.0, 1000).stake).toBe(0);
  });

  it('tyhjä tai negatiivinen kassa → 0', () => {
    expect(kellyStake(0.6, 2.0, 0).stake).toBe(0);
    expect(kellyStake(0.6, 2.0, -100).stake).toBe(0);
  });

  it('NaN ja Infinity eivät läpäise', () => {
    expect(kellyStake(NaN, 2.0, 1000).stake).toBe(0);
    expect(kellyStake(0.6, Infinity, 1000).stake).toBe(0);
    expect(kellyStake(0.6, 2.0, NaN).stake).toBe(0);
  });
});

describe('Edge', () => {
  it('edge = p × kerroin − 1', () => {
    expect(edgeOf(0.5, 2.2)).toBeCloseTo(0.10, 6);
    expect(edgeOf(0.5, 2.0)).toBeCloseTo(0, 6);
    expect(edgeOf(0.4, 2.0)).toBeCloseTo(-0.20, 6);
  });

  it('positiivinen edge on välttämätön ehto positiiviselle Kellylle', () => {
    // Kelly > 0 täsmälleen silloin kun edge > 0 — sama ehto eri muodossa
    for (const [p, odds] of [[0.55, 2.0], [0.5, 2.0], [0.3, 3.0], [0.35, 3.0]] as const) {
      const hasEdge = edgeOf(p, odds) > 0;
      const hasStake = kellyStake(p, odds, 1000).stake > 0;
      expect(hasStake).toBe(hasEdge);
    }
  });
});
