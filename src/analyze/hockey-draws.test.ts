// Jaakiekon tasapelikorjaus (tiketti #93)

import { describe, it, expect } from 'vitest';
import { applyDrawBoost, calibrateDrawBoost, DRAW_BOOST, type DrawSample } from './hockey-draws.js';

const p = (home: number, draw: number, away: number) => ({ home, draw, away });

describe('applyDrawBoost', () => {
  it('nostaa tasapelia kertoimen verran', () => {
    const out = applyDrawBoost(p(0.5, 0.2, 0.3), 1.5);
    expect(out.draw).toBeCloseTo(0.3, 6);
  });

  it('SUMMA PYSYY YKKOSESSA', () => {
    for (const boost of [1, 1.25, 1.5, 1.9]) {
      const out = applyDrawBoost(p(0.55, 0.16, 0.29), boost);
      expect(out.home + out.draw + out.away, `boost ${boost}`).toBeCloseTo(1, 10);
    }
  });

  it('KOTI/VIERAS-SUHDE SAILYY — korjaus ei ota kantaa kumpi on parempi', () => {
    const ennen = p(0.6, 0.15, 0.25);
    const jalkeen = applyDrawBoost(ennen, 1.4);
    expect(jalkeen.home / jalkeen.away).toBeCloseTo(ennen.home / ennen.away, 10);
  });

  it('kerroin 1.0 ei muuta mitaan', () => {
    const ennen = p(0.5, 0.2, 0.3);
    expect(applyDrawBoost(ennen, 1)).toEqual(ennen);
  });

  it('kelvoton kerroin palauttaa alkuperaisen', () => {
    const ennen = p(0.5, 0.2, 0.3);
    expect(applyDrawBoost(ennen, 0)).toEqual(ennen);
    expect(applyDrawBoost(ennen, -1)).toEqual(ennen);
    expect(applyDrawBoost(ennen, NaN)).toEqual(ennen);
  });

  it('RAPPEUTUNUT SYOTE ei tuota nollia', () => {
    // Jos tasapeli veisi kaiken, palautetaan alkuperainen
    const ennen = p(0.05, 0.9, 0.05);
    expect(applyDrawBoost(ennen, 2)).toEqual(ennen);
  });

  it('nolla koti+vieras -> alkuperainen', () => {
    const ennen = p(0, 1, 0);
    expect(applyDrawBoost(ennen, 1.25)).toEqual(ennen);
  });

  it('kaikki todennakoisyydet pysyvat valilla 0-1', () => {
    const out = applyDrawBoost(p(0.7, 0.1, 0.2), 1.9);
    for (const v of Object.values(out)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('calibrateDrawBoost', () => {
  /** Otos jossa tasapeleja on tavoiteosuus */
  function otos(drawShare: number, n = 400): DrawSample[] {
    const out: DrawSample[] = [];
    for (let i = 0; i < n; i++) {
      const q = (i + 0.5) / n;
      const actual = q < drawShare ? 'draw' : q < drawShare + (1 - drawShare) / 2 ? 'home' : 'away';
      out.push({ probs: p(0.45, 0.16, 0.39), actual });
    }
    return out;
  }

  it('loytaa kertoimen joka vastaa toteutunutta tasapeliosuutta', () => {
    const { best } = calibrateDrawBoost(otos(0.22));
    // 0.16 * boost ~ 0.22 -> boost ~ 1.35
    expect(best!.boost).toBeGreaterThan(1.1);
    expect(best!.boost).toBeLessThan(1.7);
  });

  it('ilman tasapeleja optimi on hakuvalin alalaidassa', () => {
    const { best, atBoundary } = calibrateDrawBoost(otos(0));
    expect(best!.boost).toBe(1);
    expect(atBoundary).toBe(true);
  });

  it('paras on aidosti pienin Brier', () => {
    const { best, candidates } = calibrateDrawBoost(otos(0.22));
    expect(best!.brier).toBe(Math.min(...candidates.map((c) => c.brier)));
  });

  it('otoskoko raportoidaan', () => {
    expect(calibrateDrawBoost(otos(0.2, 123)).sampleSize).toBe(123);
  });

  it('tyhja otos -> ei parasta', () => {
    const out = calibrateDrawBoost([]);
    expect(out.best).toBeNull();
    expect(out.atBoundary).toBe(false);
  });

  it('drawRate kertoo mallin tasapeliosuuden kullakin kertoimella', () => {
    const { candidates } = calibrateDrawBoost(otos(0.22));
    const yksi = candidates.find((c) => c.boost === 1)!;
    expect(yksi.drawRate).toBeCloseTo(0.16, 3);
  });
});

describe('kalibroitu vakio', () => {
  it('DRAW_BOOST on mitattu arvo hakuvalin sisalta', () => {
    expect(DRAW_BOOST).toBeGreaterThan(1);
    expect(DRAW_BOOST).toBeLessThan(2);
  });

  it('korjaus nostaa jaakiekon tasapelin lahemmas toteumaa', () => {
    // Poissonin 16.7 % -> lahemmas mitattua 21.7 %
    const korjattu = applyDrawBoost(p(0.5, 0.167, 0.333)).draw;
    expect(korjattu).toBeGreaterThan(0.167);
    expect(Math.abs(korjattu - 0.217)).toBeLessThan(Math.abs(0.167 - 0.217));
  });
});
