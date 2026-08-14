// Tiketti #33: Mallin arviointimittarit
//
// Yksi luku ei kerro mitään ilman vertailukohtaa. Siksi jokainen mittari
// lasketaan myös MARKKINALLE ja arvaukselle:
//
//   malli 0.58 Brier — onko se hyvä? Ei tiedä.
//   malli 0.58, markkina 0.61, arvaus 0.67 — nyt tietää.
//
// Tämä on koko moduulin suunnitteluperiaate: absoluuttiset luvut piilotetaan
// vertailun taakse, koska absoluuttinen Brier score on tulkitsematon.

import { pathToFileURL } from 'node:url';
import { SideProbs, MarketSide } from '../types-football.js';

export const SIDES: MarketSide[] = ['home', 'draw', 'away'];

/** Alle tämän otoskoon mittarit ovat kohinaa eikä niitä pidä esittää päätelmänä */
export const MIN_SAMPLE = 20;

export interface Outcome {
  matchId: string;
  actual: MarketSide;
  /** Mallin todennäköisyydet ennen ottelua */
  model: SideProbs;
  /** Markkinan devigatut todennäköisyydet ennen ottelua — vertailukohta */
  market: SideProbs | null;
}

// ─── Osumatarkkuus ────────────────────────────────────────────────────────

/** Todennäköisin kohde */
export function argmax(probs: SideProbs): MarketSide {
  return SIDES.reduce((best, side) => (probs[side] > probs[best] ? side : best), 'home' as MarketSide);
}

export interface AccuracyResult {
  total: number;
  correct: number;
  rate: number;
}

export function accuracy(outcomes: Outcome[], pick: (o: Outcome) => SideProbs | null): AccuracyResult {
  const usable = outcomes.filter((o) => pick(o) !== null);
  const correct = usable.filter((o) => argmax(pick(o)!) === o.actual).length;
  return { total: usable.length, correct, rate: usable.length ? correct / usable.length : 0 };
}

// ─── Brier score ──────────────────────────────────────────────────────────

/**
 * Moniluokkainen Brier score: Σ(p_k − o_k)² keskiarvoistettuna.
 *
 * Pienempi on parempi. Vaihteluväli 0–2.
 * Vertailuarvoja: täydellinen ennustaja 0, tasajako (1/3 kaikille) 0.667,
 * täysin väärä varma ennuste 2.
 *
 * Brier mittaa sekä osumatarkkuutta että kalibrointia: 90 %:n varmuudella
 * annettu väärä ennuste rangaistaan kovemmin kuin 40 %:n varmuudella annettu.
 */
export function brierScore(outcomes: Outcome[], pick: (o: Outcome) => SideProbs | null): number | null {
  const usable = outcomes.filter((o) => pick(o) !== null);
  if (!usable.length) return null;

  const sum = usable.reduce((total, o) => {
    const probs = pick(o)!;
    return total + SIDES.reduce((s, side) => s + (probs[side] - (side === o.actual ? 1 : 0)) ** 2, 0);
  }, 0);

  return sum / usable.length;
}

/**
 * Logaritminen häviö: −ln(p_toteutunut) keskiarvoistettuna.
 *
 * Rankaisee Brieriä ankarammin varmoista virheistä. Jos malli antaa
 * toteutuneelle tulokselle 0 %, log loss on ääretön — siksi leikkaus.
 */
export function logLoss(outcomes: Outcome[], pick: (o: Outcome) => SideProbs | null, floor = 0.001): number | null {
  const usable = outcomes.filter((o) => pick(o) !== null);
  if (!usable.length) return null;

  const sum = usable.reduce((total, o) => {
    const p = Math.max(floor, pick(o)![o.actual]);
    return total - Math.log(p);
  }, 0);

  return sum / usable.length;
}

/** Tasajaon Brier — alaraja jonka alle mallin on päästävä ollakseen hyödyllinen */
export const UNIFORM_BRIER = SIDES.reduce((s, side) => s + (1 / 3 - (side === 'home' ? 1 : 0)) ** 2, 0);

// ─── Kalibrointi ──────────────────────────────────────────────────────────

export interface CalibrationBucket {
  /** Ennustettu todennäköisyysväli, esim. 0.4–0.5 */
  from: number;
  to: number;
  predicted: number;
  observed: number;
  count: number;
}

/**
 * Kalibrointi: kun malli sanoo 70 %, tapahtuuko se oikeasti 70 % ajasta?
 *
 * Jokainen ottelu tuottaa kolme havaintoa (koti, tasa, vieras), koska
 * kalibrointia arvioidaan todennäköisyyksien eikä otteluiden tasolla.
 */
export function calibration(outcomes: Outcome[], pick: (o: Outcome) => SideProbs | null, buckets = 5): CalibrationBucket[] {
  const width = 1 / buckets;
  const result: CalibrationBucket[] = [];

  for (let i = 0; i < buckets; i++) {
    const from = i * width;
    const to = (i + 1) * width;
    const points: Array<{ p: number; hit: number }> = [];

    for (const o of outcomes) {
      const probs = pick(o);
      if (!probs) continue;
      for (const side of SIDES) {
        const p = probs[side];
        // Viimeinen kori ottaa ylärajan mukaan
        if (p >= from && (p < to || (i === buckets - 1 && p <= to))) {
          points.push({ p, hit: side === o.actual ? 1 : 0 });
        }
      }
    }

    result.push({
      from,
      to,
      predicted: points.length ? points.reduce((s, x) => s + x.p, 0) / points.length : 0,
      observed: points.length ? points.reduce((s, x) => s + x.hit, 0) / points.length : 0,
      count: points.length,
    });
  }

  return result;
}

// ─── CLV (closing line value) ─────────────────────────────────────────────

export interface ClvInput {
  matchId: string;
  side: MarketSide;
  /** Kerroin jonka olisi saanut kun kohde liputettiin */
  oddsTaken: number;
  /** Markkinan devigattu todennäköisyys juuri ennen ottelua */
  closingFairProb: number;
}

export interface ClvResult {
  matchId: string;
  side: MarketSide;
  oddsTaken: number;
  fairClosingOdds: number;
  /** > 0 = saatiin parempi hinta kuin markkinan lopullinen reilu hinta */
  clv: number;
}

/**
 * CLV: voitettiinko sulkeutumislinja?
 *
 * CLV = otettu_kerroin / reilu_sulkeutumiskerroin − 1
 *
 * Miksi tämä on tärkein yksittäinen mittari: se ei tarvitse ottelutuloksia
 * ollenkaan. Kymmenen ottelun tulokset ovat kohinaa, mutta kymmenen ottelun
 * CLV kertoo jo jotain siitä osuuko malli hinnoitteluvirheisiin. Jos CLV on
 * systemaattisesti positiivinen, tuotto seuraa perässä. Jos negatiivinen,
 * voitollinen jakso oli tuuria.
 */
export function clvFor(input: ClvInput): ClvResult | null {
  if (!(input.oddsTaken > 1) || !(input.closingFairProb > 0) || input.closingFairProb >= 1) return null;
  const fairClosingOdds = 1 / input.closingFairProb;
  return {
    matchId: input.matchId,
    side: input.side,
    oddsTaken: input.oddsTaken,
    fairClosingOdds,
    clv: input.oddsTaken / fairClosingOdds - 1,
  };
}

export interface ClvSummary {
  count: number;
  /** Keskimääräinen CLV */
  average: number;
  /** Osuus valinnoista joissa sulkeutumislinja voitettiin */
  beatRate: number;
}

export function clvSummary(results: ClvResult[]): ClvSummary {
  if (!results.length) return { count: 0, average: 0, beatRate: 0 };
  return {
    count: results.length,
    average: results.reduce((s, r) => s + r.clv, 0) / results.length,
    beatRate: results.filter((r) => r.clv > 0).length / results.length,
  };
}

// ─── Paperitulos ──────────────────────────────────────────────────────────

export interface PaperBet {
  matchId: string;
  side: MarketSide;
  odds: number;
  stake: number;
}

export interface RoiResult {
  bets: number;
  staked: number;
  returned: number;
  profit: number;
  /** Tuotto panostettua kohden, esim. 0.05 = 5 % */
  roi: number;
  wins: number;
  hitRate: number;
}

/**
 * Paperitulos: mitä tapahtuisi jos jokaiseen liputettuun kohteeseen olisi
 * panostettu. Ei oikeaa rahaa — mittari mallin signaalin arvosta.
 */
export function paperRoi(bets: PaperBet[], actualBySide: Map<string, MarketSide>): RoiResult {
  let staked = 0;
  let returned = 0;
  let wins = 0;
  let counted = 0;

  for (const bet of bets) {
    const actual = actualBySide.get(bet.matchId);
    if (!actual) continue; // ottelu ei ole päättynyt
    counted++;
    staked += bet.stake;
    if (bet.side === actual) {
      returned += bet.stake * bet.odds;
      wins++;
    }
  }

  return {
    bets: counted,
    staked,
    returned,
    profit: returned - staked,
    roi: staked > 0 ? (returned - staked) / staked : 0,
    wins,
    hitRate: counted ? wins / counted : 0,
  };
}

// ─── Blend-painon kalibrointi ─────────────────────────────────────────────

export interface BlendCandidate {
  weight: number;
  brier: number;
  logLoss: number;
}

/**
 * Etsi blend-paino joka minimoi Brier scoren toteutuneita tuloksia vasten.
 *
 * `w` on ainoa vapaa parametri mallissa (poisson.ts:n rho ja shrinkage-k ovat
 * empiirisiä oletuksia). Tämä funktio kertoo mitä data sanoo siitä — mutta
 * vain jos otos on riittävä. Kahdenkymmenen ottelun perusteella viritetty w
 * on ylisovitettu eikä kerro mitään tulevasta.
 */
export function calibrateBlendWeight(
  samples: Array<{ poisson: SideProbs; market: SideProbs; actual: MarketSide }>,
  step = 0.05
): { best: BlendCandidate | null; candidates: BlendCandidate[]; sufficientSample: boolean } {
  const candidates: BlendCandidate[] = [];

  for (let w = 0; w <= 1.0001; w += step) {
    const weight = Math.round(w * 100) / 100;
    const outcomes: Outcome[] = samples.map((s, i) => ({
      matchId: String(i),
      actual: s.actual,
      market: s.market,
      model: normalize({
        home: weight * s.poisson.home + (1 - weight) * s.market.home,
        draw: weight * s.poisson.draw + (1 - weight) * s.market.draw,
        away: weight * s.poisson.away + (1 - weight) * s.market.away,
      }),
    }));

    const brier = brierScore(outcomes, (o) => o.model);
    const ll = logLoss(outcomes, (o) => o.model);
    if (brier !== null && ll !== null) candidates.push({ weight, brier, logLoss: ll });
  }

  const best = candidates.length ? candidates.reduce((a, b) => (b.brier < a.brier ? b : a)) : null;
  return { best, candidates, sufficientSample: samples.length >= MIN_SAMPLE };
}

function normalize(p: SideProbs): SideProbs {
  const total = p.home + p.draw + p.away;
  if (total <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: p.home / total, draw: p.draw / total, away: p.away / total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Demonstraatio: sama ennuste, kaksi eri lopputulosta
  const confidentRight: Outcome = {
    matchId: '1',
    actual: 'home',
    model: { home: 0.9, draw: 0.07, away: 0.03 },
    market: { home: 0.6, draw: 0.25, away: 0.15 },
  };
  const confidentWrong: Outcome = { ...confidentRight, matchId: '2', actual: 'away' };
  const cautious: Outcome = {
    matchId: '3',
    actual: 'away',
    model: { home: 0.4, draw: 0.3, away: 0.3 },
    market: { home: 0.4, draw: 0.3, away: 0.3 },
  };

  console.log('Brier score — pienempi on parempi, tasajako = ' + UNIFORM_BRIER.toFixed(3) + '\n');
  for (const [label, o] of [
    ['varma ja oikeassa', confidentRight],
    ['varma ja väärässä', confidentWrong],
    ['varovainen ja väärässä', cautious],
  ] as const) {
    console.log(`  ${label.padEnd(24)} Brier ${brierScore([o], (x) => x.model)!.toFixed(3)}  log loss ${logLoss([o], (x) => x.model)!.toFixed(3)}`);
  }

  console.log('\nCLV — voitettiinko sulkeutumislinja?');
  for (const [taken, closing] of [
    [2.20, 0.45],
    [2.20, 0.50],
    [1.90, 0.55],
  ] as const) {
    const r = clvFor({ matchId: 'x', side: 'home', oddsTaken: taken, closingFairProb: closing })!;
    console.log(
      `  otettu ${taken.toFixed(2)}, reilu sulkeutuminen ${r.fairClosingOdds.toFixed(2)} → CLV ${(r.clv * 100 >= 0 ? '+' : '') + (r.clv * 100).toFixed(1)} %`
    );
  }
}
