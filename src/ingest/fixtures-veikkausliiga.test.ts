// Veikkausliigan otteluohjelma (tiketti #85)
//
// Painopiste on AIKAVYOHYKKEESSA. Tulospalvelu antaa paikallisen ajan, ja
// vaara tunti siirtaisi illan ottelun vaaralle kalenteripaivalle -- juuri se
// asia jonka koko kalenteri jarjestaa. Muunnos meni ensimmaisella yrityksella
// pieleen (mittasi siirtymaksi nollan Suomessa ajettuna), joten se on
// lukittu useammalla tapauksella kuin muu jasennys.

import { describe, it, expect } from 'vitest';
import { competitionId, helsinkiToUtc, parseMatches } from './fixtures-veikkausliiga.js';

describe('competitionId', () => {
  it('johtaa tunnisteen vuodesta', () => {
    expect(competitionId(2026)).toBe('spljp26');
    expect(competitionId(2025)).toBe('spljp25');
  });

  it('vuosikymmenen vaihde ei riko muotoa', () => {
    expect(competitionId(2030)).toBe('spljp30');
    expect(competitionId(2009)).toBe('spljp09');
  });
});

describe('helsinkiToUtc', () => {
  it('KESAAIKA on UTC+3', () => {
    expect(helsinkiToUtc('2026-08-31', '19:00:00')).toBe('2026-08-31T16:00:00.000Z');
  });

  it('TALVIAIKA on UTC+2', () => {
    expect(helsinkiToUtc('2026-11-15', '15:00:00')).toBe('2026-11-15T13:00:00.000Z');
  });

  it('kesaajan alku 29.3.2026', () => {
    // Kello siirtyy 03:00 -> 04:00; 04:00 paikallista on jo UTC+3
    expect(helsinkiToUtc('2026-03-29', '04:00:00')).toBe('2026-03-29T01:00:00.000Z');
  });

  it('kauden avaus huhtikuussa on kesaaikaa', () => {
    expect(helsinkiToUtc('2026-04-05', '18:30:00')).toBe('2026-04-05T15:30:00.000Z');
  });

  it('keskiyon yli menematta: 23:00 pysyy samana paivana UTC:ssa', () => {
    expect(helsinkiToUtc('2026-07-01', '23:00:00')).toBe('2026-07-01T20:00:00.000Z');
  });

  it('kelvoton syote -> null', () => {
    expect(helsinkiToUtc('', '19:00:00')).toBeNull();
    expect(helsinkiToUtc('rikki', '19:00:00')).toBeNull();
    expect(helsinkiToUtc('2026-08-31', 'ei-aika')).toBeNull();
  });

  it('puuttuva kellonaika kaytetaan keskiyona', () => {
    expect(helsinkiToUtc('2026-08-31', '')).toBe('2026-08-30T21:00:00.000Z');
  });
});

describe('parseMatches', () => {
  const m = (over: Record<string, unknown> = {}) => ({
    match_id: '4036979',
    date: '2026-08-31',
    time: '19:00:00',
    status: 'Fixture',
    team_A_name: 'VPS',
    team_B_name: 'FC Lahti',
    fs_A: '',
    fs_B: '',
    venue_name: 'Lemonsoft Stadion',
    ...over,
  });

  it('poimii tulevan ottelun', () => {
    const [f] = parseMatches([m()]);
    expect(f).toMatchObject({
      match_id: '4036979',
      date: '2026-08-31',
      kickoff: '2026-08-31T16:00:00.000Z',
      home: 'VPS',
      away: 'FC Lahti',
      status: 'upcoming',
      home_score: null,
      away_score: null,
      venue: 'Lemonsoft Stadion',
    });
  });

  it('pelattu ottelu saa tuloksen', () => {
    const [f] = parseMatches([m({ status: 'Played', fs_A: '0', fs_B: '0', date: '2026-08-23', time: '18:00:00' })]);
    expect(f.status).toBe('finished');
    expect(f.home_score).toBe(0);
    expect(f.away_score).toBe(0);
  });

  it('NOLLA on tulos eika puuttuva arvo', () => {
    // fs_A = "0" on falsy merkkijonona vain jos sita kasittelee huolimattomasti
    const [f] = parseMatches([m({ status: 'Played', fs_A: '0', fs_B: '3' })]);
    expect(f.home_score).toBe(0);
    expect(f.away_score).toBe(3);
  });

  it('pelaamattoman ottelun tyhja tulos EI ole nolla', () => {
    const [f] = parseMatches([m({ status: 'Fixture', fs_A: '', fs_B: '' })]);
    expect(f.home_score).toBeNull();
    expect(f.away_score).toBeNull();
  });

  it('nimeton paikanvaraaja pudotetaan', () => {
    expect(parseMatches([m({ team_A_name: '' }), m({ team_B_name: '  ' })])).toHaveLength(0);
  });

  it('tunnisteeton rivi pudotetaan', () => {
    expect(parseMatches([m({ match_id: undefined })])).toHaveLength(0);
  });

  it('kelvoton paiva pudotetaan eika kaada muita', () => {
    const out = parseMatches([m({ date: 'rikki', match_id: '1' }), m({ match_id: '2' })]);
    expect(out).toHaveLength(1);
    expect(out[0].match_id).toBe('2');
  });

  it('jarjestetaan aloitusajan mukaan', () => {
    const out = parseMatches([
      m({ match_id: 'b', date: '2026-08-31', time: '19:00:00' }),
      m({ match_id: 'a', date: '2026-08-30', time: '15:00:00' }),
    ]);
    expect(out.map((x) => x.match_id)).toEqual(['a', 'b']);
  });

  it('tyhja syote -> tyhja tulos', () => {
    expect(parseMatches([])).toEqual([]);
  });

  it('puuttuva areena -> null eika tyhja merkkijono', () => {
    expect(parseMatches([m({ venue_name: '  ' })])[0].venue).toBeNull();
  });
});
