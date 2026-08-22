// Tiketti #53: Mallin luottamus, nousijapriori ja todennäköisyyserokynnys
//
// Kaikki kolme syntyivät saman päivän (22.8.2026) tuotantovioista, joissa malli
// esitti tietämättömyytensä varmuutena. Nämä testit lukitsevat sen ettei
// samaan palata.

import { describe, it, expect } from 'vitest';
import {
  modelConfidence,
  matchConfidence,
  combineSeasons,
  PROMOTED_STRENGTH,
  PREVIOUS_SEASON_WORTH,
  PROMOTED_PRIOR_WORTH,
  CONFIDENCE_HALF_POINT,
  StrengthResult,
} from '../analyze/strength.js';
import { TeamSeasonStats } from '../types-football.js';
import { LeagueAverages } from '../analyze/poisson.js';

const LEAGUE: LeagueAverages = { homeGoals: 1.5, awayGoals: 1.2 };

function stats(overrides: Partial<TeamSeasonStats> = {}): TeamSeasonStats {
  return {
    name: 'Testi', aliases: [], rank: 1, played: 0, won: 0, draw: 0, lost: 0,
    gf: 0, ga: 0, home_played: null, home_gf: null, home_ga: null,
    away_played: null, away_gf: null, away_ga: null, form: null, points: 0,
    ...overrides,
  };
}

function result(basis: StrengthResult['basis'], played: number): StrengthResult {
  return { strength: { attack: 1, defense: 1 }, basis, currentWeight: 0, playedThisSeason: played };
}

describe('modelConfidence', () => {
  it('nousee monotonisesti otteluiden myötä', () => {
    let prev = -1;
    for (const played of [0, 1, 3, 6, 12, 24, 38]) {
      const c = modelConfidence(played, true);
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  it('pysyy välillä 0–1', () => {
    for (const played of [0, 5, 100, 1000]) {
      for (const prev of [true, false]) {
        const c = modelConfidence(played, prev);
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  it('REGRESSIO: ilman mitään dataa luottamus on nolla — malli ei osallistu', () => {
    expect(modelConfidence(0, false)).toBe(0);
  });

  it('edellinen kausi antaa puolet luottamuksesta kun kausi ei ole alkanut', () => {
    // effective = 0 + 8, conf = 8/(8+8) = 0.5
    expect(modelConfidence(0, true)).toBeCloseTo(
      PREVIOUS_SEASON_WORTH / (PREVIOUS_SEASON_WORTH + CONFIDENCE_HALF_POINT),
      10
    );
  });

  it('kelvottomat syötteet eivät kaada eivätkä anna luottamusta tyhjästä', () => {
    expect(modelConfidence(NaN, false)).toBe(0);
    expect(modelConfidence(-5, false)).toBe(0);
    expect(Number.isFinite(modelConfidence(Infinity, true))).toBe(true);
  });
});

describe('matchConfidence', () => {
  it('ottaa HEIKOMMAN puolen — ennuste on vain niin hyvä kuin huonoiten tunnettu joukkue', () => {
    const tunnettu = result('current-season', 30);
    const tuntematon = result('league-average', 0);
    const c = matchConfidence(tunnettu, tuntematon);
    expect(c).toBeLessThan(matchConfidence(tunnettu, tunnettu));
    expect(c).toBeCloseTo(matchConfidence(tuntematon, tunnettu), 10); // symmetrinen
  });

  it('nousija saa heikon muttei nollan luottamuksen', () => {
    const c = matchConfidence(result('league-average', 0), result('previous-season', 0));
    expect(c).toBeGreaterThan(0);
    expect(c).toBeCloseTo(PROMOTED_PRIOR_WORTH / (PROMOTED_PRIOR_WORTH + CONFIDENCE_HALF_POINT), 10);
    // ...ja selvästi vähemmän kuin joukkue jolla on oma edellinen kausi
    expect(c).toBeLessThan(modelConfidence(0, true));
  });
});

describe('Nousijapriori', () => {
  it('REGRESSIO: nousijaa ei pidetä sarjan keskivertona', () => {
    // Tämä oli Hull Cityn ja Coventryn vika: 1.00/1.00 tarkoitti
    // "keskiverto Valioliiga-joukkue", ja siitä syntyi +292 %:n edge.
    const r = combineSeasons(stats({ played: 0 }), null, LEAGUE);
    expect(r.strength.attack).toBeLessThan(1);
    expect(r.strength.defense).toBeGreaterThan(1);
    expect(r.strength.attack).toBeCloseTo(PROMOTED_STRENGTH.attack, 6);
    expect(r.strength.defense).toBeCloseTo(PROMOTED_STRENGTH.defense, 6);
  });

  it('priori väistyy kun nousija kerää omaa dataa', () => {
    const alku = combineSeasons(stats({ played: 0 }), null, LEAGUE);
    // Vahva alku: 12 ottelua, 24 tehtyä ja 6 päästettyä
    const myohemmin = combineSeasons(stats({ played: 12, gf: 24, ga: 6 }), null, LEAGUE);
    expect(myohemmin.strength.attack).toBeGreaterThan(alku.strength.attack);
    expect(myohemmin.strength.defense).toBeLessThan(alku.strength.defense);
  });

  it('riittävällä datalla peruste vaihtuu nykyiseen kauteen eikä prioria käytetä', () => {
    const r = combineSeasons(stats({ played: 30, gf: 45, ga: 30 }), null, LEAGUE);
    expect(r.basis).toBe('current-season');
  });

  it('joukkue jolla ON edellinen kausi ei saa nousijaprioria', () => {
    const prev = stats({ played: 38, gf: 80, ga: 30 });
    const r = combineSeasons(stats({ played: 0 }), prev, LEAGUE);
    expect(r.basis).toBe('previous-season');
    // Vahva viime kausi -> hyökkäysvoima yli 1, ei nousijan 0.85
    expect(r.strength.attack).toBeGreaterThan(1);
  });
});
