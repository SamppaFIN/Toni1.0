import { describe, it, expect } from 'vitest';
import {
  argmax,
  accuracy,
  brierScore,
  logLoss,
  calibration,
  clvFor,
  clvSummary,
  paperRoi,
  calibrateBlendWeight,
  UNIFORM_BRIER,
  MIN_SAMPLE,
  Outcome,
} from '../analyze/scoring.js';
import { SideProbs, MarketSide } from '../types-football.js';

function outcome(actual: MarketSide, model: SideProbs, market: SideProbs | null = null, id = 'm'): Outcome {
  return { matchId: id, actual, model, market };
}

const CERTAIN_HOME: SideProbs = { home: 1, draw: 0, away: 0 };
const UNIFORM: SideProbs = { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };

describe('Todennäköisin kohde', () => {
  it('poimii suurimman', () => {
    expect(argmax({ home: 0.5, draw: 0.3, away: 0.2 })).toBe('home');
    expect(argmax({ home: 0.2, draw: 0.5, away: 0.3 })).toBe('draw');
    expect(argmax({ home: 0.2, draw: 0.3, away: 0.5 })).toBe('away');
  });

  it('tasatilanteessa palauttaa deterministisesti saman', () => {
    expect(argmax(UNIFORM)).toBe(argmax(UNIFORM));
  });
});

describe('Brier score', () => {
  it('täydellinen ennuste antaa nollan', () => {
    expect(brierScore([outcome('home', CERTAIN_HOME)], (o) => o.model)).toBe(0);
  });

  it('täysin väärä varma ennuste antaa kaksi — teoreettinen maksimi', () => {
    expect(brierScore([outcome('away', CERTAIN_HOME)], (o) => o.model)).toBeCloseTo(2, 6);
  });

  it('tasajako antaa vertailuarvon 0.667', () => {
    expect(brierScore([outcome('home', UNIFORM)], (o) => o.model)).toBeCloseTo(UNIFORM_BRIER, 6);
    expect(UNIFORM_BRIER).toBeCloseTo(2 / 3, 3);
  });

  it('vertailuarvo on sama riippumatta toteutuneesta tuloksesta', () => {
    // Tasajaon Brier ei riipu tuloksesta — siksi se on kelvollinen alaraja
    for (const side of ['home', 'draw', 'away'] as const) {
      expect(brierScore([outcome(side, UNIFORM)], (o) => o.model)).toBeCloseTo(UNIFORM_BRIER, 6);
    }
  });

  it('rankaisee varmaa virhettä ankarammin kuin varovaista', () => {
    const confident = brierScore([outcome('away', { home: 0.9, draw: 0.07, away: 0.03 })], (o) => o.model)!;
    const cautious = brierScore([outcome('away', { home: 0.4, draw: 0.3, away: 0.3 })], (o) => o.model)!;
    expect(confident).toBeGreaterThan(cautious);
  });

  it('palkitsee kalibroidun varmuuden', () => {
    const right = brierScore([outcome('home', { home: 0.9, draw: 0.07, away: 0.03 })], (o) => o.model)!;
    const hedged = brierScore([outcome('home', { home: 0.4, draw: 0.3, away: 0.3 })], (o) => o.model)!;
    expect(right).toBeLessThan(hedged);
  });

  it('keskiarvoistaa useiden otteluiden yli', () => {
    const both = brierScore([outcome('home', CERTAIN_HOME), outcome('away', CERTAIN_HOME)], (o) => o.model)!;
    expect(both).toBeCloseTo(1, 6); // (0 + 2) / 2
  });

  it('tyhjä otos → null eikä NaN', () => {
    expect(brierScore([], (o) => o.model)).toBeNull();
  });

  it('ohittaa ottelut joilta puuttuu vertailtava jakauma', () => {
    const outcomes = [outcome('home', CERTAIN_HOME, null), outcome('home', CERTAIN_HOME, CERTAIN_HOME)];
    // Markkinaa ei ole ensimmäisessä → vain toinen lasketaan
    expect(brierScore(outcomes, (o) => o.market)).toBe(0);
  });
});

describe('Log loss', () => {
  it('täydellinen ennuste antaa nollan', () => {
    expect(logLoss([outcome('home', CERTAIN_HOME)], (o) => o.model)).toBeCloseTo(0, 6);
  });

  it('leikkaa nollatodennäköisyyden eikä palauta ääretöntä', () => {
    const value = logLoss([outcome('away', CERTAIN_HOME)], (o) => o.model)!;
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeGreaterThan(5);
  });

  it('rankaisee varmaa virhettä Brieriä ankarammin', () => {
    const brierRatio =
      brierScore([outcome('away', { home: 0.9, draw: 0.07, away: 0.03 })], (o) => o.model)! /
      brierScore([outcome('away', { home: 0.4, draw: 0.3, away: 0.3 })], (o) => o.model)!;
    const logRatio =
      logLoss([outcome('away', { home: 0.9, draw: 0.07, away: 0.03 })], (o) => o.model)! /
      logLoss([outcome('away', { home: 0.4, draw: 0.3, away: 0.3 })], (o) => o.model)!;
    expect(logRatio).toBeGreaterThan(brierRatio);
  });
});

describe('Osumatarkkuus', () => {
  it('laskee osuvat ennusteet', () => {
    const outcomes = [
      outcome('home', { home: 0.6, draw: 0.2, away: 0.2 }),
      outcome('away', { home: 0.6, draw: 0.2, away: 0.2 }),
      outcome('draw', { home: 0.2, draw: 0.6, away: 0.2 }),
    ];
    const result = accuracy(outcomes, (o) => o.model);
    expect(result.total).toBe(3);
    expect(result.correct).toBe(2);
    expect(result.rate).toBeCloseTo(2 / 3, 6);
  });

  it('tyhjä otos → 0 eikä NaN', () => {
    const result = accuracy([], (o) => o.model);
    expect(result.rate).toBe(0);
    expect(Number.isNaN(result.rate)).toBe(false);
  });
});

describe('Kalibrointi', () => {
  it('täysin kalibroitu malli: ennustettu ≈ havaittu', () => {
    // 100 ottelua joissa koti saa 60 % ja voittaa täsmälleen 60 % ajasta
    const outcomes: Outcome[] = [];
    for (let i = 0; i < 100; i++) {
      outcomes.push(outcome(i < 60 ? 'home' : 'away', { home: 0.6, draw: 0.2, away: 0.2 }, null, String(i)));
    }
    const buckets = calibration(outcomes, (o) => o.model, 5);
    const homeBucket = buckets.find((b) => b.from <= 0.6 && 0.6 < b.to)!;
    expect(homeBucket.predicted).toBeCloseTo(0.6, 2);
    expect(homeBucket.observed).toBeCloseTo(0.6, 2);
  });

  it('ylivarma malli: havaittu jää ennustetun alle', () => {
    const outcomes: Outcome[] = [];
    for (let i = 0; i < 100; i++) {
      // Malli sanoo 90 %, toteutuu vain 50 % ajasta
      outcomes.push(outcome(i < 50 ? 'home' : 'away', { home: 0.9, draw: 0.05, away: 0.05 }, null, String(i)));
    }
    const bucket = calibration(outcomes, (o) => o.model, 5).find((b) => b.count > 0 && b.predicted > 0.8)!;
    expect(bucket.observed).toBeLessThan(bucket.predicted);
  });

  it('korit kattavat koko välin eikä havaintoja kadota', () => {
    const outcomes = [outcome('home', { home: 0.5, draw: 0.3, away: 0.2 })];
    const buckets = calibration(outcomes, (o) => o.model, 5);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(3); // kolme kohdetta
  });
});

describe('CLV — voitettiinko sulkeutumislinja', () => {
  it('parempi hinta kuin reilu sulkeutuminen → positiivinen CLV', () => {
    // Otettu 2.20, sulkeutumisen reilu tn 0.50 → reilu kerroin 2.00
    const r = clvFor({ matchId: 'm', side: 'home', oddsTaken: 2.2, closingFairProb: 0.5 })!;
    expect(r.fairClosingOdds).toBeCloseTo(2.0, 6);
    expect(r.clv).toBeCloseTo(0.1, 6);
  });

  it('huonompi hinta → negatiivinen CLV', () => {
    // Reilu sulkeutumiskerroin 1/0.55 = 1.818. Otettu 1.75 on sitä huonompi.
    const r = clvFor({ matchId: 'm', side: 'home', oddsTaken: 1.75, closingFairProb: 0.55 })!;
    expect(r.fairClosingOdds).toBeCloseTo(1.818, 3);
    expect(r.clv).toBeLessThan(0);
    expect(r.clv).toBeCloseTo(1.75 / (1 / 0.55) - 1, 6);
  });

  it('hinta joka näyttää matalalta voi silti voittaa linjan', () => {
    // 1.90 vaikuttaa vaatimattomalta, mutta jos markkinan lopullinen reilu
    // hinta on 1.82, se on hyvä veto. Absoluuttinen kerroin ei kerro mitään.
    const r = clvFor({ matchId: 'm', side: 'home', oddsTaken: 1.9, closingFairProb: 0.55 })!;
    expect(r.clv).toBeGreaterThan(0);
  });

  it('sama hinta → CLV nolla', () => {
    const r = clvFor({ matchId: 'm', side: 'home', oddsTaken: 2.0, closingFairProb: 0.5 })!;
    expect(r.clv).toBeCloseTo(0, 6);
  });

  it('kelvottomat syötteet → null', () => {
    expect(clvFor({ matchId: 'm', side: 'home', oddsTaken: 1.0, closingFairProb: 0.5 })).toBeNull();
    expect(clvFor({ matchId: 'm', side: 'home', oddsTaken: 2.0, closingFairProb: 0 })).toBeNull();
    expect(clvFor({ matchId: 'm', side: 'home', oddsTaken: 2.0, closingFairProb: 1 })).toBeNull();
  });

  it('yhteenveto laskee keskiarvon ja voittoprosentin', () => {
    const picks = [
      clvFor({ matchId: 'a', side: 'home', oddsTaken: 2.2, closingFairProb: 0.5 })!, // +10 %
      clvFor({ matchId: 'b', side: 'home', oddsTaken: 1.75, closingFairProb: 0.55 })!, // −3.8 %
    ];
    const summary = clvSummary(picks);
    expect(summary.count).toBe(2);
    expect(summary.beatRate).toBeCloseTo(0.5, 6);
    expect(summary.average).toBeCloseTo((picks[0].clv + picks[1].clv) / 2, 6);
  });

  it('tyhjä lista → nollat eikä NaN', () => {
    const summary = clvSummary([]);
    expect(summary.count).toBe(0);
    expect(Number.isNaN(summary.average)).toBe(false);
  });
});

describe('Paperitulos', () => {
  const actual = new Map<string, MarketSide>([
    ['a', 'home'],
    ['b', 'away'],
  ]);

  it('laskee tuoton osuneista vedoista', () => {
    const roi = paperRoi(
      [
        { matchId: 'a', side: 'home', odds: 2.0, stake: 1 },
        { matchId: 'b', side: 'home', odds: 3.0, stake: 1 },
      ],
      actual
    );
    expect(roi.bets).toBe(2);
    expect(roi.staked).toBe(2);
    expect(roi.returned).toBeCloseTo(2.0, 6);
    expect(roi.profit).toBeCloseTo(0, 6);
    expect(roi.roi).toBeCloseTo(0, 6);
    expect(roi.wins).toBe(1);
    expect(roi.hitRate).toBeCloseTo(0.5, 6);
  });

  it('ohittaa ottelut joita ei ole ratkennut', () => {
    const roi = paperRoi([{ matchId: 'tuntematon', side: 'home', odds: 2.0, stake: 1 }], actual);
    expect(roi.bets).toBe(0);
    expect(roi.roi).toBe(0);
  });

  it('voitollinen sarja antaa positiivisen ROIn', () => {
    const roi = paperRoi(
      [
        { matchId: 'a', side: 'home', odds: 2.5, stake: 1 },
        { matchId: 'b', side: 'away', odds: 2.5, stake: 1 },
      ],
      actual
    );
    expect(roi.roi).toBeCloseTo(1.5, 6);
  });

  it('tyhjä lista ei kaadu', () => {
    expect(paperRoi([], actual).roi).toBe(0);
  });
});

describe('Blend-painon kalibrointi', () => {
  it('kun Poisson on oikeassa, paras paino on lähellä ykköstä', () => {
    const samples = Array.from({ length: 60 }, () => ({
      poisson: { home: 0.8, draw: 0.1, away: 0.1 },
      market: { home: 0.34, draw: 0.33, away: 0.33 },
      actual: 'home' as MarketSide,
    }));
    const { best } = calibrateBlendWeight(samples);
    expect(best!.weight).toBeGreaterThan(0.8);
  });

  it('kun markkina on oikeassa, paras paino on lähellä nollaa', () => {
    const samples = Array.from({ length: 60 }, () => ({
      poisson: { home: 0.34, draw: 0.33, away: 0.33 },
      market: { home: 0.8, draw: 0.1, away: 0.1 },
      actual: 'home' as MarketSide,
    }));
    const { best } = calibrateBlendWeight(samples);
    expect(best!.weight).toBeLessThan(0.2);
  });

  it('kertoo kun otos on liian pieni luotettavaan viritykseen', () => {
    const few = Array.from({ length: 5 }, () => ({
      poisson: { home: 0.5, draw: 0.3, away: 0.2 },
      market: { home: 0.4, draw: 0.3, away: 0.3 },
      actual: 'home' as MarketSide,
    }));
    const result = calibrateBlendWeight(few);
    expect(result.sufficientSample).toBe(false);
    expect(result.best).not.toBeNull(); // luku annetaan, mutta varauksen kanssa
  });

  it('riittävä otos merkitään riittäväksi', () => {
    const many = Array.from({ length: MIN_SAMPLE }, () => ({
      poisson: { home: 0.5, draw: 0.3, away: 0.2 },
      market: { home: 0.4, draw: 0.3, away: 0.3 },
      actual: 'home' as MarketSide,
    }));
    expect(calibrateBlendWeight(many).sufficientSample).toBe(true);
  });

  it('kokeilee koko välin 0–1', () => {
    const samples = [{ poisson: UNIFORM, market: UNIFORM, actual: 'home' as MarketSide }];
    const { candidates } = calibrateBlendWeight(samples, 0.25);
    expect(candidates.map((c) => c.weight)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });

  it('tyhjä otos → ei suositusta', () => {
    const result = calibrateBlendWeight([]);
    expect(result.best).toBeNull();
    expect(result.sufficientSample).toBe(false);
  });
});

describe('Malli vs markkina — mittarin koko tarkoitus', () => {
  // Nämä testit dokumentoivat sen miksi vertailukohta on pakollinen:
  // absoluuttinen Brier score ei kerro onko malli hyvä.
  const outcomes: Outcome[] = [
    outcome('home', { home: 0.7, draw: 0.2, away: 0.1 }, { home: 0.5, draw: 0.3, away: 0.2 }, '1'),
    outcome('home', { home: 0.6, draw: 0.25, away: 0.15 }, { home: 0.45, draw: 0.3, away: 0.25 }, '2'),
    outcome('draw', { home: 0.5, draw: 0.3, away: 0.2 }, { home: 0.4, draw: 0.35, away: 0.25 }, '3'),
  ];

  it('molemmat lasketaan samasta otoksesta', () => {
    const model = brierScore(outcomes, (o) => o.model)!;
    const market = brierScore(outcomes, (o) => o.market)!;
    expect(model).toBeGreaterThan(0);
    expect(market).toBeGreaterThan(0);
  });

  it('kumpikin päihittää tasajaon tässä otoksessa', () => {
    expect(brierScore(outcomes, (o) => o.model)!).toBeLessThan(UNIFORM_BRIER);
    expect(brierScore(outcomes, (o) => o.market)!).toBeLessThan(UNIFORM_BRIER);
  });

  it('osumatarkkuus lasketaan molemmille', () => {
    expect(accuracy(outcomes, (o) => o.model).total).toBe(3);
    expect(accuracy(outcomes, (o) => o.market).total).toBe(3);
  });
});
