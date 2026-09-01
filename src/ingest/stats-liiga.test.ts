// Liigan tilastot (tiketti #92)
//
// Tarkein lukittava asia on VARSINAINEN PELIAIKA. Loppulukema sisaltaa
// jatkoajan voittomaalin, ja jos sita ei korjata, tasapeleja ei synny
// lainkaan vaikka niita on joka viides ottelu -- malli antaisi tasapelille
// lahes nollan ja tuottaisi valtavia valheellisia edgeja.

import { describe, it, expect } from 'vitest';
import { regulationScore, tallyGames, liigaPoints, buildSeason, seasonYear, REGULATION } from './stats-liiga.js';

const OT = 'ENDED_DURING_EXTENDED_GAME_TIME';
const SO = 'ENDED_DURING_WINNING_SHOT_COMPETITION';

const game = (home: string, away: string, hg: number, ag: number, finishedType = REGULATION, start = '2026-09-01T16:00:00Z') => ({
  id: 1, season: 2027, start, ended: true, finishedType,
  homeTeam: { teamName: home, goals: hg },
  awayTeam: { teamName: away, goals: ag },
});

describe('regulationScore — jaakiekon tarkein ero jalkapalloon', () => {
  it('varsinaisella peliajalla ratkennut sailyy sellaisenaan', () => {
    expect(regulationScore(3, 1, REGULATION)).toEqual({ home: 3, away: 1, wentToOvertime: false });
  });

  it('JATKOAIKA: voittomaali poistetaan, tilanne oli tasan', () => {
    expect(regulationScore(2, 3, OT)).toEqual({ home: 2, away: 2, wentToOvertime: true });
  });

  it('VOITTOMAALIKILPAILU kasitellaan samoin', () => {
    expect(regulationScore(4, 3, SO)).toEqual({ home: 3, away: 3, wentToOvertime: true });
  });

  it('kotivoitto jatkoajalla: tasan haviajan lukemaan', () => {
    expect(regulationScore(5, 4, OT)).toEqual({ home: 4, away: 4, wentToOvertime: true });
  });

  it('tuntematon ratkaisutapa tulkitaan varsinaiseksi peliajaksi', () => {
    // Konservatiivinen: emme keksi jatkoaikaa jota rajapinta ei sanonut
    expect(regulationScore(2, 1, undefined)).toEqual({ home: 2, away: 1, wentToOvertime: false });
  });
});

describe('tallyGames', () => {
  it('JA-ottelu kirjautuu TASAPELIKSI molemmille', () => {
    const { teams } = tallyGames([game('Tappara', 'Ilves', 3, 2, OT)]);
    for (const t of teams) {
      expect(t.draw, t.name).toBe(1);
      expect(t.won).toBe(0);
      expect(t.lost).toBe(0);
    }
  });

  it('JA-voittaja saa otWin, haviaja otLoss', () => {
    const { teams } = tallyGames([game('Tappara', 'Ilves', 3, 2, OT)]);
    const tap = teams.find((t) => t.name === 'Tappara')!;
    const ilv = teams.find((t) => t.name === 'Ilves')!;
    expect(tap.otWin).toBe(1);
    expect(ilv.otLoss).toBe(1);
  });

  it('MAALIT lasketaan varsinaisen peliajan mukaan', () => {
    const { homeGoals, awayGoals } = tallyGames([game('A', 'B', 3, 2, OT)]);
    expect(homeGoals).toBe(2); // ei 3
    expect(awayGoals).toBe(2);
  });

  it('varsinaisen peliajan voitto kirjautuu voitoksi', () => {
    const { teams } = tallyGames([game('A', 'B', 4, 1)]);
    expect(teams.find((t) => t.name === 'A')!.won).toBe(1);
    expect(teams.find((t) => t.name === 'B')!.lost).toBe(1);
  });

  it('koti- ja vierassplitit erotellaan', () => {
    const { teams } = tallyGames([game('A', 'B', 3, 1), game('B', 'A', 2, 0)]);
    const a = teams.find((t) => t.name === 'A')!;
    expect(a.home_played).toBe(1);
    expect(a.home_gf).toBe(3);
    expect(a.away_played).toBe(1);
    expect(a.away_gf).toBe(0);
  });

  it('PELAAMATTOMAT otteluta ei lasketa', () => {
    const kesken = { ...game('A', 'B', 1, 0), ended: false };
    expect(tallyGames([kesken]).matches).toBe(0);
  });

  it('vajaa rivi ohitetaan eika kaada muita', () => {
    const rikki = { ...game('A', 'B', 1, 0), homeTeam: { teamName: '', goals: 1 } };
    expect(tallyGames([rikki, game('C', 'D', 2, 1)]).matches).toBe(1);
  });

  it('muoto on aikajarjestyksessa, uusin viimeisena', () => {
    const { teams } = tallyGames([
      game('A', 'B', 3, 0, REGULATION, '2026-09-01T16:00:00Z'),
      game('A', 'C', 0, 2, REGULATION, '2026-09-05T16:00:00Z'),
    ]);
    expect(teams.find((t) => t.name === 'A')!.form).toEqual(['W', 'L']);
  });

  it('tyhja syote -> tyhja tulos', () => {
    expect(tallyGames([]).matches).toBe(0);
  });
});

describe('liigaPoints — 3-2-1-0', () => {
  it('varsinaisen peliajan voitosta 3', () => {
    expect(liigaPoints({ won: 1, otWin: 0, otLoss: 0 })).toBe(3);
  });
  it('JA-voitosta 2', () => {
    expect(liigaPoints({ won: 0, otWin: 1, otLoss: 0 })).toBe(2);
  });
  it('JA-tappiosta 1', () => {
    expect(liigaPoints({ won: 0, otWin: 0, otLoss: 1 })).toBe(1);
  });
  it('varsinaisen peliajan tappiosta 0', () => {
    expect(liigaPoints({ won: 0, otWin: 0, otLoss: 0 })).toBe(0);
  });
});

describe('buildSeason', () => {
  it('TYHJA KAUSI ei ole virhe — nolla keskiarvo, tyhja joukkuelista', () => {
    // Kauden alussa (1.9.2026) pelattuja otteluita on nolla
    const s = buildSeason([], 2027);
    expect(s.teams).toEqual([]);
    expect(s.homeGoalsAvg).toBe(0);
    expect(s.season).toBe('2027');
  });

  it('sija maaraytyy Liigan pisteista', () => {
    const s = buildSeason(
      [game('A', 'B', 3, 0), game('C', 'D', 2, 1, OT), game('A', 'C', 4, 1)],
      2027
    );
    // A: 2 varsinaista voittoa = 6p -> ykkonen
    expect(s.teams.find((t) => t.name === 'A')!.rank).toBe(1);
  });

  it('keskiarvot lasketaan varsinaisesta peliajasta', () => {
    const s = buildSeason([game('A', 'B', 3, 2, OT)], 2027);
    expect(s.homeGoalsAvg).toBe(2);
    expect(s.awayGoalsAvg).toBe(2);
  });

  it('lahde kerrotaan', () => {
    expect(buildSeason([], 2027).source).toContain('liiga.fi');
  });
});

describe('seasonYear', () => {
  it('syyskuu 2026 kuuluu kauteen 2027', () => {
    expect(seasonYear(new Date('2026-09-01T12:00:00Z'))).toBe(2027);
  });
  it('helmikuu 2027 kuuluu yha kauteen 2027', () => {
    expect(seasonYear(new Date('2027-02-01T12:00:00Z'))).toBe(2027);
  });
  it('kesakuu 2027 on jo seuraavaa kautta edeltava', () => {
    expect(seasonYear(new Date('2027-06-01T12:00:00Z'))).toBe(2027);
  });
});
