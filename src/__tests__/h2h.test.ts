// Tiketti #69: Keskinaiset kohtaamiset ESPN:sta
//
// stats.h2h on ollut tyhja taulukko tiketista #24 asti. Tarkein lukittava
// asia on NAKOKULMA: "kotona" tarkoittaa etta KYSEINEN joukkue oli kotona,
// ei etta ottelu oli tassa stadionissa. Vaarin pain merkitty historia
// kaantaisi lukijan johtopaatoksen ymparinsa.

import { describe, it, expect } from 'vitest';
import { parseH2H } from '../ingest/results-espn.js';

function series(events: unknown[]) {
  return { seasonseries: [{ events }] };
}

function game(home: string, away: string, hs: string, as: string, date: string, completed = true) {
  return {
    date,
    statusType: { completed },
    competitors: [
      { homeAway: 'home', team: { displayName: home }, score: hs },
      { homeAway: 'away', team: { displayName: away }, score: as },
    ],
  };
}

describe('parseH2H', () => {
  const data = series([
    game('Arsenal', 'Chelsea', '4', '0', '2014-01-24T19:45Z'),
    game('Chelsea', 'Arsenal', '2', '1', '2015-03-10T19:45Z'),
  ]);

  it('poimii kohtaamiset tuloksineen', () => {
    const h = parseH2H(data, 'Arsenal');
    expect(h).toHaveLength(2);
    expect(h[0].score).toBe('2–1');
  });

  it('REGRESSIO: venue on NAKOKULMAN mukaan, ei ottelun mukaan', () => {
    const arsenal = parseH2H(data, 'Arsenal');
    const chelsea = parseH2H(data, 'Chelsea');

    // Sama ottelu on Arsenalille koti ja Chelsealle vieras
    const a2014 = arsenal.find((x) => x.date === '2014-01-24')!;
    const c2014 = chelsea.find((x) => x.date === '2014-01-24')!;
    expect(a2014.venue).toBe('home');
    expect(c2014.venue).toBe('away');
  });

  it('jarjestaa uusin ensin', () => {
    expect(parseH2H(data, 'Arsenal').map((h) => h.date)).toEqual(['2015-03-10', '2014-01-24']);
  });

  it('ohittaa kesken olevat ottelut', () => {
    const live = series([game('Arsenal', 'Chelsea', '1', '0', '2026-08-25T19:45Z', false)]);
    expect(parseH2H(live, 'Arsenal')).toHaveLength(0);
  });

  it('ohittaa ottelun jossa nakokulmajoukkuetta ei ole — ei merkita vaarin', () => {
    const other = series([game('Liverpool', 'Everton', '2', '1', '2020-01-01T19:45Z')]);
    expect(parseH2H(other, 'Arsenal')).toHaveLength(0);
  });

  it('tasmaa vaikka nimi kirjoitettaisiin seuramuodolla', () => {
    expect(parseH2H(data, 'Arsenal FC')).toHaveLength(2);
  });

  it('rajaa tulosten maaran', () => {
    const many = series(Array.from({ length: 12 }, (_, i) =>
      game('Arsenal', 'Chelsea', '1', '0', `20${10 + i}-01-01T19:45Z`)
    ));
    expect(parseH2H(many, 'Arsenal', 5)).toHaveLength(5);
  });

  it('puuttuva tai rikkinainen data ei kaada', () => {
    expect(parseH2H({}, 'Arsenal')).toEqual([]);
    expect(parseH2H(null, 'Arsenal')).toEqual([]);
    expect(parseH2H(series([{}]), 'Arsenal')).toEqual([]);
    expect(parseH2H(series([game('Arsenal', 'Chelsea', 'x', '0', '2020-01-01T19:45Z')]), 'Arsenal')).toEqual([]);
  });
});
