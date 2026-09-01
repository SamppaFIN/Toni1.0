// Yli/alle-analyysi (tiketti #94)
//
// Tarkein lukittava asia: MALLIA VERRATAAN TOIMISTON OMAAN RAJAAN. Kiinteaan
// 2.5:een vertaaminen laskisi edgen kahdesta eri asiasta -- luku nayttaisi
// oikealta ja olisi merkityksetön.

import { describe, it, expect } from 'vitest';
import { buildTotalsView, devigPair } from './totals-analysis.js';
import { scoreMatrix } from '../analyze/poisson.js';
import type { TotalsOdds } from '../ingest/odds-football.js';

const row = (over: Record<string, unknown> = {}): TotalsOdds => ({
  bookmaker: 'Pinnacle', key: 'pinnacle', line: 2.5, over: 1.9, under: 1.95,
  commission: 0, fetched_at: '2026-09-01T12:00:00Z', link: null, ...over,
});

// Jalkapallo lambda ~1.5/1.2, jaakiekko ~2.9/2.5
const JALKAPALLO = scoreMatrix(1.5, 1.2);
const JAAKIEKKO = scoreMatrix(2.9, 2.5);

describe('devigPair', () => {
  it('summa on ykkonen marginaalin poiston jalkeen', () => {
    const d = devigPair(1.9, 1.95)!;
    expect(d.over + d.under).toBeCloseTo(1, 10);
  });

  it('halvempi kerroin saa suuremman todennakoisyyden', () => {
    const d = devigPair(1.5, 2.6)!;
    expect(d.over).toBeGreaterThan(d.under);
  });

  it('kelvoton kerroin -> null', () => {
    expect(devigPair(1, 2)).toBeNull();
    expect(devigPair(2, 0.9)).toBeNull();
    expect(devigPair(NaN, 2)).toBeNull();
  });

  it('tasakertoimet -> 50/50', () => {
    const d = devigPair(2, 2)!;
    expect(d.over).toBeCloseTo(0.5, 10);
  });
});

describe('buildTotalsView — raja ratkaisee', () => {
  it('MALLI LASKETAAN TOIMISTON RAJALLE, ei kiinteälle 2.5:lle', () => {
    const v25 = buildTotalsView([row({ line: 2.5 })], JAAKIEKKO, 100);
    const v55 = buildTotalsView([row({ line: 5.5 })], JAAKIEKKO, 100);

    const yli25 = v25.edges.find((e) => e.side === 'over')!;
    const yli55 = v55.edges.find((e) => e.side === 'over')!;

    // Jaakiekossa yli 2.5 on lahes varma, yli 5.5 ei
    expect(yli25.model_prob).toBeGreaterThan(0.9);
    expect(yli55.model_prob).toBeLessThan(0.6);
    expect(yli25.model_prob).not.toBeCloseTo(yli55.model_prob, 2);
  });

  it('yli ja alle summautuvat ykkoseen samalla rajalla', () => {
    const v = buildTotalsView([row({ line: 2.5 })], JALKAPALLO, 100);
    const yli = v.edges.find((e) => e.side === 'over')!;
    const alle = v.edges.find((e) => e.side === 'under')!;
    expect(yli.model_prob + alle.model_prob).toBeCloseTo(1, 3);
  });

  it('USEA RAJA samasta ottelusta kasitellaan erikseen', () => {
    const v = buildTotalsView([row({ line: 2.5 }), row({ line: 3.5 })], JALKAPALLO, 100);
    expect(new Set(v.edges.map((e) => e.line))).toEqual(new Set([2.5, 3.5]));
    const yli25 = v.edges.find((e) => e.line === 2.5 && e.side === 'over')!;
    const yli35 = v.edges.find((e) => e.line === 3.5 && e.side === 'over')!;
    expect(yli25.model_prob).toBeGreaterThan(yli35.model_prob);
  });

  it('rajat jarjestyksessa', () => {
    const v = buildTotalsView([row({ line: 4.5 }), row({ line: 2.5 })], JALKAPALLO, 100);
    expect(v.edges[0].line).toBe(2.5);
  });
});

describe('buildTotalsView — paras hinta ja komissio', () => {
  it('paras kerroin per puoli valitaan', () => {
    const v = buildTotalsView(
      [row({ bookmaker: 'A', over: 1.8, under: 2.1 }), row({ bookmaker: 'B', over: 2.0, under: 1.9 })],
      JALKAPALLO,
      100
    );
    expect(v.edges.find((e) => e.side === 'over')!.book).toBe('B');
    expect(v.edges.find((e) => e.side === 'under')!.book).toBe('A');
  });

  it('KOMISSIO huomioidaan parhaan valinnassa', () => {
    // Porssi 2.10 - 5 % komissio = 2.045 tehollinen, havioaa kiintealle 2.06:lle
    const v = buildTotalsView(
      [row({ bookmaker: 'Porssi', over: 2.1, commission: 0.05 }), row({ bookmaker: 'Kirja', over: 2.06 })],
      JALKAPALLO,
      100
    );
    expect(v.edges.find((e) => e.side === 'over')!.book).toBe('Kirja');
  });

  it('tehollinen kerroin on komission jalkeen', () => {
    const v = buildTotalsView([row({ over: 2.0, commission: 0.02 })], JALKAPALLO, 100);
    expect(v.edges.find((e) => e.side === 'over')!.odds_effective).toBeCloseTo(1.98, 4);
  });
});

describe('buildTotalsView — vaitilanteet', () => {
  it('ei kertoimia -> tyhja analyysi, ei virhe', () => {
    expect(buildTotalsView([], JALKAPALLO, 100).edges).toEqual([]);
  });

  it('ei mallia -> kertoimet sailyvat mutta edgeja ei lasketa', () => {
    const v = buildTotalsView([row()], null, 100);
    expect(v.books).toHaveLength(1);
    expect(v.edges).toEqual([]);
  });

  it('kertoimet sailyvat nakyvissa vaikka edgeja ei olisi', () => {
    const v = buildTotalsView([row()], JALKAPALLO, 100);
    expect(v.books).toHaveLength(1);
  });
});

describe('buildTotalsView — kynnykset ja panos', () => {
  it('PANOSSUOSITUS VAIN liputetuille — sama saanto kuin 1X2:lla', () => {
    const v = buildTotalsView([row()], JALKAPALLO, 100);
    for (const e of v.edges) {
      if (e.flag === 'none') expect(e.stake_suggestion, `${e.side} ${e.line}`).toBe(0);
    }
  });

  it('selva ylikerroin saa lipun ja panoksen', () => {
    // Jaakiekkomatriisi mutta jalkapallon raja -> yli 2.5 lahes varma,
    // ja kerroin 1.9 on silloin raju ylikerroin
    const v = buildTotalsView([row({ line: 2.5, over: 1.9 })], JAAKIEKKO, 100);
    const yli = v.edges.find((e) => e.side === 'over')!;
    expect(yli.flag).not.toBe('none');
    expect(yli.stake_suggestion).toBeGreaterThan(0);
  });

  it('edge lasketaan tehollisesta kertoimesta', () => {
    const v = buildTotalsView([row({ line: 2.5, over: 1.9 })], JAAKIEKKO, 100);
    const yli = v.edges.find((e) => e.side === 'over')!;
    expect(yli.edge).toBeCloseTo(yli.model_prob * yli.odds_effective - 1, 3);
  });

  it('implisiittiset summautuvat ykkoseen', () => {
    const v = buildTotalsView([row()], JALKAPALLO, 100);
    const yli = v.edges.find((e) => e.side === 'over')!;
    const alle = v.edges.find((e) => e.side === 'under')!;
    expect(yli.implied_prob + alle.implied_prob).toBeCloseTo(1, 3);
  });
});
