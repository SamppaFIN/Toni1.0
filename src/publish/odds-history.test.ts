// Kerroinhistoria (tiketti #75)
//
// Tarkein ominaisuus on KUMULATIIVISUUS: uusi ajo ei saa hukata vanhoja
// havaintoja, koska history/-hakemistoa siivotaan mutta kerroinhistoria on
// juuri se osa joka halutaan sailyttaa.

import { describe, it, expect } from 'vitest';
import { pointFrom, mergeSnapshots, attachResults } from './odds-history.js';
import type { OddsHistoryFile, OddsTimeline } from './odds-history.js';
import type { MatchCard, Snapshot } from '../types-football.js';

const card = (id: string, edges: unknown[], kickoff = '2026-08-26T18:00:00.000Z'): MatchCard =>
  ({
    id,
    kickoff,
    league: 'Valioliiga',
    home: { name: 'Arsenal' },
    away: { name: 'Chelsea' },
    model: { probs: { home: 0.5, draw: 0.25, away: 0.25 } },
    market: { implied: { home: 0.48, draw: 0.26, away: 0.26 } },
    analysis: { edges },
  }) as unknown as MatchCard;

const edge = (side: string, over: Record<string, unknown> = {}) => ({
  side, odds: 2.5, odds_effective: 2.5, book: 'Pinnacle', model_prob: 0.5,
  implied_prob: 0.48, edge: 0.04, flag: 'candidate', kelly_fraction: 0.01, stake_suggestion: 1, ...over,
});

const snap = (at: string, matches: MatchCard[]) =>
  ({ snapshot: { generated_at: at, matches } as unknown as Snapshot });

describe('pointFrom', () => {
  it('poimii kertoimet, edget ja liput', () => {
    const p = pointFrom(card('m1', [edge('home'), edge('away', { odds: 3.1, flag: 'none', stake_suggestion: 0 })]), 'T')!;
    expect(p.odds).toEqual({ home: 2.5, away: 3.1 });
    expect(p.flag).toEqual({ home: 'candidate', away: 'none' });
    expect(p.stake).toEqual({ home: 1 }); // nollapanosta ei talleteta
  });

  it('kertoimeton kortti ei tuota havaintoa', () => {
    expect(pointFrom(card('m1', []), 'T')).toBeNull();
  });

  it('kirjaa mallin ja markkinan rinnakkain', () => {
    const p = pointFrom(card('m1', [edge('home')]), 'T')!;
    expect(p.model.home).toBe(0.5);
    expect(p.implied.home).toBe(0.48);
  });
});

describe('mergeSnapshots — kumulatiivisuus', () => {
  it('kaksi ajoa tuottaa kaksi havaintoa', () => {
    const out = mergeSnapshots(null, [
      snap('2026-08-24T08:00:00.000Z', [card('m1', [edge('home', { odds: 2.5 })])]),
      snap('2026-08-24T14:00:00.000Z', [card('m1', [edge('home', { odds: 2.7 })])]),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].points).toHaveLength(2);
    expect(out[0].points.map((p) => p.odds.home)).toEqual([2.5, 2.7]);
  });

  it('SAMA AJO KAHDESTI ei kasvata sarjaa', () => {
    const s = snap('2026-08-24T08:00:00.000Z', [card('m1', [edge('home')])]);
    expect(mergeSnapshots(null, [s, s])[0].points).toHaveLength(1);
  });

  it('VANHAT HAVAINNOT SAILYVAT vaikka lahdetiedosto katoaisi', () => {
    const existing: OddsHistoryFile = {
      schema_version: 1,
      generated_at: 'T',
      matches: [
        {
          match_id: 'm1', league: 'Valioliiga', sport_key: 'soccer_epl',
          kickoff: '2026-08-26T18:00:00.000Z', home: 'Arsenal', away: 'Chelsea',
          points: [{ at: '2026-08-01T08:00:00.000Z', odds: { home: 2.0 }, book: {}, model: { home: 0.5, draw: 0.25, away: 0.25 }, implied: { home: 0.5, draw: 0.25, away: 0.25 }, edge: {}, flag: {}, stake: {} }],
          result: null,
        },
      ],
    };
    // Uusi ajo ei sisalla vanhaa paivaa lainkaan
    const out = mergeSnapshots(existing, [snap('2026-08-24T08:00:00.000Z', [card('m1', [edge('home')])])]);
    expect(out[0].points).toHaveLength(2);
    expect(out[0].points[0].at).toBe('2026-08-01T08:00:00.000Z');
  });

  it('havainnot jarjestetaan ajan mukaan', () => {
    const out = mergeSnapshots(null, [
      snap('2026-08-24T14:00:00.000Z', [card('m1', [edge('home')])]),
      snap('2026-08-24T08:00:00.000Z', [card('m1', [edge('home')])]),
    ]);
    expect(out[0].points.map((p) => p.at)).toEqual([
      '2026-08-24T08:00:00.000Z',
      '2026-08-24T14:00:00.000Z',
    ]);
  });

  it('eri ottelut pysyvat erillaan ja jarjestyvat aloitusajan mukaan', () => {
    const out = mergeSnapshots(null, [
      snap('T', [card('m2', [edge('home')], '2026-08-27T18:00:00.000Z'), card('m1', [edge('home')], '2026-08-26T18:00:00.000Z')]),
    ]);
    expect(out.map((t) => t.match_id)).toEqual(['m1', 'm2']);
  });

  it('aikaleimaton snapshot ohitetaan', () => {
    expect(mergeSnapshots(null, [{ snapshot: { matches: [card('m1', [edge('home')])] } as unknown as Snapshot }])).toHaveLength(0);
  });

  it('sport_key johdetaan match_id:sta', () => {
    const out = mergeSnapshots(null, [snap('T', [card('soccer_epl:2026-08-26:ARS-CHE', [edge('home')])])]);
    expect(out[0].sport_key).toBe('soccer_epl');
  });
});

describe('attachResults', () => {
  const timeline = (id: string): OddsTimeline =>
    ({ match_id: id, points: [], result: null }) as unknown as OddsTimeline;

  it('liittaa tuloksen oikeaan otteluun', () => {
    const out = attachResults([timeline('m1'), timeline('m2')], [
      { match_id: 'm2', outcome: 'away', home_score: 0, away_score: 1 },
    ]);
    expect(out[0].result).toBeNull();
    expect(out[1].result).toEqual({ outcome: 'away', home_score: 0, away_score: 1 });
  });

  it('tuntematon tulos ei luo ottelua', () => {
    const out = attachResults([timeline('m1')], [{ match_id: 'tuntematon', outcome: 'home', home_score: 1, away_score: 0 }]);
    expect(out).toHaveLength(1);
    expect(out[0].result).toBeNull();
  });
});
