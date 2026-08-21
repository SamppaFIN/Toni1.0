import { describe, it, expect } from 'vitest';
import { buildTeamsFile, TEAMS_SCHEMA_VERSION } from '../publish/football-teams.js';
import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';

function mkTeam(overrides: Partial<TeamSeasonStats>): TeamSeasonStats {
  return {
    name: 'Testi',
    aliases: [],
    rank: 1,
    played: 10,
    won: 5,
    draw: 3,
    lost: 2,
    gf: 18,
    ga: 10,
    home_played: 5,
    home_gf: 10,
    home_ga: 4,
    away_played: 5,
    away_gf: 8,
    away_ga: 6,
    form: 'WWDLW',
    points: 18,
    ...overrides,
  };
}

function mkLeague(teams: TeamSeasonStats[], season = '2026'): LeagueSeasonStats {
  return {
    league: 'Valioliiga',
    season,
    teams,
    homeGoalsAvg: 1.55,
    awayGoalsAvg: 1.25,
    source: 'football-data.org',
    splitsEstimated: false,
  };
}

describe('buildTeamsFile', () => {
  // played=20 riittää ylittämään kutistuksen luottamuskynnyksen (DEFAULT_SHRINKAGE_K=6,
  // basis on 'current-season' kun pelattu >= 3×k), jotta voimaluku ei ole pelkkää kutistusta
  const current = mkLeague([
    mkTeam({ name: 'Arsenal', rank: 1, played: 20, points: 48, gf: 44, ga: 16 }),
    mkTeam({ name: 'Chelsea', rank: 2, played: 20, points: 40, gf: 36, ga: 24 }),
  ]);

  it('sisältää schema_version-kentän ja sarjan nimen/kauden', () => {
    const file = buildTeamsFile({ current, previous: null });
    expect(file.schema_version).toBe(TEAMS_SCHEMA_VERSION);
    expect(file.league).toBe('Valioliiga');
    expect(file.season).toBe('2026');
  });

  it('järjestää joukkueet sarjataulukon sijan mukaan', () => {
    const shuffled = mkLeague([
      mkTeam({ name: 'Chelsea', rank: 2 }),
      mkTeam({ name: 'Arsenal', rank: 1 }),
    ]);
    const file = buildTeamsFile({ current: shuffled, previous: null });
    expect(file.teams.map((t) => t.team.name)).toEqual(['Arsenal', 'Chelsea']);
  });

  it('laskee hyökkäys-/puolustusvoiman joukkueen omista maaleista kun edellistä kautta ei ole', () => {
    const file = buildTeamsFile({ current, previous: null });
    const arsenal = file.teams.find((t) => t.team.name === 'Arsenal')!;
    // Arsenal tekee 2.2 maalia/ottelu (22/10), sarjan ka 1.55 → hyökkäys > 1
    expect(arsenal.attack).toBeGreaterThan(1);
    // Arsenal päästää vain 0.8 maalia/ottelu (8/10) vs. sarjan ka 1.4 →
    // defense = päästetyt/ka < 1, koska PIENEMPI defense-luku on parempi puolustus (poisson.ts:teamStrength)
    expect(arsenal.defense).toBeLessThan(1);
    expect(arsenal.basis).not.toBe('league-average');
  });

  it('sisältää joukkueen värin ja lyhenteen (teamRef)', () => {
    const file = buildTeamsFile({ current, previous: null });
    const arsenal = file.teams.find((t) => t.team.name === 'Arsenal')!;
    expect(arsenal.team.short).toBeTruthy();
    expect(arsenal.team.color).toBeTruthy();
  });

  it('käyttää edellisen kauden dataa priorina kun se on saatavilla', () => {
    const previous = mkLeague(
      [mkTeam({ name: 'Arsenal', rank: 3, played: 38, gf: 80, ga: 30 })],
      '2025'
    );
    const withPrior = buildTeamsFile({ current, previous });
    const withoutPrior = buildTeamsFile({ current, previous: null });
    const a1 = withPrior.teams.find((t) => t.team.name === 'Arsenal')!;
    const a2 = withoutPrior.teams.find((t) => t.team.name === 'Arsenal')!;
    // Sama syöte, eri priori → eri voimaluku (muuten priorilla ei olisi vaikutusta)
    expect(a1.attack).not.toBe(a2.attack);
  });

  it('heittää virheen jos sarjataulukko on tyhjä', () => {
    expect(() => buildTeamsFile({ current: mkLeague([]), previous: null })).toThrow();
  });
});
