// Tiketti #55: Live-tilanteen jäsennys
//
// Testataan puhdas muunnos ilman verkkoa. Tärkein lukittava asia on se, ettei
// peliminuutti esitä olevansa tarkempi kuin on: se on arvio aloitusajasta,
// eikä se saa karata realistiselta väliltä.

import { describe, it, expect } from 'vitest';
import { toLiveMatches, estimateMinute, UNAVAILABLE_STATS } from '../ingest/live-scores.js';

const NOW = new Date('2026-08-23T16:00:00.000Z');

function ev(overrides: Record<string, unknown> = {}) {
  return {
    id: 'abc',
    commence_time: '2026-08-23T15:30:00.000Z',
    completed: false,
    home_team: 'Newcastle United',
    away_team: 'Liverpool',
    scores: [
      { name: 'Newcastle United', score: '1' },
      { name: 'Liverpool', score: '2' },
    ],
    ...overrides,
  } as any;
}

describe('estimateMinute', () => {
  it('ennen aloitusta palauttaa null', () => {
    expect(estimateMinute('2026-08-23T18:00:00.000Z', NOW, false)).toBeNull();
  });

  it('päättyneelle ottelulle ei anneta minuuttia', () => {
    expect(estimateMinute('2026-08-23T15:30:00.000Z', NOW, true)).toBeNull();
  });

  it('ensimmäisellä puoliajalla minuutti seuraa kelloa', () => {
    expect(estimateMinute('2026-08-23T15:30:00.000Z', new Date('2026-08-23T15:50:00.000Z'), false)).toBe(20);
  });

  it('puoliaika vähennetään toisella puoliajalla', () => {
    // 75 min kulunut → 75 − 15 = 60. peliminuutti
    expect(estimateMinute('2026-08-23T15:30:00.000Z', new Date('2026-08-23T16:45:00.000Z'), false)).toBe(60);
  });

  it('ei koskaan ylitä 90:tä vaikka aikaa olisi kulunut paljon', () => {
    const paljon = estimateMinute('2026-08-23T10:00:00.000Z', NOW, false);
    expect(paljon).toBe(90);
  });

  it('kelvoton aika ei kaada', () => {
    expect(estimateMinute('ei-aika', NOW, false)).toBeNull();
  });
});

describe('toLiveMatches', () => {
  it('poimii tuloksen oikein päin kotijoukkueelle ja vieraalle', () => {
    const [m] = toLiveMatches([ev()], 'soccer_epl', NOW);
    expect(m.home).toBe('Newcastle United');
    expect(m.home_score).toBe(1);
    expect(m.away_score).toBe(2);
  });

  it('ohittaa ottelut jotka eivät ole vielä alkaneet', () => {
    const tuleva = ev({ commence_time: '2026-08-23T19:00:00.000Z' });
    expect(toLiveMatches([tuleva], 'soccer_epl', NOW)).toHaveLength(0);
  });

  it('sisältää päättyneen ottelun tuloksineen', () => {
    const [m] = toLiveMatches([ev({ completed: true })], 'soccer_epl', NOW);
    expect(m.completed).toBe(true);
    expect(m.minute).toBeNull();
  });

  it('puuttuva tulos on null eikä nolla — 0–0 ja "ei tietoa" ovat eri asioita', () => {
    const [m] = toLiveMatches([ev({ scores: null })], 'soccer_epl', NOW);
    expect(m.home_score).toBeNull();
    expect(m.away_score).toBeNull();
  });

  it('epämuotoinen pistemäärä ei tuota NaN:ia', () => {
    const [m] = toLiveMatches([ev({ scores: [{ name: 'Newcastle United', score: 'x' }] })], 'soccer_epl', NOW);
    expect(m.home_score).toBeNull();
  });

  it('järjestää aikajärjestykseen', () => {
    const a = ev({ id: 'a', commence_time: '2026-08-23T15:30:00.000Z' });
    const b = ev({ id: 'b', commence_time: '2026-08-23T13:00:00.000Z' });
    expect(toLiveMatches([a, b], 'soccer_epl', NOW).map((m) => m.match_key)).toEqual(['b', 'a']);
  });

  it('tyhjä syöte ei kaada', () => {
    expect(toLiveMatches([], 'soccer_epl', NOW)).toEqual([]);
  });
});

describe('Puuttuvat tilastot on nimetty', () => {
  it('hallinta ja laukaukset on merkitty saatavuuden ulkopuolelle', () => {
    expect(UNAVAILABLE_STATS).toContain('pallonhallinta');
    expect(UNAVAILABLE_STATS).toContain('laukaukset');
  });
});
