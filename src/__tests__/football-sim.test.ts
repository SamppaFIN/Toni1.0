// Tiketti #32: Simulaation tilastollinen oikeellisuus
//
// Simulaatio on selainmoduuli (public/app/football-sim.js), mutta sen ydin on
// puhdasta laskentaa ja se testataan täältä. Testattava väite on tämän tiketin
// keskeisin suunnitteluratkaisu:
//
//   Simulaation lopputulosten jakauma vastaa kortilla näkyviä mallin
//   todennäköisyyksiä.
//
// Jos tämä ei pidä, kortti lupaa 74 % kotivoittoa ja simulaatio tuottaa jotain
// muuta — eikä käyttäjä voi luottaa kumpaankaan lukuun.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import { simulateMatch } from '../../public/app/football-sim.js';

interface SimResult {
  finalScore: { home: number; away: number };
  outcome: 'home' | 'draw' | 'away';
  predicted: 'home' | 'draw' | 'away';
  events: Array<{ type: string; side: string; minute: number }>;
  over25: boolean;
  btts: boolean;
  simulated: boolean;
  corners: { home: number; away: number };
  addedFirst: number;
  addedSecond: number;
}

function match(probs: { home: number; draw: number; away: number }, lambdaHome = 1.5, lambdaAway = 1.2) {
  return {
    id: 'test:1',
    league: 'Testiliiga',
    home: { name: 'Koti', short: 'KOT', color: '#000' },
    away: { name: 'Vieras', short: 'VIE', color: '#fff' },
    model: { probs, lambda_home: lambdaHome, lambda_away: lambdaAway },
  };
}

function runMany(m: ReturnType<typeof match>, n: number): SimResult[] {
  return Array.from({ length: n }, () => simulateMatch(m) as SimResult);
}

describe('Simulaatio toistaa mallin todennäköisyydet', () => {
  const N = 4000;

  it('selvä kotisuosikki: osuudet vastaavat mallia ±3 prosenttiyksikköä', () => {
    const probs = { home: 0.74, draw: 0.16, away: 0.10 };
    const sims = runMany(match(probs, 2.6, 0.8), N);

    for (const side of ['home', 'draw', 'away'] as const) {
      const observed = sims.filter((s) => s.outcome === side).length / N;
      expect(Math.abs(observed - probs[side]), `${side}: havaittu ${observed.toFixed(3)}, malli ${probs[side]}`).toBeLessThan(0.03);
    }
  });

  it('tasainen ottelu: osuudet vastaavat mallia', () => {
    const probs = { home: 0.38, draw: 0.30, away: 0.32 };
    const sims = runMany(match(probs, 1.4, 1.3), N);

    for (const side of ['home', 'draw', 'away'] as const) {
      const observed = sims.filter((s) => s.outcome === side).length / N;
      expect(Math.abs(observed - probs[side]), side).toBeLessThan(0.03);
    }
  });

  it('altavastaajan voitto toteutuu mallin osuudella eikä katoa', () => {
    // Hylkäysotanta voisi epäonnistua epätodennäköisillä lopputuloksilla ja
    // vääristää jakaumaa — tämä varmistaa ettei niin käy
    const probs = { home: 0.08, draw: 0.14, away: 0.78 };
    const sims = runMany(match(probs, 0.7, 2.4), N);
    const observed = sims.filter((s) => s.outcome === 'home').length / N;
    expect(observed).toBeGreaterThan(0.05);
    expect(Math.abs(observed - 0.08)).toBeLessThan(0.03);
  });
});

describe('Lopputulos ja tapahtumat ovat keskenään johdonmukaisia', () => {
  const sims = runMany(match({ home: 0.45, draw: 0.27, away: 0.28 }), 600);

  it('kirjattu lopputulos vastaa maalimääriä', () => {
    for (const s of sims) {
      const expected = s.finalScore.home > s.finalScore.away ? 'home' : s.finalScore.home < s.finalScore.away ? 'away' : 'draw';
      expect(s.outcome, `${s.finalScore.home}-${s.finalScore.away}`).toBe(expected);
    }
  });

  it('maalitapahtumien määrä vastaa lopputulosta', () => {
    for (const s of sims) {
      const homeGoals = s.events.filter((e) => e.type === 'goal' && e.side === 'home').length;
      const awayGoals = s.events.filter((e) => e.type === 'goal' && e.side === 'away').length;
      expect(homeGoals).toBe(s.finalScore.home);
      expect(awayGoals).toBe(s.finalScore.away);
    }
  });

  it('sivumarkkinat vastaavat lopputulosta', () => {
    for (const s of sims) {
      expect(s.over25).toBe(s.finalScore.home + s.finalScore.away > 2.5);
      expect(s.btts).toBe(s.finalScore.home > 0 && s.finalScore.away > 0);
    }
  });

  it('tapahtumat ovat aikajärjestyksessä ja peliajan sisällä', () => {
    for (const s of sims) {
      let previous = 0;
      for (const e of s.events) {
        expect(e.minute).toBeGreaterThanOrEqual(previous);
        expect(e.minute).toBeGreaterThan(0);
        expect(e.minute).toBeLessThanOrEqual(90);
        previous = e.minute;
      }
    }
  });

  it('jokainen tulos on merkitty simuloiduksi', () => {
    expect(sims.every((s) => s.simulated === true)).toBe(true);
  });
});

describe('Maalimäärät ovat jalkapallolle realistisia', () => {
  it('keskimääräinen maalimäärä on λ-summan tuntumassa', () => {
    // λ 1.5 + 1.2 = 2.7. Ehdollinen otanta siirtää keskiarvoa hieman, mutta
    // sen pitää pysyä uskottavalla jalkapallovälillä.
    const sims = runMany(match({ home: 0.44, draw: 0.27, away: 0.29 }, 1.5, 1.2), 3000);
    const avg = sims.reduce((sum, s) => sum + s.finalScore.home + s.finalScore.away, 0) / sims.length;
    expect(avg).toBeGreaterThan(2.0);
    expect(avg).toBeLessThan(3.4);
  });

  it('nollapelejä ja runsasmaalisia otteluita esiintyy molempia', () => {
    const sims = runMany(match({ home: 0.44, draw: 0.27, away: 0.29 }, 1.5, 1.2), 2000);
    expect(sims.some((s) => s.finalScore.home + s.finalScore.away === 0)).toBe(true);
    expect(sims.some((s) => s.finalScore.home + s.finalScore.away >= 4)).toBe(true);
  });

  it('maalimäärä ei karkaa järjettömiin lukemiin', () => {
    const sims = runMany(match({ home: 0.44, draw: 0.27, away: 0.29 }, 1.5, 1.2), 2000);
    expect(Math.max(...sims.map((s) => s.finalScore.home + s.finalScore.away))).toBeLessThan(13);
  });

  it('toimii myös ilman λ-arvoja (market-only-ottelu)', () => {
    const marketOnly = {
      ...match({ home: 0.4, draw: 0.3, away: 0.3 }),
      model: { probs: { home: 0.4, draw: 0.3, away: 0.3 }, lambda_home: null, lambda_away: null },
    };
    const sims = Array.from({ length: 400 }, () => simulateMatch(marketOnly) as SimResult);
    const avg = sims.reduce((sum, s) => sum + s.finalScore.home + s.finalScore.away, 0) / sims.length;
    expect(avg).toBeGreaterThan(1.5);
    expect(avg).toBeLessThan(4);
    // Ja jakauma noudattaa silti mallia
    const home = sims.filter((s) => s.outcome === 'home').length / sims.length;
    expect(Math.abs(home - 0.4)).toBeLessThan(0.08);
  });
});

describe('Kortit ja muut tapahtumat', () => {
  const sims = runMany(match({ home: 0.44, draw: 0.27, away: 0.29 }), 1500);

  it('keltaisia kortteja tulee jalkapallolle uskottava määrä', () => {
    const avg = sims.reduce((sum, s) => sum + s.events.filter((e) => e.type === 'yellow').length, 0) / sims.length;
    expect(avg).toBeGreaterThan(2);
    expect(avg).toBeLessThan(6);
  });

  it('punainen kortti on harvinainen muttei mahdoton', () => {
    const rate = sims.filter((s) => s.events.some((e) => e.type === 'red')).length / sims.length;
    expect(rate).toBeGreaterThan(0.05);
    expect(rate).toBeLessThan(0.45);
  });

  it('lisäajat ovat realistisia', () => {
    for (const s of sims) {
      expect(s.addedFirst).toBeGreaterThanOrEqual(1);
      expect(s.addedFirst).toBeLessThanOrEqual(3);
      expect(s.addedSecond).toBeGreaterThanOrEqual(2);
      expect(s.addedSecond).toBeLessThanOrEqual(5);
    }
  });

  it('kulmia tulee enemmän kuin maaleja', () => {
    const avgCorners = sims.reduce((s, x) => s + x.corners.home + x.corners.away, 0) / sims.length;
    const avgGoals = sims.reduce((s, x) => s + x.finalScore.home + x.finalScore.away, 0) / sims.length;
    expect(avgCorners).toBeGreaterThan(avgGoals);
    expect(avgCorners).toBeLessThan(22);
  });
});
