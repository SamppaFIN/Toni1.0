// Tiketti #48: Sarjan maalikeskiarvojen kutistus prioriin
//
// REGRESSIOTESTI AIDOSTA TUOTANTOVIASTA (22.8.2026):
// Valioliigan avauskierroksella oli pelattu tasan yksi ottelu (Arsenal 3–0
// Coventry). Vierasjoukkueet olivat tehneet 0 maalia 1 ottelussa → mitattu
// awayGoalsAvg = 0.00 → λ_vieras = 0 kaikkiin 9 Valioliigan otteluun.
// Malli väitti että jokainen vierasjoukkue tekee nolla maalia varmuudella,
// ja tuotti +292 %:n "value-kohteita" jotka olivat laskentaroskaa.

import { describe, it, expect } from 'vitest';
import {
  shrinkLeagueAverages,
  LEAGUE_AVG_PRIOR_MATCHES,
  DEFAULT_LEAGUE,
  predictPoisson,
  teamStrength,
} from '../analyze/poisson.js';
import { parseStandings } from '../ingest/stats-footballdata.js';
import { isUsableLambda } from '../publish/live-snapshot.js';

describe('shrinkLeagueAverages', () => {
  it('REGRESSIO: yksi ottelu jossa vieras teki 0 maalia ei tuota nollakeskiarvoa', () => {
    const avg = shrinkLeagueAverages(3, 1, 0, 1);
    expect(avg.awayGoals).toBeGreaterThan(0.5);
    expect(avg.homeGoals).toBeGreaterThan(0.5);
  });

  it('pieni otos pysyy lähellä prioria', () => {
    const avg = shrinkLeagueAverages(3, 1, 0, 1);
    expect(avg.homeGoals).toBeCloseTo((3 + 1.5 * 10) / 11, 5);
    expect(avg.awayGoals).toBeCloseTo((0 + 1.2 * 10) / 11, 5);
    // Olennaista ei ole tarkka luku vaan se, että yhden ottelun otos jää
    // realistiselle alueelle eikä romahda nollaan niin kuin tuotannossa kävi.
    expect(avg.awayGoals).toBeGreaterThan(0.9);
    expect(avg.awayGoals).toBeLessThan(DEFAULT_LEAGUE.awayGoals);
  });

  it('iso otos konvergoi mitattuun keskiarvoon', () => {
    // 380 ottelua, koti 1.8 / vieras 1.4 maalia per ottelu
    const avg = shrinkLeagueAverages(380 * 1.8, 380, 380 * 1.4, 380);
    expect(avg.homeGoals).toBeCloseTo(1.8, 1);
    expect(avg.awayGoals).toBeCloseTo(1.4, 1);
  });

  it('tyhjä sarja palauttaa täsmälleen priorin', () => {
    const avg = shrinkLeagueAverages(0, 0, 0, 0);
    expect(avg.homeGoals).toBeCloseTo(DEFAULT_LEAGUE.homeGoals, 6);
    expect(avg.awayGoals).toBeCloseTo(DEFAULT_LEAGUE.awayGoals, 6);
  });

  it('palauttaa aina positiiviset keskiarvot kelvottomillakin syötteillä', () => {
    for (const args of [
      [NaN, NaN, NaN, NaN],
      [-5, -1, -5, -1],
      [Infinity, 0, 0, Infinity],
    ] as const) {
      const avg = shrinkLeagueAverages(...(args as [number, number, number, number]));
      expect(avg.homeGoals).toBeGreaterThan(0);
      expect(avg.awayGoals).toBeGreaterThan(0);
      expect(Number.isFinite(avg.homeGoals)).toBe(true);
      expect(Number.isFinite(avg.awayGoals)).toBe(true);
    }
  });

  it('priorin paino on dokumentoitu vakio', () => {
    expect(LEAGUE_AVG_PRIOR_MATCHES).toBe(10);
  });
});

describe('parseStandings — avauskierroksen suoja', () => {
  /** Aito rakenne: yksi pelattu ottelu, muut 0 */
  const openingDay = {
    competition: { name: 'Premier League', code: 'PL' },
    season: { startDate: '2026-08-14', endDate: '2027-05-23' },
    standings: [
      {
        type: 'TOTAL' as const,
        table: [
          { position: 1, team: { id: 1, name: 'Arsenal FC' }, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 3, goalsAgainst: 0, points: 3 },
          { position: 2, team: { id: 2, name: 'Coventry City FC' }, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 0, goalsAgainst: 3, points: 0 },
        ],
      },
      {
        type: 'HOME' as const,
        table: [{ position: 1, team: { id: 1, name: 'Arsenal FC' }, playedGames: 1, won: 1, draw: 0, lost: 0, goalsFor: 3, goalsAgainst: 0, points: 3 }],
      },
      {
        type: 'AWAY' as const,
        table: [{ position: 2, team: { id: 2, name: 'Coventry City FC' }, playedGames: 1, won: 0, draw: 0, lost: 1, goalsFor: 0, goalsAgainst: 3, points: 0 }],
      },
    ],
  };

  const parsed = parseStandings(openingDay as any);

  it('REGRESSIO: awayGoalsAvg ei ole nolla vaikka vieras teki 0 maalia', () => {
    expect(parsed.awayGoalsAvg).toBeGreaterThan(0.5);
  });

  it('merkitsee luvut estimoiduiksi kun otos on priorin kokoa pienempi', () => {
    expect(parsed.splitsEstimated).toBe(true);
  });

  it('REGRESSIO: näistä keskiarvoista laskettu λ on kelvollinen molemmille', () => {
    const league = { homeGoals: parsed.homeGoalsAvg, awayGoals: parsed.awayGoalsAvg };
    const strong = teamStrength(2.0, 0.8, league);
    const weak = teamStrength(0.9, 1.9, league);
    const p = predictPoisson(strong, weak, league);

    expect(isUsableLambda(p.lambdaHome)).toBe(true);
    expect(isUsableLambda(p.lambdaAway)).toBe(true);
    // Ja siitä seuraa ettei mikään lopputulos ole mahdoton
    expect(p.probs.away).toBeGreaterThan(0);
    expect(p.btts).toBeGreaterThan(0);
  });
});

describe('isUsableLambda', () => {
  it('hylkää nollan — se oli koko vian oire', () => {
    expect(isUsableLambda(0)).toBe(false);
  });

  it('hylkää mielivaltaisen pienen, negatiivisen ja kelvottoman', () => {
    for (const bad of [0.001, -1, NaN, Infinity, -Infinity]) {
      expect(isUsableLambda(bad)).toBe(false);
    }
  });

  it('hylkää epäuskottavan suuren (rikkinäinen sarjataulukko)', () => {
    expect(isUsableLambda(12)).toBe(false);
  });

  it('hyväksyy realistiset arvot', () => {
    for (const ok of [0.4, 1.2, 1.5, 2.7, 4]) {
      expect(isUsableLambda(ok)).toBe(true);
    }
  });
});
