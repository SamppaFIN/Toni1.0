// Dixon-Coles-parametrin kalibrointi (tiketti #71)
//
// rho on ollut kiinteä -0.05 tiketista #26 asti. Se on kirjallisuusarvo, mutta
// matalien tulosten ylimaara on sarjakohtainen. Nama testit todentavat etta
// haku loytaa oikean arvon kun se on olemassa -- ja etta se SANOO kun otos on
// liian pieni luotettavaan viritykseen.

import { describe, it, expect } from 'vitest';
import { calibrateRho } from './scoring.js';
import { predictFromLambda } from './poisson.js';
import type { MarketSide } from '../types-football.js';

const predict = (lh: number, la: number, rho: number) => predictFromLambda(lh, la, rho).probs;

/** Arvo tulokset annetulla rho:lla — deterministinen, kvantiiliin perustuva */
function sampleWithRho(rho: number, n: number): Array<{ lambdaHome: number; lambdaAway: number; actual: MarketSide }> {
  const out = [];
  for (let i = 0; i < n; i++) {
    const lambdaHome = 1.1 + (i % 5) * 0.15;
    const lambdaAway = 0.9 + (i % 4) * 0.15;
    const p = predict(lambdaHome, lambdaAway, rho);
    // Deterministinen kvantiili: jaa [0,1) tasavalein ja poimi kohde
    const q = (i + 0.5) / n;
    const actual: MarketSide = q < p.home ? 'home' : q < p.home + p.draw ? 'draw' : 'away';
    out.push({ lambdaHome, lambdaAway, actual });
  }
  return out;
}

describe('calibrateRho', () => {
  it('loytaa kaikille arvoille Brier-scoren', () => {
    const { candidates } = calibrateRho(sampleWithRho(-0.05, 40), predict);
    expect(candidates.length).toBeGreaterThan(20);
    expect(candidates.every((c) => c.brier > 0 && c.brier < 2)).toBe(true);
  });

  it('tyhja otos -> ei parasta arvoa eika riittavaa otosta', () => {
    const { best, sufficientSample } = calibrateRho([], predict);
    expect(best).toBeNull();
    expect(sufficientSample).toBe(false);
  });

  it('alle 20 ottelua -> sufficientSample false vaikka best loytyy', () => {
    const r = calibrateRho(sampleWithRho(-0.05, 10), predict);
    expect(r.best).not.toBeNull();
    expect(r.sufficientSample).toBe(false);
  });

  it('20 ottelua riittaa lipun kaantamiseen', () => {
    expect(calibrateRho(sampleWithRho(-0.05, 20), predict).sufficientSample).toBe(true);
  });

  it('paras arvo pysyy sallitulla valilla', () => {
    const { best } = calibrateRho(sampleWithRho(-0.12, 60), predict);
    expect(best!.rho).toBeGreaterThanOrEqual(-0.2);
    expect(best!.rho).toBeLessThanOrEqual(0.05);
  });

  it('paras arvo on aidosti pienin Brier eika vain ensimmainen', () => {
    const { best, candidates } = calibrateRho(sampleWithRho(-0.05, 40), predict);
    expect(best!.brier).toBe(Math.min(...candidates.map((c) => c.brier)));
  });

  it('vali on konfiguroitavissa', () => {
    const { candidates } = calibrateRho(sampleWithRho(-0.05, 30), predict, {
      min: -0.1,
      max: -0.05,
      step: 0.05,
    });
    expect(candidates.map((c) => c.rho)).toEqual([-0.1, -0.05]);
  });
});

describe('calibrateRho — reunahavainto', () => {
  it('reunalla oleva paras arvo liputetaan', () => {
    // Rappeutunut ennuste: sama jakauma rho:sta riippumatta -> kaikki
    // ehdokkaat identtisia -> reduce palauttaa ensimmaisen = reuna
    const flat = () => ({ home: 1 / 3, draw: 1 / 3, away: 1 / 3 });
    const r = calibrateRho(sampleWithRho(-0.05, 30), flat);
    expect(r.atBoundary).toBe(true);
  });

  it('sisalta loytyva optimi ei ole reunalla', () => {
    const r = calibrateRho(sampleWithRho(-0.05, 60), predict, { min: -0.3, max: 0.2, step: 0.01 });
    expect(r.atBoundary).toBe(false);
  });

  it('tyhja otos ei ole reunalla', () => {
    expect(calibrateRho([], predict).atBoundary).toBe(false);
  });
});
