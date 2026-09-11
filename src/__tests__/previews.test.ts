// Kierrosennusteet ilman kertoimia (previews.json)
//
// Erikoistekijat ovat kayttajalle nakyvia VAITTEITA ottelusta. Vaara tekija on
// pahempi kuin puuttuva: kayttaja perustelee valintansa silla. Siksi jokainen
// nailla testeilla lukittu saanto on muotoa "tama havainto syntyy VAIN kun
// data sanoo niin".

import { describe, it, expect } from 'vitest';
import { streakOf, restDays, collectFactors, lastKickoffBefore } from '../publish/previews.js';
import type { FixtureMatch } from '../publish/fixtures.js';
import type { TeamSeasonStats, NewsItem } from '../types-football.js';
import type { StrengthResult } from '../analyze/strength.js';

function stats(over: Partial<TeamSeasonStats> = {}): TeamSeasonStats {
  return {
    name: 'Testi', aliases: [], rank: 1, played: 3, won: 1, draw: 1, lost: 1,
    gf: 4, ga: 4, points: 4,
    home_played: 2, home_gf: 3, home_ga: 1,
    away_played: 1, away_gf: 1, away_ga: 3,
    form: 'WDL',
    ...over,
  };
}

function strength(over: Partial<StrengthResult> = {}, st: Partial<TeamSeasonStats> = {}) {
  return {
    strength: { attack: 1, defense: 1 },
    basis: 'blended' as const,
    currentWeight: 0.5,
    playedThisSeason: 3,
    stats: stats(st),
    ...over,
  };
}

const NO_NEWS: NewsItem[] = [];
const base = { eloHome: null, eloAway: null, restHome: null, restAway: null, news: NO_NEWS };

describe('streakOf', () => {
  it('kolme samaa perakkain riittaa putkeksi', () => {
    expect(streakOf('LWWW')).toEqual({ kind: 'W', length: 3 });
    expect(streakOf('WLLL')).toEqual({ kind: 'L', length: 3 });
  });

  it('KAKSI EI RIITA — muuten "putki" olisi arkipaivainen eika havainto', () => {
    expect(streakOf('LLWW')).toBeNull();
  });

  it('putki luetaan lopusta eika alusta', () => {
    // Kolme voittoa alussa, mutta viimeisin on tappio
    expect(streakOf('WWWL')).toBeNull();
  });

  it('koko muoto samaa laskee pituuden oikein', () => {
    expect(streakOf('WWWWW')).toEqual({ kind: 'W', length: 5 });
  });

  it('tyhja tai puuttuva muoto ei kaada', () => {
    expect(streakOf(null)).toBeNull();
    expect(streakOf('')).toBeNull();
  });
});

describe('restDays', () => {
  it('laskee vuorokaudet edellisesta ottelusta', () => {
    expect(restDays('2026-09-12T14:00:00Z', '2026-09-09T14:00:00Z')).toBe(3);
  });

  it('tuntematon edellinen -> null EIKA nolla', () => {
    // Nolla tarkoittaisi "pelasi tanaan", mika on eri asia kuin "ei tiedeta"
    expect(restDays('2026-09-12T14:00:00Z', null)).toBeNull();
  });

  it('kelvoton aika -> null', () => {
    expect(restDays('2026-09-12T14:00:00Z', 'ei-aika')).toBeNull();
  });
});

describe('collectFactors', () => {
  it('nousija ilman paasarjahistoriaa sanotaan erikseen', () => {
    const f = collectFactors({ ...base, home: strength({ basis: 'league-average' }), away: strength() });
    expect(f.filter((x) => x.label === 'Ei pääsarjahistoriaa')).toHaveLength(1);
    expect(f.find((x) => x.label === 'Ei pääsarjahistoriaa')!.side).toBe('home');
  });

  it('tappioputki kallistaa vastustajaan, voittoputki omaan', () => {
    const f = collectFactors({ ...base, home: strength({}, { form: 'LLLL' }), away: strength({}, { form: 'WWW' }) });
    expect(f.find((x) => x.label.includes('tappiota'))!.leans).toBe('away');
    expect(f.find((x) => x.label.includes('voittoa'))!.leans).toBe('away');
  });

  it('maaliton kotipuolikausi nakyy — se katoaa kokonaissummiin', () => {
    const f = collectFactors({ ...base, home: strength({}, { home_played: 3, home_gf: 0 }), away: strength() });
    const hit = f.find((x) => x.label === 'Ei maalia kotona');
    expect(hit).toBeTruthy();
    expect(hit!.leans).toBe('away');
  });

  it('EI VAITETA maalittomuutta jos kotiotteluita ei ole pelattu', () => {
    const f = collectFactors({ ...base, home: strength({}, { home_played: 0, home_gf: 0 }), away: strength() });
    expect(f.find((x) => x.label === 'Ei maalia kotona')).toBeUndefined();
  });

  it('Elo-ero huomioi kotiedun eika vertaa neutraalilla kentalla', () => {
    // Tasaväkiset: ilman kotietua ero olisi 0 eika tekijaa syntyisi.
    const f = collectFactors({ ...base, home: strength(), away: strength(), eloHome: 1500, eloAway: 1500 });
    const hit = f.find((x) => x.label.startsWith('Elo-ero'));
    expect(hit).toBeTruthy();
    expect(hit!.label).toBe('Elo-ero +55');
    expect(hit!.leans).toBe('home');
  });

  it('pieni Elo-ero ei tuota tekijaa — kohina ei ole havainto', () => {
    // Koti 1420 + 55 = 1475 vs 1500 -> netto -25, alle 40:n kynnyksen
    const f = collectFactors({ ...base, home: strength(), away: strength(), eloHome: 1420, eloAway: 1500 });
    expect(f.find((x) => x.label.startsWith('Elo-ero'))).toBeUndefined();
  });

  it('Elo puuttuu toiselta -> ei tekijaa, ei arvausta', () => {
    const f = collectFactors({ ...base, home: strength(), away: strength(), eloHome: 1600, eloAway: null });
    expect(f.find((x) => x.label.startsWith('Elo-ero'))).toBeUndefined();
  });

  it('lyhyt lepo kallistaa vastustajaan', () => {
    const f = collectFactors({ ...base, home: strength(), away: strength(), restHome: 3, restAway: 7 });
    expect(f.find((x) => x.label === '3 päivää lepoa')!.leans).toBe('away');
    expect(f.find((x) => x.label === 'Epätasainen lepo')!.leans).toBe('away');
  });

  it('tasainen lepo ei tuota epatasaisuustekijaa', () => {
    const f = collectFactors({ ...base, home: strength(), away: strength(), restHome: 7, restAway: 8 });
    expect(f.find((x) => x.label === 'Epätasainen lepo')).toBeUndefined();
  });

  it('vain tyypitetty uutinen paasee tekijaksi — luokittelematon ei', () => {
    const news: NewsItem[] = [
      { title: 'A', url: 'u1', source: 's', published_at: '', event_type: 'injury', team: 'X', player: null, confidence: 0.5, impact: null },
      { title: 'B', url: 'u2', source: 's', published_at: '', event_type: null, team: 'X', player: null, confidence: null, impact: null },
    ];
    const f = collectFactors({ ...base, home: strength(), away: strength(), news });
    expect(f.filter((x) => x.label.startsWith('Uutinen'))).toHaveLength(1);
  });

  it('uutistekija kertoo varmuuden — avainsanaluokittelu ei saa nayttaa mitatulta', () => {
    const news: NewsItem[] = [
      { title: 'A', url: 'u', source: 'IS', published_at: '', event_type: 'injury', team: 'X', player: null, confidence: 0.45, impact: null },
    ];
    const f = collectFactors({ ...base, home: strength(), away: strength(), news });
    expect(f[0].detail).toContain('45 %');
  });

  it('tavallinen ottelu ilman poikkeuksia -> ei tekijoita', () => {
    expect(collectFactors({ ...base, home: strength(), away: strength() })).toEqual([]);
  });
});

describe('lastKickoffBefore', () => {
  const fx = (date: string, home: string, away: string): FixtureMatch => ({
    espn_id: `${date}-${home}`, match_id: null, date, kickoff: `${date}T14:00:00.000Z`,
    sport_key: 'soccer_epl', league: 'Valioliiga', home, away,
    status: 'finished', home_score: 1, away_score: 0, has_odds: false,
  });

  it('poimii viimeisimman ottelun ennen kohdepaivaa molemmille puolille', () => {
    const map = lastKickoffBefore([fx('2026-09-01', 'A', 'B'), fx('2026-09-05', 'B', 'C')], '2026-09-12');
    expect(map.get('A')).toBe('2026-09-01T14:00:00.000Z');
    expect(map.get('B')).toBe('2026-09-05T14:00:00.000Z');
    expect(map.get('C')).toBe('2026-09-05T14:00:00.000Z');
  });

  it('KOHDEPAIVA JA SEN JALKEISET JATETAAN POIS — tuleva ottelu ei ole lepoa', () => {
    const map = lastKickoffBefore([fx('2026-09-12', 'A', 'B'), fx('2026-09-20', 'A', 'C')], '2026-09-12');
    expect(map.get('A')).toBeUndefined();
  });

  it('tuntematon joukkue -> undefined, ei arvausta', () => {
    expect(lastKickoffBefore([fx('2026-09-01', 'A', 'B')], '2026-09-12').get('Z')).toBeUndefined();
  });
});
