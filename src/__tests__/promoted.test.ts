// Tiketti #68: Nousijan priori alemmasta sarjasta
//
// Keskeinen vaatimus: malli DEGRADOITUU entiseen jos dataa ei loydy.
// Kiinteä 0.85 / 1.15 sailyy keskiarvona, josta joukkueen oma suoritus
// poikkeuttaa -- se ei saa kadota kun alempaa sarjaa ei ole saatavilla.

import { describe, it, expect } from 'vitest';
import { projectToTopFlight, promotedStrengthFrom, DIVISION_SPREAD } from '../ingest/promoted.js';
import { PROMOTED_STRENGTH, combineSeasons } from '../analyze/strength.js';
import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';

function team(name: string, played: number, gf: number, ga: number): TeamSeasonStats {
  return {
    name, aliases: [], rank: 1, played, won: 0, draw: 0, lost: 0, gf, ga,
    home_played: null, home_gf: null, home_ga: null,
    away_played: null, away_gf: null, away_ga: null, form: null, points: 0,
  };
}

function league(teams: TeamSeasonStats[]): LeagueSeasonStats {
  return {
    league: 'Championship', season: '2025', teams,
    homeGoalsAvg: 1.5, awayGoalsAvg: 1.2,
    source: 'football-data.org', splitsEstimated: false,
  };
}

describe('projectToTopFlight', () => {
  it('KESKIVERTO nousija saa tasmalleen entisen kiinteän priorin', () => {
    // Tama on koko suunnittelun ydin: uusi logiikka ei muuta keskitapausta
    const avg = projectToTopFlight({ attack: 1, defense: 1 });
    expect(avg.attack).toBeCloseTo(PROMOTED_STRENGTH.attack, 10);
    expect(avg.defense).toBeCloseTo(PROMOTED_STRENGTH.defense, 10);
  });

  it('vahva alemman sarjan joukkue saa paremman priorin', () => {
    const strong = projectToTopFlight({ attack: 1.4, defense: 0.7 });
    expect(strong.attack).toBeGreaterThan(PROMOTED_STRENGTH.attack);
    expect(strong.defense).toBeLessThan(PROMOTED_STRENGTH.defense);
  });

  it('heikko alemman sarjan joukkue saa huonomman priorin', () => {
    const weak = projectToTopFlight({ attack: 0.7, defense: 1.4 });
    expect(weak.attack).toBeLessThan(PROMOTED_STRENGTH.attack);
    expect(weak.defense).toBeGreaterThan(PROMOTED_STRENGTH.defense);
  });

  it('hajonta KUTISTUU — alemman sarjan ero ei siirry sellaisenaan', () => {
    // Ylemmassa sarjassa kaikki vastustajat ovat kovempia, joten sama
    // joukkue ei voi toistaa alemman sarjan eroaan
    const lower = { attack: 1.4, defense: 1 };
    const upper = projectToTopFlight(lower);
    const lowerDiff = lower.attack - 1;
    const upperDiff = upper.attack / PROMOTED_STRENGTH.attack - 1;
    expect(Math.abs(upperDiff)).toBeLessThan(Math.abs(lowerDiff));
    expect(upperDiff).toBeCloseTo(lowerDiff * DIVISION_SPREAD, 10);
  });
});

describe('promotedStrengthFrom', () => {
  const elc = league([team('Leeds United', 46, 90, 30), team('Pieni FC', 46, 40, 70)]);

  it('loytaa joukkueen ja projisoi sen voiman', () => {
    const s = promotedStrengthFrom('Leeds United', elc);
    expect(s).not.toBeNull();
    expect(s!.attack).toBeGreaterThan(PROMOTED_STRENGTH.attack);
  });

  it('tuntematon joukkue palauttaa null — priori ei saa olla arvattu', () => {
    expect(promotedStrengthFrom('Ei Olemassa', elc)).toBeNull();
  });

  it('REGRESSIO: alle 10 ottelua ei ole kausi vaan otos', () => {
    const thin = league([team('Uusi FC', 4, 12, 2)]);
    expect(promotedStrengthFrom('Uusi FC', thin)).toBeNull();
  });
});

describe('combineSeasons nousijapriorilla', () => {
  const pl = { homeGoals: 1.5, awayGoals: 1.2 };

  it('ilman omaa prioria kaytetaan keskiverto nousijaa — entinen kaytos sailyy', () => {
    const r = combineSeasons(team('Nousija', 0, 0, 0), null, pl);
    expect(r.strength.attack).toBeCloseTo(PROMOTED_STRENGTH.attack, 6);
    expect(r.strength.defense).toBeCloseTo(PROMOTED_STRENGTH.defense, 6);
  });

  it('oma priori korvaa keskiverron', () => {
    const own = { attack: 1.05, defense: 0.95 };
    const r = combineSeasons(team('Nousija', 0, 0, 0), null, pl, undefined, own);
    expect(r.strength.attack).toBeCloseTo(own.attack, 6);
    expect(r.strength.defense).toBeCloseTo(own.defense, 6);
  });

  it('joukkue jolla ON edellinen kausi ei saa nousijaprioria lainkaan', () => {
    const prev = team('Vakio', 38, 80, 30);
    const own = { attack: 0.1, defense: 9.9 };
    const r = combineSeasons(team('Vakio', 0, 0, 0), prev, pl, undefined, own);
    expect(r.basis).toBe('previous-season');
    expect(r.strength.attack).toBeGreaterThan(1);
  });
});
