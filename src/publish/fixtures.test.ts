// Otteluohjelmakalenteri (tiketti #74)

import { describe, it, expect } from 'vitest';
import { parseFixtures, attachOdds, buildDays, joinKey, fixtureStatus, fixturesFromSnapshots } from './fixtures.js';
import type { FixtureMatch } from './fixtures.js';
import type { Snapshot } from '../types-football.js';

const NOW = new Date('2026-08-25T12:00:00.000Z');

const event = (id: string, date: string, home: string, away: string, state = 'pre', hs?: number, as?: number) => ({
  id,
  date,
  status: { type: { state, completed: state === 'post' } },
  competitions: [
    {
      competitors: [
        { homeAway: 'home', team: { displayName: home }, score: hs },
        { homeAway: 'away', team: { displayName: away }, score: as },
      ],
    },
  ],
});

describe('parseFixtures', () => {
  it('poimii ottelun perustiedot', () => {
    const [f] = parseFixtures([event('1', '2026-08-26T18:00Z', 'Arsenal', 'Chelsea')], 'soccer_epl', NOW);
    expect(f).toMatchObject({ espn_id: '1', home: 'Arsenal', away: 'Chelsea', date: '2026-08-26', status: 'upcoming' });
    expect(f.has_odds).toBe(false);
    expect(f.match_id).toBeNull();
  });

  it('paattynyt ottelu saa tuloksen', () => {
    const [f] = parseFixtures([event('1', '2026-08-20T18:00Z', 'A', 'B', 'post', 2, 1)], 'soccer_epl', NOW);
    expect(f.status).toBe('finished');
    expect(f.home_score).toBe(2);
    expect(f.away_score).toBe(1);
  });

  it('nimeton rivi pudotetaan eika kaada koko hakua', () => {
    const broken = { id: '9', date: '2026-08-26T18:00Z', competitions: [{ competitors: [] }] };
    const list = parseFixtures([broken, event('1', '2026-08-26T18:00Z', 'A', 'B')], 'soccer_epl', NOW);
    expect(list).toHaveLength(1);
  });

  it('sarjan nimi tulee rekisterista', () => {
    const [f] = parseFixtures([event('1', '2026-08-26T18:00Z', 'A', 'B')], 'soccer_epl', NOW);
    expect(f.league).toBe('Valioliiga');
  });
});

describe('fixtureStatus', () => {
  it('tuntematon tila menneisyydessa on paattynyt, ei tulossa', () => {
    // Muuten mennyt ottelu jaisi ikuisesti roikkumaan "tulossa"-tilaan
    expect(fixtureStatus(undefined, undefined, '2026-08-20T18:00Z', NOW)).toBe('finished');
  });

  it('tuntematon tila tulevaisuudessa on tulossa', () => {
    expect(fixtureStatus(undefined, undefined, '2026-08-30T18:00Z', NOW)).toBe('upcoming');
  });

  it('completed voittaa tilakoodin', () => {
    expect(fixtureStatus('pre', true, '2026-08-30T18:00Z', NOW)).toBe('finished');
  });

  it('kaynnissa oleva tunnistetaan', () => {
    expect(fixtureStatus('in', false, '2026-08-25T11:00Z', NOW)).toBe('live');
  });
});

describe('attachOdds — nimipohjainen liitos', () => {
  const fixture = (home: string, away: string, date = '2026-08-26'): FixtureMatch =>
    ({ espn_id: '1', match_id: null, date, kickoff: `${date}T18:00:00.000Z`, sport_key: 'soccer_epl',
       league: 'Valioliiga', home, away, status: 'upcoming', home_score: null, away_score: null, has_odds: false });

  const snap = (home: string, away: string, id: string, kickoff = '2026-08-26T18:00:00.000Z'): Snapshot =>
    ({ matches: [{ id, kickoff, home: { name: home }, away: { name: away } }] }) as unknown as Snapshot;

  it('ERI NIMIMUOTO liittyy silti — tama on koko pointti', () => {
    // ESPN: "Brighton & Hove Albion", Odds API: "Brighton and Hove Albion"
    const out = attachOdds(
      [fixture('Brighton & Hove Albion', 'Aston Villa')],
      [snap('Brighton and Hove Albion', 'Aston Villa', 'soccer_epl:2026-08-26:BRI-AST')]
    );
    expect(out[0].has_odds).toBe(true);
    expect(out[0].match_id).toBe('soccer_epl:2026-08-26:BRI-AST');
  });

  it('eri paiva ei liity', () => {
    const out = attachOdds([fixture('A', 'B', '2026-08-26')], [snap('A', 'B', 'x', '2026-08-27T18:00:00.000Z')]);
    expect(out[0].has_odds).toBe(false);
  });

  it('kaannetty kotijoukkue ei liity', () => {
    const out = attachOdds([fixture('A', 'B')], [snap('B', 'A', 'x')]);
    expect(out[0].has_odds).toBe(false);
  });

  it('tuntematon ottelu jaa ilman kertoimia', () => {
    const out = attachOdds([fixture('A', 'B')], []);
    expect(out[0]).toMatchObject({ has_odds: false, match_id: null });
  });

  it('syote ei muutu', () => {
    const input = [fixture('A', 'B')];
    attachOdds(input, [snap('A', 'B', 'x')]);
    expect(input[0].has_odds).toBe(false);
  });
});

describe('buildDays', () => {
  const f = (date: string, hasOdds = false, league = 'Valioliiga'): FixtureMatch =>
    ({ date, has_odds: hasOdds, league } as FixtureMatch);

  it('TYHJIA PAIVIA EI LISTATA', () => {
    // Kayttajan vaatimus: aikajanalla nakyy vain paivat joilla on kohteita
    const days = buildDays([f('2026-08-26'), f('2026-08-28')]);
    expect(days.map((d) => d.date)).toEqual(['2026-08-26', '2026-08-28']);
    expect(days.find((d) => d.date === '2026-08-27')).toBeUndefined();
  });

  it('laskee ottelut ja kertoimelliset erikseen', () => {
    const days = buildDays([f('2026-08-26', true), f('2026-08-26', false), f('2026-08-26', true)]);
    expect(days[0]).toMatchObject({ matches: 3, with_odds: 2 });
  });

  it('sarjat listataan uniikkeina ja aakkosissa', () => {
    const days = buildDays([f('2026-08-26', false, 'Serie A'), f('2026-08-26', false, 'La Liga'), f('2026-08-26', false, 'Serie A')]);
    expect(days[0].leagues).toEqual(['La Liga', 'Serie A']);
  });

  it('paivat aikajarjestyksessa', () => {
    const days = buildDays([f('2026-08-28'), f('2026-08-26'), f('2026-08-27')]);
    expect(days.map((d) => d.date)).toEqual(['2026-08-26', '2026-08-27', '2026-08-28']);
  });

  it('tyhja syote -> tyhja lista', () => {
    expect(buildDays([])).toEqual([]);
  });
});

describe('fixturesFromSnapshots — ESPN-aukon paikkaus', () => {
  const snap = (home: string, away: string, id: string, kickoff: string): Snapshot =>
    ({ matches: [{ id, kickoff, league: 'Veikkausliiga', home: { name: home }, away: { name: away } }] }) as unknown as Snapshot;

  it('lisaa ottelun jota ESPN ei palauttanut', () => {
    const out = fixturesFromSnapshots(
      [snap('HJK Helsinki', 'IF Gnistan', 'soccer_finland_veikkausliiga:2026-08-26:HJK-GNI', '2026-08-26T16:00:00.000Z')],
      new Set(),
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ league: 'Veikkausliiga', has_odds: true, status: 'upcoming' });
  });

  it('EI lisaa ottelua jonka ESPN jo antoi', () => {
    const known = new Set([joinKey('2026-08-26', 'HJK Helsinki', 'IF Gnistan')]);
    const out = fixturesFromSnapshots(
      [snap('HJK Helsinki', 'IF Gnistan', 'x', '2026-08-26T16:00:00.000Z')],
      known,
      NOW
    );
    expect(out).toHaveLength(0);
  });

  it('sama ottelu kahdessa snapshotissa lisataan kerran', () => {
    const s = snap('A', 'B', 'x', '2026-08-26T16:00:00.000Z');
    expect(fixturesFromSnapshots([s, s], new Set(), NOW)).toHaveLength(1);
  });

  it('mennyt ottelu merkitaan paattyneeksi', () => {
    const out = fixturesFromSnapshots([snap('A', 'B', 'x', '2026-08-20T16:00:00.000Z')], new Set(), NOW);
    expect(out[0].status).toBe('finished');
  });
});
