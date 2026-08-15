import { describe, it, expect } from 'vitest';
import { buildMockRounds, ROUNDS } from '../publish/mock-rounds.js';
import { validateSnapshot } from '../publish/snapshot.js';
import { EloRating } from '../analyze/season-elo.js';

/** Kauden 2026 oikeat Elo-luvut (laskettu 115 ottelusta) */
const RATINGS: EloRating[] = [
  { team: 'KuPS Kuopio', elo: 1604, played: 19, won: 11, drawn: 7, lost: 1, goalsFor: 34, goalsAgainst: 17, change: 104 },
  { team: 'FC Inter Turku', elo: 1562, played: 19, won: 9, drawn: 8, lost: 2, goalsFor: 25, goalsAgainst: 14, change: 62 },
  { team: 'IF Gnistan', elo: 1529, played: 19, won: 8, drawn: 5, lost: 6, goalsFor: 29, goalsAgainst: 24, change: 29 },
  { team: 'HJK Helsinki', elo: 1525, played: 19, won: 9, drawn: 4, lost: 6, goalsFor: 29, goalsAgainst: 23, change: 25 },
  { team: 'FC Lahti', elo: 1517, played: 19, won: 7, drawn: 5, lost: 7, goalsFor: 22, goalsAgainst: 16, change: 17 },
  { team: 'VPS Vaasa', elo: 1517, played: 20, won: 8, drawn: 6, lost: 6, goalsFor: 28, goalsAgainst: 21, change: 17 },
  { team: 'TPS Turku', elo: 1516, played: 20, won: 8, drawn: 5, lost: 7, goalsFor: 27, goalsAgainst: 22, change: 16 },
  { team: 'Ilves Tampere', elo: 1498, played: 19, won: 7, drawn: 4, lost: 8, goalsFor: 31, goalsAgainst: 31, change: -2 },
  { team: 'AC Oulu', elo: 1496, played: 19, won: 9, drawn: 3, lost: 7, goalsFor: 22, goalsAgainst: 22, change: -4 },
  { team: 'SJK Seinäjoki', elo: 1468, played: 19, won: 4, drawn: 6, lost: 9, goalsFor: 24, goalsAgainst: 29, change: -32 },
  { team: 'Jaro', elo: 1419, played: 19, won: 3, drawn: 6, lost: 10, goalsFor: 18, goalsAgainst: 38, change: -81 },
  { team: 'IFK Mariehamn', elo: 1349, played: 19, won: 0, drawn: 5, lost: 14, goalsFor: 9, goalsAgainst: 41, change: -151 },
];

const file = buildMockRounds(RATINGS);

describe('Harjoituskierrosten rakenne', () => {
  it('tuottaa pyydetyt viisi kierrosta', () => {
    expect(file.rounds).toHaveLength(ROUNDS);
    expect(ROUNDS).toBe(5);
  });

  it('jokainen kierros on validi snapshot', () => {
    for (const [i, round] of file.rounds.entries()) {
      expect(validateSnapshot(round), `kierros ${i + 1}`).toEqual([]);
    }
  });

  it('jokaisella kierroksella on kuusi ottelua (12 joukkuetta)', () => {
    for (const round of file.rounds) expect(round.matches).toHaveLength(6);
  });

  it('jokainen joukkue pelaa täsmälleen kerran per kierros', () => {
    for (const [i, round] of file.rounds.entries()) {
      const playing = round.matches.flatMap((m) => [m.home.name, m.away.name]);
      expect(new Set(playing).size, `kierros ${i + 1}`).toBe(12);
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
      expect(round.providers.join(' ')).toContain('Elo');
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
  it('vahvempi joukkue on suosikki', () => {
    // KuPS (1604) vs IFK Mariehamn (1349) — löydä ottelu jossa nämä kohtaavat
    const match = file.rounds
      .flatMap((r) => r.matches)
      .find(
        (m) =>
          (m.home.name === 'KuPS Kuopio' && m.away.name === 'IFK Mariehamn') ||
          (m.home.name === 'IFK Mariehamn' && m.away.name === 'KuPS Kuopio')
      );
    expect(match).toBeDefined();
    const kupsIsHome = match!.home.name === 'KuPS Kuopio';
    const kupsOdds = kupsIsHome ? match!.best.home : match!.best.away;
    const ifkOdds = kupsIsHome ? match!.best.away : match!.best.home;
    expect(kupsOdds).toBeLessThan(ifkOdds);
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

  it('markkinan kate on positiivinen ja maltillinen', () => {
    for (const round of file.rounds) {
      for (const m of round.matches) {
        expect(m.market.margin).toBeGreaterThan(0);
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

  it('mallin peruste kertoo Elo-luvut läpinäkyvästi', () => {
    const m = file.rounds[0].matches[0];
    expect(m.model.adjustments[0].reason).toContain('Elo');
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

describe('Deterministisyys', () => {
  it('sama syöte tuottaa saman tuloksen — diffit pysyvät luettavina', () => {
    const again = buildMockRounds(RATINGS);
    expect(JSON.stringify(again)).toBe(JSON.stringify(file));
  });

  it('kaikki 30 ottelua ovat eri pareja', () => {
    const pairs = file.rounds.flatMap((r) =>
      r.matches.map((m) => [m.home.name, m.away.name].sort().join(' vs '))
    );
    expect(pairs).toHaveLength(30);
    expect(new Set(pairs).size).toBe(30);
  });
});
