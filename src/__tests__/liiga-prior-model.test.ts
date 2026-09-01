// Tiketti #96 jatko: kausiennakon Elo/sijalista TOSIASSA ohjaa mallia kun
// pelattuja otteluita ei ole. Aiemmin Liiga putosi market-only-tilaan (w=0) ja
// esiasetetut arvot jäivät vain Elo-sarakkeen näytöksi.

import { describe, it, expect } from 'vitest';
import { priorModelFields } from '../publish/live-snapshot.js';
import { priorEloMap } from '../analyze/liiga-priors.js';
import type { FootballOddsEvent } from '../ingest/odds-football.js';

const ev = (home: string, away: string): FootballOddsEvent => ({
  eventId: `${home}-${away}`,
  sportKey: 'icehockey_liiga',
  league: 'Liiga',
  kickoff: '2026-09-01T15:30:00Z',
  home: { name: home, short: home.slice(0, 3).toUpperCase(), color: '#000' },
  away: { name: away, short: away.slice(0, 3).toUpperCase(), color: '#000' },
  odds: [],
  totals: [],
});

const elo = priorEloMap();

describe('priorModelFields — kausiennakko ohjaa mallia otteluitta', () => {
  it('kärkijoukkue kotona on selvä suosikki heikointa vastaan', () => {
    const f = priorModelFields(ev('Tappara', 'Jukurit'), elo)!;
    expect(f).not.toBeNull();
    expect(f.poisson.probs.home).toBeGreaterThan(f.poisson.probs.away);
    expect(f.poisson.probs.home).toBeGreaterThan(0.5);
  });

  it('lähtö-Elo tulee kortille kun otteluita ei ole', () => {
    const f = priorModelFields(ev('Kärpät', 'Ässät'), elo)!;
    expect(f.stats.home.elo).toBe(1560);
    expect(f.stats.away.elo).toBe(1470);
    expect(f.stats.home.played).toBe(0);
  });

  it('ennakon vahvuudet ja heikkoudet ovat mallin perusteluissa', () => {
    const f = priorModelFields(ev('KooKoo', 'HPK'), elo)!;
    const text = f.adjustments.map((a) => a.reason).join(' ');
    expect(text).toMatch(/Randelin/); // KooKoon vahvuus
    expect(text).toMatch(/floppaaminen/); // HPK:n heikkous
  });

  it('blend-paino on matala — ennakko on lähtöarvo, ei mittaus', () => {
    const f = priorModelFields(ev('Tappara', 'Ilves'), elo)!;
    expect(f.blendWeight).toBeGreaterThan(0);
    expect(f.blendWeight).toBeLessThan(0.25);
  });

  it('tuntematon sarja -> null (ei kajota muihin lajeihin)', () => {
    expect(priorModelFields({ ...ev('X', 'Y'), sportKey: 'soccer_epl' }, elo)).toBeNull();
  });
});
