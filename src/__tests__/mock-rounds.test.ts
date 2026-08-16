import { describe, it, expect } from 'vitest';
import { buildMockRounds } from '../publish/mock-rounds.js';
import { validateSnapshot } from '../publish/snapshot.js';
import { SeasonMatch } from '../ingest/results-veikkausliiga.js';

const MATCHES: SeasonMatch[] = [
  // kierros 1
  { date: '2025-04-01', home: 'KuPS Kuopio', away: 'FC Inter Turku', homeScore: 2, awayScore: 0, outcome: 'home' },
  { date: '2025-04-01', home: 'HJK Helsinki', away: 'IFK Mariehamn', homeScore: 1, awayScore: 0, outcome: 'home' },
  { date: '2025-04-01', home: 'Ilves Tampere', away: 'FC Lahti', homeScore: 1, awayScore: 1, outcome: 'draw' },
  { date: '2025-04-01', home: 'SJK Seinäjoki', away: 'VPS Vaasa', homeScore: 0, awayScore: 1, outcome: 'away' },

  // kierros 2
  { date: '2025-04-08', home: 'KuPS Kuopio', away: 'HJK Helsinki', homeScore: 2, awayScore: 1, outcome: 'home' },
  { date: '2025-04-08', home: 'FC Inter Turku', away: 'IFK Mariehamn', homeScore: 3, awayScore: 0, outcome: 'home' },
  { date: '2025-04-08', home: 'FC Lahti', away: 'SJK Seinäjoki', homeScore: 2, awayScore: 2, outcome: 'draw' },
  { date: '2025-04-08', home: 'VPS Vaasa', away: 'Ilves Tampere', homeScore: 0, awayScore: 1, outcome: 'away' },

  // kierros 3
  { date: '2025-04-15', home: 'KuPS Kuopio', away: 'IFK Mariehamn', homeScore: 4, awayScore: 1, outcome: 'home' },
  { date: '2025-04-15', home: 'HJK Helsinki', away: 'FC Inter Turku', homeScore: 1, awayScore: 2, outcome: 'away' },
  { date: '2025-04-15', home: 'SJK Seinäjoki', away: 'Ilves Tampere', homeScore: 1, awayScore: 3, outcome: 'away' },
  { date: '2025-04-15', home: 'VPS Vaasa', away: 'FC Lahti', homeScore: 2, awayScore: 0, outcome: 'home' },
];

const file = buildMockRounds(MATCHES, new Date('2026-08-16T00:00:00.000Z'));

describe('Harjoituskierrosten rakenne', () => {
  it('tuottaa koko historiakauden kierrokset', () => {
    expect(file.rounds).toHaveLength(3);
    expect(file.season).toBe('2025');
  });

  it('jokainen kierros on validi snapshot', () => {
    for (const [i, round] of file.rounds.entries()) {
      expect(validateSnapshot(round), `kierros ${i + 1}`).toEqual([]);
    }
  });

  it('jokaisella kierroksella on neljä ottelua testidatassa', () => {
    for (const round of file.rounds) expect(round.matches).toHaveLength(4);
  });

  it('jokainen joukkue pelaa täsmälleen kerran per kierros', () => {
    for (const [i, round] of file.rounds.entries()) {
      const playing = round.matches.flatMap((m) => [m.home.name, m.away.name]);
      expect(new Set(playing).size, `kierros ${i + 1}`).toBe(8);
    }
  });

  it('joukkue ei pelaa itseään vastaan', () => {
    for (const round of file.rounds) {
      for (const m of round.matches) expect(m.home.name).not.toBe(m.away.name);
    }
  });

  it('on merkitty harjoitusdataksi jotta UI varoittaa', () => {
    for (const round of file.rounds) {
      expect(round.source).toBe('mock');
      expect(round.providers.join(' ')).toContain('kierroskohtaisista Elo-luvuista');
    }
  });

  it('kierrokset ovat aikajärjestyksessä viikon välein', () => {
    for (let i = 1; i < file.rounds.length; i++) {
      const prev = Date.parse(file.rounds[i - 1].generated_at);
      const cur = Date.parse(file.rounds[i].generated_at);
      expect(cur - prev).toBe(7 * 86400_000);
    }
  });
});

describe('Kertoimet johdettu Elo-luvuista', () => {
  it('vahva joukkue on suosikki kolmannen kierroksen alku-Eloilla', () => {
    const match = file.rounds[2].matches.find((m) => m.home.name === 'KuPS Kuopio' && m.away.name === 'IFK Mariehamn');
    expect(match).toBeDefined();
    expect(match!.best.home).toBeLessThan(match!.best.away);
  });

  it('kertoimet ovat realistisella jalkapallovälillä', () => {
    for (const round of file.rounds) {
      for (const m of round.matches) {
        for (const side of ['home', 'draw', 'away'] as const) {
          expect(m.best[side]).toBeGreaterThan(1.0);
          expect(m.best[side]).toBeLessThan(25);
        }
      }
    }
  });

  it('markkinan kate pysyy maltillisena vaikka varianssi tekee hetkellisia ylilyonteja', () => {
    for (const round of file.rounds) {
      for (const m of round.matches) {
        expect(m.market.margin).toBeGreaterThan(-0.05);
        expect(m.market.margin).toBeLessThan(0.12);
      }
    }
  });

  it('kertoimia on usealta toimistolta ja pörssin komissio on merkitty', () => {
    const m = file.rounds[0].matches[0];
    expect(m.odds.length).toBeGreaterThanOrEqual(5);
    const exchange = m.odds.find((o) => o.key.startsWith('betfair'));
    expect(exchange?.commission).toBe(0.05);
  });

  it('mallin peruste kertoo Elo-luvut ja historiatuloksen läpinäkyvästi', () => {
    const m = file.rounds[0].matches[0];
    expect(m.model.adjustments[0].reason).toContain('Elo');
    expect(m.model.adjustments[1].reason).toContain('Historiatulos');
  });

  it('malli on market-only — harjoitusdata ei väitä Poisson-mallia', () => {
    for (const round of file.rounds) {
      for (const m of round.matches) {
        expect(m.model.method).toBe('market-only');
        expect(m.model.poisson_probs).toBeNull();
      }
    }
  });
});

describe('Kierroskohtainen uudelleenlaskenta', () => {
  it('ensimmaisen kierroksen kaikki Elo-luvut alkavat 1500:sta', () => {
    for (const m of file.rounds[0].matches) {
      expect(m.stats?.home.elo).toBe(1500);
      expect(m.stats?.away.elo).toBe(1500);
    }
  });

  it('toisen kierroksen Eloissa nakyy ensimmaisen kierroksen vaikutus', () => {
    const kuPSMatch = file.rounds[1].matches.find((m) => m.home.name === 'KuPS Kuopio');
    const ifkMatch = file.rounds[1].matches.find((m) => m.away.name === 'IFK Mariehamn');
    expect(kuPSMatch?.stats?.home.elo).toBeGreaterThan(1500);
    expect(ifkMatch?.stats?.away.elo).toBeLessThan(1500);
  });
});

describe('Hyvat ja huonot vetokohteet', () => {
  it('datassa on seka positiivisia etta negatiivisia edgeja', () => {
    const edges = file.rounds.flatMap((r) => r.matches).flatMap((m) => m.analysis.edges.map((e) => e.edge));
    expect(edges.some((e) => e > 0.03)).toBe(true);
    expect(edges.some((e) => e < 0)).toBe(true);
  });
});

describe('Deterministisyys', () => {
  it('sama syöte tuottaa saman tuloksen — diffit pysyvät luettavina', () => {
    const again = buildMockRounds(MATCHES, new Date('2026-08-16T00:00:00.000Z'));
    expect(JSON.stringify(again)).toBe(JSON.stringify(file));
  });

  it('kaikki otteluparit ovat eri pareja testikaudella', () => {
    const pairs = file.rounds.flatMap((r) =>
      r.matches.map((m) => [m.home.name, m.away.name].sort().join(' vs '))
    );
    expect(pairs).toHaveLength(12);
    expect(new Set(pairs).size).toBe(12);
  });
});
