// Tiketti #60: Kerroinarkisto
//
// Arkiston tehtava on sailyttaa se hinta jota vastaan arvio tehtiin, jotta
// analyysia voi arvioida jalkikateen. Testit lukitsevat kolme asiaa:
//   1. Ottelu talletetaan OTTELUPAIVAN alle, ei hakupaivan
//   2. Karsinta poistaa vanhimman ensin ja pysyy rajoissa
//   3. Kiintion tayttyminen ei kaada -- arkisto on mukavuustoiminto

import { describe, it, expect, beforeEach, vi } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä
import * as A from '../../public/app/football-archive.js';

// Yksinkertainen localStorage-jaljitelma
function mockStorage(failAfter = Infinity) {
  const data = new Map<string, string>();
  let writes = 0;
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (++writes > failAfter) throw new Error('QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k: string) => data.delete(k),
    _data: data,
  };
}

function match(id: string, kickoff: string, league = 'Valioliiga') {
  return {
    id,
    league,
    kickoff,
    home: { name: 'Koti', short: 'KOT', color: '#000' },
    away: { name: 'Vieras', short: 'VIE', color: '#fff' },
    odds: [{ bookmaker: 'Pinnacle', key: 'pinnacle', home: 2.1, draw: 3.4, away: 3.6, commission: 0, link: 'https://x.example' }],
    best: { home: 2.1, draw: 3.4, away: 3.6 },
    market: { margin: 0.03, implied: { home: 0.45, draw: 0.28, away: 0.27 }, sharp: null, sharp_source: null },
    model: { method: 'poisson+sharp-blend', probs: { home: 0.48, draw: 0.27, away: 0.25 }, poisson_probs: null, blend_weight: 0.2, lambda_home: 1.5, lambda_away: 1.1 },
    analysis: { edges: [{ side: 'home', odds: 2.1, odds_effective: 2.1, book: 'Pinnacle', model_prob: 0.48, implied_prob: 0.45, edge: 0.008, flag: 'none', stake_suggestion: 0 }] },
    news: [{ title: 'iso uutinen', url: 'x', source: 'y' }],
  };
}

beforeEach(() => {
  vi.stubGlobal('localStorage', mockStorage());
});

describe('compactMatch', () => {
  it('sailyttaa kertoimet, mallin, markkinan ja edget', () => {
    const c = A.compactMatch(match('a', '2026-08-24T18:00:00Z'));
    expect(c.odds[0].bookmaker).toBe('Pinnacle');
    expect(c.odds[0].link).toBe('https://x.example');
    expect(c.model.probs.home).toBe(0.48);
    expect(c.market.implied.home).toBe(0.45);
    expect(c.edges[0].edge).toBeCloseTo(0.008, 6);
  });

  it('pudottaa uutiset — ne eivat tarvita hinnan arviointiin', () => {
    const c = A.compactMatch(match('a', '2026-08-24T18:00:00Z'));
    expect((c as Record<string, unknown>).news).toBeUndefined();
  });

  it('on selvasti pienempi kuin taysi ottelu', () => {
    const m = match('a', '2026-08-24T18:00:00Z');
    expect(JSON.stringify(A.compactMatch(m)).length).toBeLessThan(JSON.stringify(m).length);
  });
});

describe('archiveSnapshot', () => {
  it('REGRESSIO: ottelu menee OTTELUPAIVAN alle, ei hakupaivan', () => {
    // Haku tanaan, ottelu huomenna -> loydyttava huomisen alta
    const now = new Date(2026, 7, 24, 12, 0);
    const huomenna = new Date(2026, 7, 25, 18, 0);
    A.archiveSnapshot({ matches: [match('a', huomenna.toISOString())] }, now);

    expect(A.archivedDay('2026-08-25')).toHaveLength(1);
    expect(A.archivedDay('2026-08-24')).toHaveLength(0);
  });

  it('sama ottelu ylikirjoitetaan uudemmalla havainnolla', () => {
    const day = new Date(2026, 7, 24, 18, 0).toISOString();
    const first = match('a', day);
    A.archiveSnapshot({ matches: [first] }, new Date(2026, 7, 24, 8, 0));

    const later = { ...match('a', day) };
    later.odds[0].home = 2.5;
    A.archiveSnapshot({ matches: [later] }, new Date(2026, 7, 24, 14, 0));

    const stored = A.archivedDay(A.dayKey(day));
    expect(stored).toHaveLength(1);
    expect(stored[0].odds[0].home).toBe(2.5);
  });

  it('jarjestaa paivan ottelut aikajarjestykseen', () => {
    const d = (h: number) => new Date(2026, 7, 24, h, 0).toISOString();
    A.archiveSnapshot({ matches: [match('myohemmin', d(20)), match('aiemmin', d(15))] }, new Date(2026, 7, 24));
    expect(A.archivedDay('2026-08-24').map((m: { id: string }) => m.id)).toEqual(['aiemmin', 'myohemmin']);
  });

  it('tyhja snapshot ei kaada eika kirjoita mitaan', () => {
    expect(A.archiveSnapshot({ matches: [] })).toEqual({ saved: 0, ok: true });
    expect(A.archiveSnapshot(null)).toEqual({ saved: 0, ok: true });
  });

  it('kelvoton kickoff ohitetaan', () => {
    const bad = match('a', 'ei-aika');
    expect(A.archiveSnapshot({ matches: [bad] }).saved).toBe(0);
  });

  it('KIINTIOVIRHE ei kaada — arkisto on mukavuustoiminto', () => {
    vi.stubGlobal('localStorage', mockStorage(0)); // jokainen kirjoitus epaonnistuu
    const r = A.archiveSnapshot({ matches: [match('a', new Date(2026, 7, 24, 18).toISOString())] });
    expect(r.ok).toBe(false);
    expect(r.saved).toBe(1); // yritettiin, ei kaadettu
  });
});

describe('prune', () => {
  function archiveWith(days: string[]) {
    return Object.fromEntries(days.map((d) => [d, { matches: { x: { id: 'x', kickoff: d } } }]));
  }

  it('poistaa vanhimman ensin kun paivia on liikaa', () => {
    const a = archiveWith(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(Object.keys(A.prune(a, 2)).sort()).toEqual(['2026-08-02', '2026-08-03']);
  });

  it('ei poista mitaan kun rajoissa ollaan', () => {
    const a = archiveWith(['2026-08-01', '2026-08-02']);
    expect(Object.keys(A.prune(a, 30))).toHaveLength(2);
  });

  it('karsii myos tavurajan mukaan', () => {
    const a = archiveWith(['2026-08-01', '2026-08-02', '2026-08-03']);
    const pruned = A.prune(a, 30, 120);
    expect(Object.keys(pruned).length).toBeLessThan(3);
  });

  it('jattaa aina vahintaan yhden paivan vaikka tavuraja ylittyisi', () => {
    const a = archiveWith(['2026-08-01', '2026-08-02']);
    expect(Object.keys(A.prune(a, 30, 1)).length).toBe(1);
  });
});

describe('archiveStats', () => {
  it('laskee paivat ja ottelut', () => {
    A.archiveSnapshot({ matches: [match('a', new Date(2026, 7, 24, 18).toISOString()), match('b', new Date(2026, 7, 25, 18).toISOString())] });
    const s = A.archiveStats();
    expect(s.days).toBe(2);
    expect(s.matches).toBe(2);
    expect(s.bytes).toBeGreaterThan(0);
  });

  it('tyhja arkisto raportoi nollat', () => {
    expect(A.archiveStats()).toMatchObject({ days: 0, matches: 0 });
  });
});

describe('rikkinainen tallennus', () => {
  it('viallinen JSON kasitellaan tyhjana arkistona', () => {
    const st = mockStorage();
    st.setItem('bt_odds_archive', '{ rikki');
    vi.stubGlobal('localStorage', st);
    expect(A.readArchive()).toEqual({});
    expect(A.archivedDays()).toEqual([]);
  });
});
