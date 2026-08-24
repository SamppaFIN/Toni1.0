// Tiketti #58: Elo joukkuetaulukossa
//
// Lukittavat asiat:
//   1. Elo haetaan SAMALLA kaksivaiheisella logiikalla kuin ottelukortilla,
//      jotta kortti ja taulukko näyttävät saman luvun samalle joukkueelle
//   2. Pelaamaton joukkue saa null eikä lähtötasoa 1500 — 1500 väittäisi
//      mitattua tietoa siellä missä sitä ei ole

import { describe, it, expect } from 'vitest';
import { buildTeamsFile } from '../publish/football-teams.js';
import { EloLookup } from '../publish/live-snapshot.js';
import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';

function team(name: string, played = 5): TeamSeasonStats {
  return {
    name, aliases: [], rank: 1, played, won: 3, draw: 1, lost: 1,
    gf: 9, ga: 5, home_played: 3, home_gf: 5, home_ga: 2,
    away_played: 2, away_gf: 4, away_ga: 3, form: 'WWDLW', points: 10,
  };
}

function league(teams: TeamSeasonStats[]): LeagueSeasonStats {
  return {
    league: 'Valioliiga', season: '2026', teams,
    homeGoalsAvg: 1.5, awayGoalsAvg: 1.2,
    source: 'football-data.org', splitsEstimated: false,
  };
}

const ELO: EloLookup = new Map([
  ['arsenal', { elo: 1515, change: 15, rank: 1 }],
  ['brightonandhovealbion', { elo: 1516, change: 16, rank: 2 }],
]);

describe('buildTeamsFile — Elo', () => {
  it('liittää Elon nimellä joka poikkeaa lähteiden välillä', () => {
    // football-data.org kayttaa "FC"-liitteita ja &-merkkia
    const f = buildTeamsFile({ current: league([team('Arsenal FC'), team('Brighton & Hove Albion FC')]), previous: null }, ELO);
    const arsenal = f.teams.find((t) => t.team.name === 'Arsenal FC')!;
    const brighton = f.teams.find((t) => t.team.name === 'Brighton & Hove Albion FC')!;
    expect(arsenal.elo).toBe(1515);
    expect(arsenal.elo_rank).toBe(1);
    expect(brighton.elo).toBe(1516);
  });

  it('REGRESSIO: pelaamattoman lukua EI esiteta mitattuna', () => {
    // Periaate on ennallaan: lahtotaso ei saa nayttaa mitatulta. Esitystapa
    // muuttui tiketissa #64 -- aiemmin null, nyt 1500 MERKITTYNA. Pelkka "—"
    // kauden alussa sai ominaisuuden nayttamaan rikkinaiselta.
    const f = buildTeamsFile({ current: league([team('Chelsea FC', 0)]), previous: null }, ELO);
    const chelsea = f.teams[0];
    expect(chelsea.elo_provisional).toBe(true);
    expect(chelsea.elo_rank, 'lahtotasolla ei ole sijaa').toBeNull();
    expect(chelsea.elo_change, 'lahtotaso ei ole muuttunut mihinkaan').toBe(0);
  });

  it('ilman Elo-karttaa kentät ovat null eikä rakenne hajoa', () => {
    const f = buildTeamsFile({ current: league([team('Arsenal FC')]), previous: null }, null);
    expect(f.teams[0].elo).toBeNull();
    expect(f.teams[0].attack).toBeGreaterThan(0);
  });

  it('voimaluvut säilyvät Elon rinnalla', () => {
    const f = buildTeamsFile({ current: league([team('Arsenal FC')]), previous: null }, ELO);
    expect(f.teams[0].attack).toBeGreaterThan(0);
    expect(f.teams[0].defense).toBeGreaterThan(0);
    expect(f.teams[0].elo).toBe(1515);
  });
});

describe('Alustava Elo (tiketti #64)', () => {
  it('joukkue joka ei ole pelannut saa LAHTOTASON merkittyna', () => {
    // Kauden alussa "—" saa ominaisuuden nayttamaan rikkinaiselta, mutta
    // merkitsematon 1500 vaittaisi mitattua tietoa. Naytetaan JA merkitaan.
    const f = buildTeamsFile({ current: league([team('Chelsea FC', 0)]), previous: null }, ELO);
    expect(f.teams[0].elo).toBe(1500);
    expect(f.teams[0].elo_provisional).toBe(true);
    expect(f.teams[0].elo_rank).toBeNull();
  });

  it('mitattu Elo EI ole alustava', () => {
    const f = buildTeamsFile({ current: league([team('Arsenal FC', 5)]), previous: null }, ELO);
    expect(f.teams[0].elo).toBe(1515);
    expect(f.teams[0].elo_provisional).toBeUndefined();
  });

  it('REGRESSIO: ilman Elo-karttaa EI keksita lahtotasoa', () => {
    // Sarja jolla ei ole tuloslahdetta lainkaan -> Elo on null, ei 1500.
    // 1500 vaittaisi etta sarjalla on Elo-kasite vaikka sita ei ole.
    const f = buildTeamsFile({ current: league([team('Jokin FC', 0)]), previous: null }, null);
    expect(f.teams[0].elo).toBeNull();
    expect(f.teams[0].elo_provisional).toBeUndefined();
  });

  it('tyhja Elo-kartta kasitellaan kuin puuttuva', () => {
    const f = buildTeamsFile({ current: league([team('Jokin FC', 0)]), previous: null }, new Map());
    expect(f.teams[0].elo).toBeNull();
  });
});
