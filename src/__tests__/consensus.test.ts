import { describe, it, expect } from 'vitest';
import { consensusProbs, sharpAnchor, blendProbs, normalize, DEFAULT_BLEND_WEIGHT } from '../analyze/consensus.js';
import { BookmakerOdds, SideProbs } from '../types-football.js';

function row(bookmaker: string, key: string, home: number, draw: number, away: number): BookmakerOdds {
  return { bookmaker, key, market: '1X2', home, draw, away, commission: 0, fetched_at: '2026-08-14T09:00:00.000Z' };
}

const ROWS: BookmakerOdds[] = [
  row('Pinnacle', 'pinnacle', 2.10, 3.45, 3.60),
  row('Unibet', 'unibet_eu', 2.15, 3.40, 3.55),
  row('Betsson', 'betsson', 2.05, 3.50, 3.50),
];

describe('Markkinakonsensus', () => {
  it('summautuu ykköseen', () => {
    const c = consensusProbs(ROWS)!;
    expect(c.home + c.draw + c.away).toBeCloseTo(1.0, 6);
  });

  it('tyhjä lista → null', () => {
    expect(consensusProbs([])).toBeNull();
  });

  it('yksi toimisto → sama kuin sen devigattu todennäköisyys', () => {
    const c = consensusProbs([row('X', 'x', 2.0, 3.0, 4.0)])!;
    // 1/2, 1/3, 1/4 → summa 13/12 → 0.4615 / 0.3077 / 0.2308
    expect(c.home).toBeCloseTo(0.4615, 3);
    expect(c.draw).toBeCloseTo(0.3077, 3);
    expect(c.away).toBeCloseTo(0.2308, 3);
  });

  it('mediaani on robusti yksittäiselle poikkeavalle kertoimelle', () => {
    const withOutlier = [...ROWS, row('Virhe', 'virhe', 9.99, 3.45, 3.60)];
    const base = consensusProbs(ROWS)!;
    const outlier = consensusProbs(withOutlier)!;
    // Poikkeama siirtää mediaania vain vähän — keskiarvo romahtaisi
    expect(Math.abs(outlier.home - base.home)).toBeLessThan(0.05);
  });

  it('suosikki saa suurimman todennäköisyyden', () => {
    const c = consensusProbs(ROWS)!;
    expect(c.home).toBeGreaterThan(c.draw);
    expect(c.home).toBeGreaterThan(c.away);
  });
});

describe('Sharp-ankkuri', () => {
  it('valitsee Pinnaclen kun se on saatavilla', () => {
    expect(sharpAnchor(ROWS)!.source).toBe('Pinnacle');
  });

  it('putoaa mediaaniin kun sharp-toimistoa ei ole', () => {
    const anchor = sharpAnchor([row('Unibet', 'unibet_eu', 2.15, 3.40, 3.55), row('Betsson', 'betsson', 2.05, 3.50, 3.50)])!;
    expect(anchor.source).toContain('mediaani');
  });

  it('tunnistaa toimiston avaimen etuliitteestä (pinnacle vs pinnacle_eu)', () => {
    const anchor = sharpAnchor([row('Pinnacle EU', 'pinnacle_eu', 2.0, 3.5, 3.8)])!;
    expect(anchor.source).toBe('Pinnacle EU');
  });

  it('ankkurin todennäköisyydet summautuvat ykköseen', () => {
    const a = sharpAnchor(ROWS)!;
    expect(a.probs.home + a.probs.draw + a.probs.away).toBeCloseTo(1.0, 6);
  });

  it('tyhjä lista → null', () => {
    expect(sharpAnchor([])).toBeNull();
  });
});

describe('Blendi', () => {
  const poisson: SideProbs = { home: 0.60, draw: 0.20, away: 0.20 };
  const sharp: SideProbs = { home: 0.40, draw: 0.30, away: 0.30 };

  it('summautuu ykköseen', () => {
    const b = blendProbs(poisson, sharp, 0.35);
    expect(b.home + b.draw + b.away).toBeCloseTo(1.0, 6);
  });

  it('w=0 → puhdas markkina', () => {
    const b = blendProbs(poisson, sharp, 0);
    expect(b.home).toBeCloseTo(sharp.home, 6);
  });

  it('w=1 → puhdas oma malli', () => {
    const b = blendProbs(poisson, sharp, 1);
    expect(b.home).toBeCloseTo(poisson.home, 6);
  });

  it('w=0.35 antaa käsin lasketun arvon', () => {
    // 0.35 × 0.60 + 0.65 × 0.40 = 0.21 + 0.26 = 0.47
    expect(blendProbs(poisson, sharp, 0.35).home).toBeCloseTo(0.47, 6);
  });

  it('blendi asettuu mallin ja markkinan väliin', () => {
    const b = blendProbs(poisson, sharp, DEFAULT_BLEND_WEIGHT);
    expect(b.home).toBeGreaterThan(sharp.home);
    expect(b.home).toBeLessThan(poisson.home);
  });

  it('ilman ankkuria palautetaan malli normalisoituna', () => {
    const b = blendProbs(poisson, null);
    expect(b.home).toBeCloseTo(poisson.home, 6);
  });

  it('w rajataan välille 0–1', () => {
    expect(blendProbs(poisson, sharp, 5).home).toBeCloseTo(poisson.home, 6);
    expect(blendProbs(poisson, sharp, -5).home).toBeCloseTo(sharp.home, 6);
  });
});

describe('Normalisointi', () => {
  it('korjaa summan ykköseen', () => {
    const n = normalize({ home: 2, draw: 1, away: 1 });
    expect(n.home).toBeCloseTo(0.5, 6);
    expect(n.home + n.draw + n.away).toBeCloseTo(1.0, 6);
  });

  it('nollasumma → tasajako eikä NaN', () => {
    const n = normalize({ home: 0, draw: 0, away: 0 });
    expect(n.home).toBeCloseTo(1 / 3, 6);
    expect(Number.isNaN(n.home)).toBe(false);
  });
});
