// Tiketti #65: Tulokset ESPN:sta, tunniste historiasta
//
// KRIITTISIN LUKITTAVA ASIA: ottelutunnistetta EI saa johtaa ESPN:n nimesta.
// buildMatchId johtaa tunnisteen nimesta, ja lahteet kirjoittavat nimet eri
// tavoin ("Brighton & Hove Albion" -> B&H vs "Brighton and Hove Albion" -> BAH).
// Jos tunniste johdettaisiin, mittarit eivat loytaisi tuloksia ennusteille --
// hiljainen vika juuri siina kohdassa jota ei kukaan katso paivittain.

import { describe, it, expect } from 'vitest';
import { matchKey, matchResultsToHistory, HistoryIndex } from '../ingest/results-from-espn.js';

function index(entries: Array<{ id: string; day: string; home: string; away: string }>): HistoryIndex {
  const byKey = new Map();
  for (const e of entries) {
    byKey.set(matchKey(e.day, e.home, e.away), {
      id: e.id,
      league: 'Valioliiga',
      kickoff: `${e.day}T14:00:00.000Z`,
      home: e.home,
      away: e.away,
    });
  }
  return { byKey };
}

const espnResult = (home: string, away: string, hs = 2, as = 1, date = '2026-08-22') => ({
  date,
  home,
  away,
  homeScore: hs,
  awayScore: as,
  outcome: (hs > as ? 'home' : as > hs ? 'away' : 'draw') as 'home' | 'draw' | 'away',
});

describe('matchKey', () => {
  it('REGRESSIO: sama ottelu eri kirjoitusasuilla tuottaa saman avaimen', () => {
    // Tama on koko ratkaisun ydin
    expect(matchKey('2026-08-23', 'Brighton & Hove Albion', 'Aston Villa')).toBe(
      matchKey('2026-08-23', 'Brighton and Hove Albion', 'Aston Villa')
    );
    expect(matchKey('2026-08-23', 'AFC Bournemouth', 'Arsenal')).toBe(matchKey('2026-08-23', 'Bournemouth', 'Arsenal FC'));
  });

  it('eri ottelut eivat tormaa', () => {
    expect(matchKey('2026-08-23', 'Manchester United', 'Arsenal')).not.toBe(
      matchKey('2026-08-23', 'Manchester City', 'Arsenal')
    );
    // Sama pari eri paivana on eri ottelu
    expect(matchKey('2026-08-23', 'A', 'B')).not.toBe(matchKey('2026-08-24', 'A', 'B'));
    // Koti ja vieras eivat ole vaihdettavissa
    expect(matchKey('2026-08-23', 'A', 'B')).not.toBe(matchKey('2026-08-23', 'B', 'A'));
  });
});

describe('matchResultsToHistory', () => {
  const hist = index([{ id: 'soccer_epl:2026-08-22:HUL-MAN', day: '2026-08-22', home: 'Hull City', away: 'Manchester United' }]);

  it('KAYTTAA HISTORIAN TUNNISTETTA eika johda sita ESPN:n nimesta', () => {
    const { results } = matchResultsToHistory([espnResult('Hull City', 'Manchester United')], hist, 'soccer_epl', 'nyt');
    expect(results).toHaveLength(1);
    expect(results[0].match_id).toBe('soccer_epl:2026-08-22:HUL-MAN');
  });

  it('tasmaa vaikka ESPN kirjoittaa nimen eri tavoin', () => {
    const h = index([{ id: 'ID-1', day: '2026-08-23', home: 'Brighton and Hove Albion', away: 'Aston Villa' }]);
    const { results, unmatched } = matchResultsToHistory(
      [espnResult('Brighton & Hove Albion', 'Aston Villa', 4, 0, '2026-08-23')],
      h,
      'soccer_epl',
      'nyt'
    );
    expect(unmatched).toHaveLength(0);
    expect(results[0].match_id).toBe('ID-1');
  });

  it('OHITTAA ottelun jota ei ole historiassa — sille ei ole ennustetta', () => {
    const { results, unmatched } = matchResultsToHistory([espnResult('Tuntematon', 'Joukkue')], hist, 'soccer_epl', 'nyt');
    expect(results).toHaveLength(0);
    expect(unmatched).toHaveLength(1);
  });

  it('lukee tuloksen ja lopputuloksen oikein', () => {
    const { results } = matchResultsToHistory([espnResult('Hull City', 'Manchester United', 2, 0)], hist, 'soccer_epl', 'nyt');
    expect(results[0]).toMatchObject({ home_score: 2, away_score: 0, outcome: 'home', simulated: false });
  });

  it('merkitsee tuloksen EI-simuloiduksi', () => {
    // Simuloitu ja oikea tulos eivat saa sekoittua mittareissa (tiketti #32)
    const { results } = matchResultsToHistory([espnResult('Hull City', 'Manchester United')], hist, 'soccer_epl', 'nyt');
    expect(results[0].simulated).toBe(false);
  });

  it('kayttaa HISTORIAN joukkuenimia eika ESPN:n', () => {
    // Nain results.json pysyy yhtenaisena snapshotin kanssa.
    // Huom: normalisoija ei arvaa lyhenteita ("Man United" != "Manchester
    // United") -- se voisi sekoittaa eri joukkueita. Vain seuramuodot ja
    // valimerkit siivotaan.
    const { results } = matchResultsToHistory([espnResult('Hull City AFC', 'Manchester United FC')], hist, 'soccer_epl', 'nyt');
    expect(results[0].home).toBe('Hull City');
    expect(results[0].away).toBe('Manchester United');
  });

  it('tyhja syote ei kaada', () => {
    expect(matchResultsToHistory([], hist, 'soccer_epl', 'nyt')).toEqual({ results: [], unmatched: [] });
  });
});
