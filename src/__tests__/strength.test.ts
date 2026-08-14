import { describe, it, expect } from 'vitest';
import { combineSeasons, rawStrength, regressToMean, strengthForTeam, SEASON_REGRESSION } from '../analyze/strength.js';
import { LeagueAverages } from '../analyze/poisson.js';
import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';

const LEAGUE: LeagueAverages = { homeGoals: 1.55, awayGoals: 1.25 };

function team(name: string, played: number, gf: number, ga: number, rank = 1): TeamSeasonStats {
  return {
    name,
    aliases: [],
    rank,
    played,
    won: 0,
    draw: 0,
    lost: 0,
    gf,
    ga,
    home_played: null,
    home_gf: null,
    home_ga: null,
    away_played: null,
    away_gf: null,
    away_ga: null,
    form: null,
    points: 0,
  };
}

describe('Raakavoima', () => {
  it('keskitason joukkue saa voiman ~1.0', () => {
    const avg = (LEAGUE.homeGoals + LEAGUE.awayGoals) / 2;
    const s = rawStrength(team('X', 10, avg * 10, avg * 10), LEAGUE);
    expect(s.attack).toBeCloseTo(1.0, 6);
    expect(s.defense).toBeCloseTo(1.0, 6);
  });

  it('nolla pelattua ottelua → neutraali voima eikä nollalla jakoa', () => {
    const s = rawStrength(team('X', 0, 0, 0), LEAGUE);
    expect(s.attack).toBe(1);
    expect(Number.isNaN(s.attack)).toBe(false);
  });
});

describe('Regressio keskiarvoon kausien välillä', () => {
  it('vaimentaa eron keskitasoon', () => {
    const r = regressToMean({ attack: 1.4, defense: 0.6 }, 0.75);
    expect(r.attack).toBeCloseTo(1.3, 6); // 1 + 0.4 × 0.75
    expect(r.defense).toBeCloseTo(0.7, 6); // 1 − 0.4 × 0.75
  });

  it('kerroin 1.0 ei muuta mitään', () => {
    const r = regressToMean({ attack: 1.4, defense: 0.6 }, 1);
    expect(r.attack).toBeCloseTo(1.4, 6);
  });

  it('kerroin 0 vie keskitasoon', () => {
    const r = regressToMean({ attack: 1.4, defense: 0.6 }, 0);
    expect(r.attack).toBe(1);
    expect(r.defense).toBe(1);
  });
});

describe('Kausien yhdistäminen', () => {
  // Vahva joukkue viime kaudelta: 71 maalia, 27 päästettyä, 38 ottelua
  const prev = team('Vahva', 38, 71, 27);

  it('ei dataa lainkaan → sarjan keskitaso', () => {
    const r = combineSeasons(null, null, LEAGUE);
    expect(r.strength.attack).toBe(1);
    expect(r.basis).toBe('league-average');
  });

  it('kausi ei alkanut → regressoitu viime kausi, ei keskitaso', () => {
    // Tämä on vaihtoehdon C koko pointti: 0 ottelua ei tarkoita "en tiedä mitään"
    const r = combineSeasons(null, prev, LEAGUE);
    expect(r.basis).toBe('previous-season');
    expect(r.currentWeight).toBe(0);
    expect(r.strength.attack).toBeGreaterThan(1.2); // vahva joukkue pysyy vahvana
    expect(r.strength.defense).toBeLessThan(0.8);
  });

  it('viime kauden voima on regressoitu eikä sellaisenaan', () => {
    const withPrior = combineSeasons(null, prev, LEAGUE).strength.attack;
    const unregressed = rawStrength(prev, LEAGUE).attack;
    expect(withPrior).toBeLessThan(unregressed);
    expect(withPrior).toBeCloseTo(1 + (unregressed - 1) * SEASON_REGRESSION, 6);
  });

  it('ei viime kautta (nousija) → kutistus keskitasoon', () => {
    const r = combineSeasons(team('Nousija', 3, 7, 2), null, LEAGUE);
    expect(r.playedThisSeason).toBe(3);
    expect(r.strength.attack).toBeLessThan(rawStrength(team('Nousija', 3, 7, 2), LEAGUE).attack);
  });

  it('nykyisen kauden paino kasvaa otteluiden myötä', () => {
    const weights = [0, 3, 6, 12, 24].map((p) => {
      const cur = p ? team('X', p, Math.round(1.9 * p), Math.round(0.8 * p)) : null;
      return combineSeasons(cur, prev, LEAGUE).currentWeight;
    });
    for (let i = 1; i < weights.length; i++) expect(weights[i]).toBeGreaterThan(weights[i - 1]);
  });

  it('k pelattua ottelua → nykyinen kausi painaa puolet', () => {
    const k = 6;
    const r = combineSeasons(team('X', k, 12, 6), prev, LEAGUE, k);
    expect(r.currentWeight).toBeCloseTo(0.5, 6);
    expect(r.basis).toBe('blended');
  });

  it('priori antaa kauden alussa informatiivisemman arvion kuin pelkkä kutistus', () => {
    const cur = team('X', 3, 6, 2);
    const withPrior = combineSeasons(cur, prev, LEAGUE).strength.attack;
    const withoutPrior = combineSeasons(cur, null, LEAGUE).strength.attack;
    // Ilman prioria voima on lähellä ykköstä ("en tiedä"), priorilla selvästi yli
    expect(withoutPrior).toBeLessThan(1.2);
    expect(withPrior).toBeGreaterThan(withoutPrior);
  });

  it('paljon otteluita → peruste on tämä kausi', () => {
    const r = combineSeasons(team('X', 30, 57, 24), prev, LEAGUE);
    expect(r.basis).toBe('current-season');
    expect(r.currentWeight).toBeGreaterThan(0.8);
  });

  it('blendi asettuu nykyisen ja viime kauden väliin', () => {
    // Heikko nykyinen kausi, vahva viime kausi
    const cur = team('X', 6, 3, 12);
    const r = combineSeasons(cur, prev, LEAGUE);
    const curOnly = rawStrength(cur, LEAGUE).attack;
    const prevOnly = regressToMean(rawStrength(prev, LEAGUE), SEASON_REGRESSION).attack;
    expect(r.strength.attack).toBeGreaterThan(Math.min(curOnly, prevOnly));
    expect(r.strength.attack).toBeLessThan(Math.max(curOnly, prevOnly));
  });
});

describe('Voima nimen perusteella sarjatilastoista', () => {
  const season = (year: string, teams: TeamSeasonStats[]): LeagueSeasonStats => ({
    league: 'Veikkausliiga',
    season: year,
    teams,
    homeGoalsAvg: 1.42,
    awayGoalsAvg: 1.16,
    source: 'testi',
    splitsEstimated: true,
  });

  const current = season('2026', [team('HJK', 19, 29, 23, 3), team('FF Jaro', 19, 18, 38, 11)]);
  const previous = season('2025', [team('HJK', 27, 55, 20, 1), team('FF Jaro', 27, 25, 40, 10)]);

  it('löytää joukkueen vaikka kerroinlähde käyttää pidempää nimeä', () => {
    const r = strengthForTeam('HJK Helsinki', current, previous);
    expect(r).not.toBeNull();
    expect(r!.stats.name).toBe('HJK');
    expect(r!.playedThisSeason).toBe(19);
  });

  it('täsmää myös kun tilastolähteessä on etuliite', () => {
    expect(strengthForTeam('Jaro', current, previous)!.stats.name).toBe('FF Jaro');
  });

  it('tuntematon joukkue → null (kutsuja putoaa market-only-tilaan)', () => {
    expect(strengthForTeam('Barcelona', current, previous)).toBeNull();
  });

  it('toimii ilman edellisen kauden dataa', () => {
    const r = strengthForTeam('HJK Helsinki', current, null);
    expect(r).not.toBeNull();
    expect(r!.strength.attack).toBeGreaterThan(0);
  });

  it('vahva joukkue saa suuremman hyökkäysvoiman kuin heikko', () => {
    const hjk = strengthForTeam('HJK Helsinki', current, previous)!;
    const jaro = strengthForTeam('Jaro', current, previous)!;
    expect(hjk.strength.attack).toBeGreaterThan(jaro.strength.attack);
    expect(hjk.strength.defense).toBeLessThan(jaro.strength.defense);
  });
});
