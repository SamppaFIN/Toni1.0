// Tiketti #35: Tappioketjun (Martingale) laskenta
//
// Vain puhdas laskenta testataan täältä — startChain/continueChain/resolveStep
// koskettavat window.BT:tä ja localStoragea, joten ne on todennettu selaimessa
// (Playwright, ks. e2e/specs/football-chase.spec.ts). Tämä tiedosto lukitsee
// sen matematiikan johon koko ominaisuus nojaa: tuplaus ja stop-loss.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import { computeRequirement, totalStaked, totalReturned, netResult, STOP_LOSS_MULTIPLIER } from '../../public/app/football-chase.js';

interface Chain {
  status: string;
  steps: Array<{ stake: number; odds: number }>;
}

function chain(status: string, steps: Array<{ stake: number; odds: number }>): Chain {
  return { status, steps };
}

describe('Panosmoodi — panos tuplautuu, stop-loss 4×:ssä', () => {
  it('ensimmäinen jatko tuplaa panoksen', () => {
    const r = computeRequirement('stake', 10, 10, 2.0);
    expect(r.stake).toBe(20);
    expect(r.multiplier).toBeCloseTo(2, 6);
    expect(r.blocked).toBe(false);
  });

  it('kerroin on vapaa panosmoodissa — minOdds on null', () => {
    expect(computeRequirement('stake', 10, 20, 3.5).minOdds).toBeNull();
  });

  it('koko ketju 10 → 20 → 40 → (80 estetty)', () => {
    expect(computeRequirement('stake', 10, 10, 2).stake).toBe(20); // 2×
    expect(computeRequirement('stake', 10, 20, 2).stake).toBe(40); // 4×
    expect(computeRequirement('stake', 10, 20, 2).blocked).toBe(false); // 4× on vielä sallittu
    expect(computeRequirement('stake', 10, 40, 2).stake).toBe(80); // 8×
    expect(computeRequirement('stake', 10, 40, 2).blocked).toBe(true); // 8× > 4× → estetty
  });

  it('tarkalleen 4× on viimeinen sallittu, ei estetty', () => {
    // originalStake=10, edellinen panos=20 → seuraava 40 = tasan 4×
    const r = computeRequirement('stake', 10, 20, 2);
    expect(r.multiplier).toBeCloseTo(4, 6);
    expect(r.blocked).toBe(false);
  });

  it('juuri yli 4× estetään', () => {
    // originalStake=10, edellinen panos=20.5 → seuraava 41 = 4.1×
    const r = computeRequirement('stake', 10, 20.5, 2);
    expect(r.multiplier).toBeGreaterThan(4);
    expect(r.blocked).toBe(true);
  });

  it('mukautuva stop-loss-parametri toimii', () => {
    // originalStake=10, edellinen panos=20 → seuraava 40 = 4×.
    // Tiukempi 3× stop-loss estäisi tämän; löysempi 6× päästää läpi.
    expect(computeRequirement('stake', 10, 20, 2, 3).blocked).toBe(true);
    expect(computeRequirement('stake', 10, 20, 2, 6).blocked).toBe(false);
  });

  it('desimaalipanokset eivät aiheuta liukulukuvirheestä väärää estoa', () => {
    // 0.1 + 0.2 !== 0.3 -tyyppinen ansa: 4× tasan pitää silti mennä läpi
    const r = computeRequirement('stake', 3.33, 6.66, 1.5);
    expect(r.multiplier).toBeCloseTo(4, 6);
    expect(r.blocked).toBe(false);
  });
});

describe('Kerroinmoodi — kerroin tuplautuu, panos ei kasva', () => {
  it('panos pysyy alkuperäisenä', () => {
    const r = computeRequirement('odds', 10, 10, 2.0);
    expect(r.stake).toBe(10);
  });

  it('vaadittu vähimmäiskerroin tuplautuu edellisestä', () => {
    expect(computeRequirement('odds', 10, 10, 2.0).minOdds).toBeCloseTo(4.0, 6);
    expect(computeRequirement('odds', 10, 10, 4.0).minOdds).toBeCloseTo(8.0, 6);
  });

  it('ei koskaan estetty — stop-loss koskee vain panosmoodia', () => {
    // Vaikka kerroin karkaisi käsittämättömän suureksi, kerroinmoodi ei tuota blocked:true
    expect(computeRequirement('odds', 10, 10, 50).blocked).toBe(false);
  });
});

describe('Ketjun yhteenveto', () => {
  it('sijoitettu yhteensä on kaikkien askelten summa', () => {
    const c = chain('active', [{ stake: 10, odds: 2 }, { stake: 20, odds: 1.8 }]);
    expect(totalStaked(c)).toBe(30);
  });

  it('voitettu ketju palauttaa viimeisen askeleen tuoton', () => {
    const c = chain('won', [{ stake: 10, odds: 2 }, { stake: 20, odds: 3 }]);
    expect(totalReturned(c)).toBe(60); // 20 × 3
    expect(netResult(c)).toBe(30); // 60 − 30 sijoitettua
  });

  it('luovutettu ketju ei palauta mitään', () => {
    const c = chain('abandoned', [{ stake: 10, odds: 2 }, { stake: 20, odds: 1.8 }]);
    expect(totalReturned(c)).toBe(0);
    expect(netResult(c)).toBe(-30);
  });

  it('yhden askeleen ketju joka voittaa heti', () => {
    const c = chain('won', [{ stake: 10, odds: 2.5 }]);
    expect(totalStaked(c)).toBe(10);
    expect(totalReturned(c)).toBe(25);
    expect(netResult(c)).toBe(15);
  });

  it('voitto kuittaa aiemmat tappiot — nettotulos voi olla positiivinen isostakin ketjusta', () => {
    // 10 → 20 → 40, viimeinen voittaa kertoimella 2.1
    const c = chain('won', [{ stake: 10, odds: 2 }, { stake: 20, odds: 1.9 }, { stake: 40, odds: 2.1 }]);
    expect(totalStaked(c)).toBe(70);
    expect(totalReturned(c)).toBeCloseTo(84, 6);
    expect(netResult(c)).toBeCloseTo(14, 6);
  });
});

describe('Vakio', () => {
  it('oletus stop-loss on 4×, kuten pyydetty', () => {
    expect(STOP_LOSS_MULTIPLIER).toBe(4);
  });
});
