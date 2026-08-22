// Tiketti #49: Selaimen Poisson-laskenta vs palvelin
//
// public/app/football-calc.js on tietoinen kopio palvelimen matematiikasta,
// koska Kerroinlaskurin pitää laskea uusi edge heti eikä GitHub Pagesissa ole
// palvelinta johon soittaa. Kopion hinta on riski hiljaisesta eriytymisestä.
//
// TÄMÄN TIEDOSTON AINOA TEHTÄVÄ on tehdä siitä eriytymisestä äänekäs: jos joku
// muuttaa toista muttei toista, tämä hajoaa. Ilman näitä testejä Kerroinlaskuri
// alkaisi jossain vaiheessa näyttää eri lukuja kuin analyysi — ja juuri se
// tuhoaisi luottamuksen koko osioon.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import * as browser from '../../public/app/football-calc.js';
import {
  poissonPmf,
  scoreMatrix,
  outcomeProbs,
  overProb,
  bttsProb,
  adjustLambda,
  DEFAULT_RHO,
} from '../analyze/poisson.js';
import { blendProbs, DEFAULT_BLEND_WEIGHT } from '../analyze/consensus.js';
import { kellyStake, edgeOf, DEFAULT_KELLY } from '../engine/kelly.js';

const LAMBDA_PAIRS: Array<[number, number]> = [
  [1.5, 1.2],
  [2.7, 0.4],
  [0.9, 1.9],
  [1.0, 1.0],
  [3.4, 2.8],
];

describe('Vakiot ovat samat molemmin puolin', () => {
  it('rho, Kelly-osuus ja katto', () => {
    expect(browser.DEFAULT_RHO).toBe(DEFAULT_RHO);
    expect(browser.KELLY_FRACTION).toBe(DEFAULT_KELLY.fraction);
    expect(browser.KELLY_CAP).toBe(DEFAULT_KELLY.cap);
  });
});

describe('poissonPmf', () => {
  it('täsmää palvelimeen', () => {
    for (const lambda of [0.4, 1.2, 2.7, 5]) {
      for (let k = 0; k <= 8; k++) {
        expect(browser.poissonPmf(k, lambda)).toBeCloseTo(poissonPmf(k, lambda), 12);
      }
    }
  });

  it('kelvottomat syötteet käyttäytyvät samoin', () => {
    expect(browser.poissonPmf(-1, 1.5)).toBe(poissonPmf(-1, 1.5));
    expect(browser.poissonPmf(1.5, 1.5)).toBe(poissonPmf(1.5, 1.5));
    expect(browser.poissonPmf(0, 0)).toBe(poissonPmf(0, 0));
  });
});

describe('scoreMatrix ja siitä johdetut', () => {
  it('1X2 täsmää palvelimeen', () => {
    for (const [lh, la] of LAMBDA_PAIRS) {
      const b = browser.outcomeProbs(browser.scoreMatrix(lh, la));
      const s = outcomeProbs(scoreMatrix(lh, la));
      expect(b.home).toBeCloseTo(s.home, 10);
      expect(b.draw).toBeCloseTo(s.draw, 10);
      expect(b.away).toBeCloseTo(s.away, 10);
    }
  });

  it('yli 2.5 ja BTTS täsmäävät palvelimeen', () => {
    for (const [lh, la] of LAMBDA_PAIRS) {
      const bm = browser.scoreMatrix(lh, la);
      const sm = scoreMatrix(lh, la);
      expect(browser.overProb(bm, 2.5)).toBeCloseTo(overProb(sm, 2.5), 10);
      expect(browser.bttsProb(bm)).toBeCloseTo(bttsProb(sm), 10);
    }
  });

  it('todennäköisyydet summautuvat ykköseen', () => {
    for (const [lh, la] of LAMBDA_PAIRS) {
      const p = browser.outcomeProbs(browser.scoreMatrix(lh, la));
      expect(p.home + p.draw + p.away).toBeCloseTo(1, 10);
    }
  });
});

describe('adjustLambda', () => {
  it('täsmää palvelimeen ja on kertova', () => {
    for (const delta of [-0.5, -0.15, 0, 0.15, 0.5]) {
      expect(browser.adjustLambda(1.6, delta)).toBeCloseTo(adjustLambda(1.6, delta), 12);
    }
    expect(browser.adjustLambda(2.0, -0.25)).toBeCloseTo(1.5, 10);
  });

  it('ei mene alle palvelimen lattian vaikka tekijä olisi −100 %', () => {
    expect(browser.adjustLambda(2.0, -1)).toBe(adjustLambda(2.0, -1));
    expect(browser.adjustLambda(2.0, -5)).toBeGreaterThanOrEqual(0.1);
  });
});

describe('blendProbs ja Kelly', () => {
  const poisson = { home: 0.5, draw: 0.25, away: 0.25 };
  const sharp = { home: 0.42, draw: 0.28, away: 0.3 };

  it('blend täsmää palvelimeen', () => {
    const b = browser.blendProbs(poisson, sharp, DEFAULT_BLEND_WEIGHT);
    const s = blendProbs(poisson, sharp, DEFAULT_BLEND_WEIGHT);
    expect(b.home).toBeCloseTo(s.home, 12);
    expect(b.draw).toBeCloseTo(s.draw, 12);
    expect(b.away).toBeCloseTo(s.away, 12);
  });

  it('ilman sharpia blend normalisoi pelkän Poissonin', () => {
    const b = browser.blendProbs(poisson, null, DEFAULT_BLEND_WEIGHT);
    const s = blendProbs(poisson, null, DEFAULT_BLEND_WEIGHT);
    expect(b.home).toBeCloseTo(s.home, 12);
  });

  it('edge ja Kelly-panos täsmäävät palvelimeen', () => {
    for (const [p, odds] of [
      [0.5, 2.4],
      [0.3, 4.0],
      [0.08, 20],
      [0.75, 1.23],
    ] as Array<[number, number]>) {
      expect(browser.edgeOf(p, odds)).toBeCloseTo(edgeOf(p, odds), 12);
      const b = browser.kellyStake(p, odds, 100);
      const s = kellyStake(p, odds, 100);
      expect(b.stake).toBeCloseTo(s.stake, 10);
      expect(b.fraction).toBeCloseTo(s.fraction, 12);
      expect(b.capped).toBe(s.capped);
    }
  });

  it('kelvoton syöte tuottaa nollapanoksen molemmilla', () => {
    for (const args of [
      [NaN, 2, 100],
      [0.5, 1, 100],
      [0.5, 2, 0],
      [1.5, 2, 100],
    ] as Array<[number, number, number]>) {
      expect(browser.kellyStake(...args).stake).toBe(kellyStake(...args).stake);
    }
  });
});

describe('recalculate', () => {
  const match = {
    model: { lambda_home: 1.6, lambda_away: 1.1, blend_weight: 0.35 },
    market: { sharp: { home: 0.45, draw: 0.27, away: 0.28 } },
    analysis: {
      edges: [
        { side: 'home', odds: 2.2, odds_effective: 2.2, book: 'X', edge: 0.02, stake_suggestion: 0 },
        { side: 'draw', odds: 3.5, odds_effective: 3.5, book: 'X', edge: 0.01, stake_suggestion: 0 },
        { side: 'away', odds: 3.6, odds_effective: 3.6, book: 'X', edge: 0.0, stake_suggestion: 0 },
      ],
    },
  };

  it('ilman tekijöitä tulos vastaa palvelimen omaa laskentaketjua', () => {
    const r = browser.recalculate(match, [], 100);
    const expected = blendProbs(
      outcomeProbs(scoreMatrix(1.6, 1.1)),
      match.market.sharp,
      0.35
    );
    expect(r.probs.home).toBeCloseTo(expected.home, 10);
    expect(r.lambdaHome).toBeCloseTo(1.6, 10);
    expect(r.lambdaAway).toBeCloseTo(1.1, 10);
  });

  it('kotitekijä nostaa kotivoiton todennäköisyyttä ja laskee vierasvoiton', () => {
    const base = browser.recalculate(match, [], 100);
    const boosted = browser.recalculate(match, [{ id: 1, side: 'home', delta: 0.3, label: 'testi' }], 100);
    expect(boosted.lambdaHome).toBeGreaterThan(base.lambdaHome);
    expect(boosted.probs.home).toBeGreaterThan(base.probs.home);
    expect(boosted.probs.away).toBeLessThan(base.probs.away);
  });

  it('saman puolen tekijät summautuvat', () => {
    const two = browser.recalculate(
      match,
      [
        { id: 1, side: 'home', delta: 0.1, label: 'a' },
        { id: 2, side: 'home', delta: 0.2, label: 'b' },
      ],
      100
    );
    const one = browser.recalculate(match, [{ id: 3, side: 'home', delta: 0.3, label: 'c' }], 100);
    expect(two.lambdaHome).toBeCloseTo(one.lambdaHome, 10);
  });

  it('todennäköisyydet summautuvat ykköseen myös tekijöiden kanssa', () => {
    const r = browser.recalculate(match, [{ id: 1, side: 'away', delta: -0.4, label: 'x' }], 100);
    expect(r.probs.home + r.probs.draw + r.probs.away).toBeCloseTo(1, 10);
  });

  it('market-only-ottelulle palautetaan null eikä keksitä λ:aa', () => {
    const marketOnly = { ...match, model: { ...match.model, lambda_home: null, lambda_away: null } };
    expect(browser.recalculate(marketOnly, [], 100)).toBeNull();
  });

  it('panossuositus vain yli 3 %:n edgelle — sama kynnys kuin palvelimella', () => {
    const r = browser.recalculate(match, [], 100);
    for (const e of r.edges) {
      if (e.edge <= 0.03) expect(e.stake_suggestion).toBe(0);
    }
  });
});

describe('Tekijöiden tallennus', () => {
  it('totalDelta laskee vain oikean puolen tekijät', () => {
    const factors = [
      { id: 1, side: 'home', delta: 0.1 },
      { id: 2, side: 'home', delta: -0.05 },
      { id: 3, side: 'away', delta: 0.2 },
    ];
    expect(browser.totalDelta(factors, 'home')).toBeCloseTo(0.05, 10);
    expect(browser.totalDelta(factors, 'away')).toBeCloseTo(0.2, 10);
  });

  it('kelvoton delta ei riko summaa', () => {
    expect(browser.totalDelta([{ id: 1, side: 'home', delta: 'roska' }], 'home')).toBe(0);
  });
});
