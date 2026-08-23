// Tiketti #57: Kauden tulokset ESPN:stä ja Elo jalkapallolle
//
// Regressiotestit kahdesta oikeasta virheestä joita tehtiin rakennettaessa:
//   1. normalizeClubName silpoi nimiä keskeltä, koska sanarajat puuttuivat
//      ("Crystal Palace" -> "crystalpale"). Token-vertailu korjasi sen.
//   2. Kesken oleva ottelu olisi päätynyt Elo-laskentaan ja vääristänyt sen.

import { describe, it, expect } from 'vitest';
import { parseEspnResults, seasonStart, hasEspnResults, ESPN_LEAGUE_CODES } from '../ingest/results-espn.js';
import { normalizeClubName } from '../publish/live-snapshot.js';
import { calculateSeasonElo, STARTING_ELO } from '../analyze/season-elo.js';

function ev(home: string, away: string, hs: string | null, as: string | null, state = 'post', date = '2026-08-22T14:00Z') {
  return {
    date,
    status: { type: { state } },
    competitions: [
      {
        competitors: [
          { homeAway: 'home', team: { displayName: home }, score: hs },
          { homeAway: 'away', team: { displayName: away }, score: as },
        ],
      },
    ],
  };
}

describe('parseEspnResults', () => {
  it('lukee tuloksen ja päättelee lopputuloksen', () => {
    const r = parseEspnResults([ev('Hull City', 'Manchester United', '2', '0')]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ home: 'Hull City', homeScore: 2, awayScore: 0, outcome: 'home' });
  });

  it('tunnistaa tasapelin ja vierasvoiton', () => {
    const r = parseEspnResults([
      ev('Newcastle United', 'Liverpool', '2', '2'),
      ev('Nottingham Forest', 'Leeds United', '0', '1'),
    ]);
    expect(r.find((m) => m.home === 'Newcastle United')!.outcome).toBe('draw');
    expect(r.find((m) => m.home === 'Nottingham Forest')!.outcome).toBe('away');
  });

  it('REGRESSIO: kesken oleva ottelu EI päädy tuloksiin', () => {
    // Kesken oleva vääristäisi Elon ja korjaantuisi vasta seuraavalla ajolla
    expect(parseEspnResults([ev('A', 'B', '1', '0', 'in')])).toHaveLength(0);
    expect(parseEspnResults([ev('A', 'B', null, null, 'pre')])).toHaveLength(0);
  });

  it('järjestää kronologisesti — Elo on järjestysherkkä', () => {
    const r = parseEspnResults([
      ev('C', 'D', '1', '0', 'post', '2026-08-23T14:00Z'),
      ev('A', 'B', '1', '0', 'post', '2026-08-21T14:00Z'),
    ]);
    expect(r.map((m) => m.home)).toEqual(['A', 'C']);
  });

  it('rikkinäinen tapahtuma ohitetaan eikä kaadu', () => {
    expect(parseEspnResults([{} as never, { competitions: [{}] } as never])).toEqual([]);
    expect(parseEspnResults([ev('A', 'B', 'x', '1')])).toHaveLength(0);
    expect(parseEspnResults(undefined as never)).toEqual([]);
  });
});

describe('seasonStart', () => {
  it('heinäkuusta eteenpäin ollaan uudessa kaudessa', () => {
    expect(seasonStart(new Date('2026-08-23T00:00Z')).getUTCFullYear()).toBe(2026);
    expect(seasonStart(new Date('2027-05-01T00:00Z')).getUTCFullYear()).toBe(2026);
    expect(seasonStart(new Date('2026-06-30T00:00Z')).getUTCFullYear()).toBe(2025);
  });
});

describe('normalizeClubName', () => {
  it('REGRESSIO: ei silpo nimeä keskeltä', () => {
    // Ilman sanarajoja "palace" sisältää "ac" ja muuttui muotoon "pale"
    expect(normalizeClubName('Crystal Palace')).toBe('crystalpalace');
    expect(normalizeClubName('Manchester City')).toBe('manchestercity');
  });

  it('yhdistää saman joukkueen eri kirjoitusasut', () => {
    expect(normalizeClubName('AFC Bournemouth')).toBe(normalizeClubName('Bournemouth'));
    expect(normalizeClubName('Brighton & Hove Albion')).toBe(normalizeClubName('Brighton and Hove Albion'));
    expect(normalizeClubName('Arsenal FC')).toBe(normalizeClubName('Arsenal'));
  });

  it('pitää eri joukkueet erillään', () => {
    expect(normalizeClubName('Manchester United')).not.toBe(normalizeClubName('Manchester City'));
    expect(normalizeClubName('Nottingham Forest')).not.toBe(normalizeClubName('Nottingham'));
  });

  it('tyhjä syöte ei kaada', () => {
    expect(normalizeClubName(null as never)).toBe('');
    expect(normalizeClubName(undefined as never)).toBe('');
  });
});

describe('Elo ESPN-tuloksista', () => {
  const matches = parseEspnResults([
    ev('Arsenal', 'Coventry City', '3', '0', 'post', '2026-08-21T14:00Z'),
    ev('Hull City', 'Manchester United', '2', '0', 'post', '2026-08-22T14:00Z'),
    ev('Newcastle United', 'Liverpool', '2', '2', 'post', '2026-08-23T14:00Z'),
  ]);

  it('nollasumma säilyy — Elo siirtyy, ei synny', () => {
    const r = calculateSeasonElo(matches);
    const sum = r.ratings.reduce((s, t) => s + t.elo, 0);
    expect(sum).toBeCloseTo(r.ratings.length * STARTING_ELO, 6);
  });

  it('voittaja nousee, häviäjä laskee, tasapeli lähes paikallaan', () => {
    const r = calculateSeasonElo(matches);
    const by = (t: string) => r.ratings.find((x) => x.team === t)!;
    expect(by('Arsenal').elo).toBeGreaterThan(STARTING_ELO);
    expect(by('Coventry City').elo).toBeLessThan(STARTING_ELO);
    // Kotitasapeli: kotietu huomioiden koti menettää hieman
    expect(Math.abs(by('Newcastle United').elo - STARTING_ELO)).toBeLessThan(10);
  });
});

describe('Sarjakoodit', () => {
  it('Valioliigalle ja Veikkausliigalle on ESPN-koodi', () => {
    expect(ESPN_LEAGUE_CODES.soccer_epl).toBe('eng.1');
    expect(hasEspnResults('soccer_epl')).toBe(true);
    expect(hasEspnResults('soccer_finland_veikkausliiga')).toBe(true);
  });

  it('tuntematon sarja tunnistetaan', () => {
    expect(hasEspnResults('soccer_ei_olemassa')).toBe(false);
  });
});
