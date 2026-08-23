// Tiketti #56: ESPN-rajapinnan jäsennys
//
// Rajapinta on dokumentoimaton, joten sen muoto voi muuttua. Nämä testit
// lukitsevat oman jäsennyksemme aitoa vastausrakennetta vastaan (kopioitu
// oikeasta kutsusta 23.8.2026, Newcastle–Liverpool) — jos ESPN muuttaa muotoa,
// testit eivät sitä huomaa, mutta ne varmistavat ettemme itse riko jäsennystä.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä
import { parseEvent, parseStats, parseKeyEvents, normalizeTeam, LEAGUE_CODES, POLL_MS } from '../../public/app/football-espn.js';

const EVENT = {
  id: '401879319',
  date: '2026-08-23T15:30Z',
  status: { type: { state: 'in', description: 'Second Half' }, displayClock: "77'" },
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { displayName: 'Newcastle United' }, score: '2' },
        { homeAway: 'away', team: { displayName: 'Liverpool' }, score: '1' },
      ],
    },
  ],
};

describe('parseEvent', () => {
  it('lukee joukkueet ja tuloksen homeAway-kentästä eikä järjestyksestä', () => {
    const kaannetty = {
      ...EVENT,
      competitions: [{ competitors: [...EVENT.competitions[0].competitors].reverse() }],
    };
    const m = parseEvent(kaannetty);
    expect(m.home).toBe('Newcastle United');
    expect(m.away).toBe('Liverpool');
    expect(m.homeScore).toBe(2);
    expect(m.awayScore).toBe(1);
  });

  it('tunnistaa käynnissä olevan ottelun ja kellon', () => {
    const m = parseEvent(EVENT);
    expect(m.inPlay).toBe(true);
    expect(m.completed).toBe(false);
    expect(m.clock).toBe("77'");
  });

  it('tunnistaa päättyneen ja alkamattoman', () => {
    const post = parseEvent({ ...EVENT, status: { type: { state: 'post', description: 'Full Time' } } });
    expect(post.completed).toBe(true);
    expect(post.inPlay).toBe(false);

    const pre = parseEvent({ ...EVENT, status: { type: { state: 'pre', description: 'Scheduled' } } });
    expect(pre.inPlay).toBe(false);
    expect(pre.completed).toBe(false);
  });

  it('puuttuva tulos on null eikä nolla', () => {
    const m = parseEvent({
      ...EVENT,
      competitions: [
        {
          competitors: [
            { homeAway: 'home', team: { displayName: 'A' }, score: null },
            { homeAway: 'away', team: { displayName: 'B' }, score: '' },
          ],
        },
      ],
    });
    expect(m.homeScore).toBeNull();
    expect(m.awayScore).toBeNull();
  });

  it('rikkinäinen tapahtuma palauttaa null eikä kaadu', () => {
    expect(parseEvent({})).toBeNull();
    expect(parseEvent({ competitions: [{}] })).toBeNull();
    expect(parseEvent(null)).toBeNull();
  });
});

describe('parseStats', () => {
  const DATA = {
    boxscore: {
      teams: [
        {
          homeAway: 'home',
          team: { displayName: 'Newcastle United' },
          statistics: [
            { name: 'possessionPct', displayValue: '42.4' },
            { name: 'totalShots', displayValue: '11' },
            { name: 'shotsOnTarget', displayValue: '3' },
          ],
        },
        {
          homeAway: 'away',
          team: { displayName: 'Liverpool' },
          statistics: [
            { name: 'possessionPct', displayValue: '57.6' },
            { name: 'totalShots', displayValue: '20' },
            { name: 'shotsOnTarget', displayValue: '5' },
          ],
        },
      ],
    },
  };

  it('poimii hallinnan ja laukaukset oikein päin', () => {
    const s = parseStats(DATA);
    expect(s.home.possessionPct).toBe(42.4);
    expect(s.away.possessionPct).toBe(57.6);
    expect(s.home.totalShots).toBe(11);
    expect(s.away.totalShots).toBe(20);
  });

  it('ei luota taulukon järjestykseen vaan homeAway-kenttään', () => {
    const kaannetty = { boxscore: { teams: [...DATA.boxscore.teams].reverse() } };
    expect(parseStats(kaannetty).home.possessionPct).toBe(42.4);
  });

  it('puuttuva boxscore palauttaa null', () => {
    expect(parseStats({})).toBeNull();
    expect(parseStats({ boxscore: { teams: [] } })).toBeNull();
  });
});

describe('parseKeyEvents', () => {
  it('poimii maalit ja kortit muttei muuta', () => {
    const evs = parseKeyEvents({
      keyEvents: [
        { type: { text: 'Goal' }, clock: { displayValue: "23'" }, text: 'Isak scores' },
        { type: { text: 'Yellow Card' }, clock: { displayValue: "40'" }, text: 'Booking' },
        { type: { text: 'Substitution' }, clock: { displayValue: "60'" }, text: 'Sub' },
      ],
    });
    expect(evs).toHaveLength(2);
    expect(evs[0].minute).toBe("23'");
  });

  it('tyhjä tai puuttuva lista ei kaada', () => {
    expect(parseKeyEvents({})).toEqual([]);
    expect(parseKeyEvents({ keyEvents: [] })).toEqual([]);
  });
});

describe('normalizeTeam', () => {
  it('täsmää ESPN:n ja snapshotin eri kirjoitusasut', () => {
    expect(normalizeTeam('Brighton & Hove Albion')).toBe(normalizeTeam('Brighton and Hove Albion'));
    expect(normalizeTeam('AFC Bournemouth')).toBe(normalizeTeam('Bournemouth'));
    expect(normalizeTeam('HJK Helsinki')).toBe(normalizeTeam('HJK  Helsinki'));
  });

  it('eri joukkueet eivät täsmää', () => {
    expect(normalizeTeam('Manchester United')).not.toBe(normalizeTeam('Manchester City'));
  });

  it('tyhjä syöte ei kaada', () => {
    expect(normalizeTeam(null)).toBe('');
    expect(normalizeTeam(undefined)).toBe('');
  });
});

describe('Konfiguraatio', () => {
  it('Valioliigalle ja Veikkausliigalle on sarjakoodi', () => {
    expect(LEAGUE_CODES.Valioliiga).toBe('eng.1');
    expect(LEAGUE_CODES.Veikkausliiga).toBe('fin.1');
  });

  it('kyselyväli on maltillinen — tämä on toisen palvelin', () => {
    expect(POLL_MS).toBeGreaterThanOrEqual(20_000);
  });
});
