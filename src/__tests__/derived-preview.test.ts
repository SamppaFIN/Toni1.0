// Johdettu ottelu­ennakko (📋 Ennakko jalkapallokortilla)
//
// Osio esittaa VAITTEITA ottelusta, ja kayttaja perustelee valintansa
// niilla. Siksi jokainen saanto tassa on muotoa "tama rivi syntyy VAIN kun
// data sanoo niin" — eika "arvataan jotain jotta osio ei ole tyhja".

import { describe, it, expect } from 'vitest';
import { buildDerivedPreview, sideFor, streak, HOME_ADVANTAGE, ELO_GAP_THRESHOLD } from '../analyze/derived-preview.js';
import type { TeamSeasonStats } from '../types-football.js';

function stats(over: Partial<TeamSeasonStats> = {}): TeamSeasonStats {
  return {
    name: 'Testi', aliases: [], rank: 5, played: 4, won: 2, draw: 1, lost: 1,
    gf: 6, ga: 5, points: 7,
    home_played: 2, home_gf: 4, home_ga: 2,
    away_played: 2, away_gf: 2, away_ga: 3,
    form: 'WDLW',
    ...over,
  };
}

const SRC = 'ESPN (tuloksista johdettu)';
const base = { homeStats: stats(), awayStats: stats(), homeElo: null, awayElo: null, sourceName: SRC };

describe('streak', () => {
  it('kolme samaa perakkain riittaa', () => {
    expect(streak('LWWW')).toEqual({ kind: 'W', length: 3 });
    expect(streak('WLLL')).toEqual({ kind: 'L', length: 3 });
  });

  it('KAKSI EI RIITA eika putki lasketa alusta', () => {
    expect(streak('LLWW')).toBeNull();
    expect(streak('WWWL')).toBeNull();
  });

  it('tyhja muoto ei kaada', () => {
    expect(streak(null)).toBeNull();
    expect(streak('')).toBeNull();
  });
});

describe('sideFor', () => {
  it('KOTIJOUKKUE katsoo kotisplittia, VIERAS vierassplittia', () => {
    const koti = sideFor(stats(), 'blended', null, true);
    const vieras = sideFor(stats(), 'blended', null, false);
    expect(koti.strengths.join(' ')).toContain('2.00 maalia/peli kotona');
    expect(vieras.strengths.join(' ')).toContain('1.00 maalia/peli vieraissa');
  });

  it('maalittomuus sanotaan suoraan eika nollana keskiarvona', () => {
    const s = sideFor(stats({ home_played: 3, home_gf: 0 }), 'blended', null, true);
    expect(s.weaknesses.join(' ')).toContain('Ei yhtään maalia kotona (3 ottelua)');
    expect(s.strengths.join(' ')).not.toContain('maalia/peli kotona');
  });

  it('EI VAITETA mitaan splitista jota ei ole pelattu', () => {
    const s = sideFor(stats({ home_played: 0, home_gf: 0, home_ga: 0 }), 'blended', null, true);
    expect(s.strengths.join(' ')).not.toContain('kotona');
    expect(s.weaknesses.join(' ')).not.toContain('kotona');
  });

  // Tama on osion tarkein varaus: ilman paasarjahistoriaa voimaluku on
  // arvaus, ja malli on juuri silloin epavarmimmillaan.
  it('nousija ilman paasarjahistoriaa saa nakyvan varauksen', () => {
    const s = sideFor(stats(), 'league-average', null, true);
    expect(s.weaknesses.join(' ')).toContain('Ei pääsarjahistoriaa');
  });

  it('mitattu voima EI saa samaa varausta', () => {
    expect(sideFor(stats(), 'blended', null, true).weaknesses.join(' ')).not.toContain('Ei pääsarjahistoriaa');
  });

  it('otoskoko nakyy maalikeskiarvon perassa', () => {
    expect(sideFor(stats({ home_played: 1, home_gf: 4 }), 'blended', null, true).strengths.join(' ')).toContain('(1 ottelua)');
  });

  it('sija ja Elo kannetaan sellaisenaan', () => {
    const s = sideFor(stats({ rank: 3 }), 'blended', 1521, true);
    expect(s.rank).toBe(3);
    expect(s.elo).toBe(1521);
  });

  it('ilman tilastoja rakenne palautuu tyhjana eika kaadu', () => {
    const s = sideFor(null, undefined, null, true);
    expect(s).toEqual({ rank: null, elo: null, strengths: [], weaknesses: [] });
  });
});

describe('buildDerivedPreview', () => {
  it('merkitaan JOHDETUKSI — kortti ei saa vaittaa sita toimituksen arvioksi', () => {
    const p = buildDerivedPreview(base)!;
    expect(p.basis).toBe('derived');
    expect(p.source.name).toBe(SRC);
  });

  it('Elo-ero laskee KOTIEDUN mukaan eika vertaa neutraalilla kentalla', () => {
    // Tasavakiset: pelkka erotus olisi 0, kotiedun kanssa +55 eli yli kynnyksen
    const p = buildDerivedPreview({ ...base, homeElo: 1500, awayElo: 1500 })!;
    expect(p.home.strengths.join(' ')).toContain(`Elo-ero +${HOME_ADVANTAGE}`);
    expect(p.away.weaknesses.join(' ')).toContain(`Elo-ero +${HOME_ADVANTAGE}`);
  });

  it('sama havainto nakyy suosikin plussana JA altavastaajan miinuksena', () => {
    const p = buildDerivedPreview({ ...base, homeElo: 1400, awayElo: 1600 })!;
    expect(p.away.strengths.some((x) => x.startsWith('Elo-ero'))).toBe(true);
    expect(p.home.weaknesses.some((x) => x.startsWith('Elo-ero'))).toBe(true);
  });

  it('pieni Elo-ero ei tuota havaintoa — kohina ei ole tieto', () => {
    // 1450 + 55 = 1505 vs 1500 -> netto +5
    const p = buildDerivedPreview({ ...base, homeElo: 1450, awayElo: 1500 })!;
    expect([...p.home.strengths, ...p.home.weaknesses].some((x) => x.startsWith('Elo-ero'))).toBe(false);
  });

  it('kynnys on juuri ELO_GAP_THRESHOLD', () => {
    const yli = buildDerivedPreview({ ...base, homeElo: 1500 + ELO_GAP_THRESHOLD - HOME_ADVANTAGE, awayElo: 1500 })!;
    expect(yli.home.strengths.some((x) => x.startsWith('Elo-ero'))).toBe(true);
  });

  it('Elo puuttuu toiselta -> ei havaintoa, ei arvausta', () => {
    const p = buildDerivedPreview({ ...base, homeElo: 1600, awayElo: null })!;
    expect([...p.home.strengths, ...p.away.strengths].some((x) => x.startsWith('Elo-ero'))).toBe(false);
  });

  // Tyhja osio napin takana on huonompi kuin ei nappia lainkaan: nappi
  // lupaa sisaltoa jota ei ole.
  it('kun sanottavaa ei ole, palautetaan null eika tyhjaa osiota', () => {
    expect(buildDerivedPreview({ ...base, homeStats: null, awayStats: null })).toBeNull();
  });

  it('UUTISET EIVAT PAADY listoihin — niilla on kortilla oma osionsa', () => {
    const p = buildDerivedPreview(base)!;
    const kaikki = [...p.home.strengths, ...p.home.weaknesses, ...p.away.strengths, ...p.away.weaknesses];
    expect(kaikki.some((x) => x.includes('📰'))).toBe(false);
  });
});
