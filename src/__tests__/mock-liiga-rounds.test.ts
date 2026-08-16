import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildLiigaRoundsFile, parseLiigaScheduleText } from '../publish/mock-liiga-rounds.js';

const RAW = readFileSync(path.resolve(process.cwd(), 'demo/liiga-2025-12.txt'), 'utf8');

describe('Liiga-kausisimulaation raakadataparsinta', () => {
  it('parsi ottelut joulukuuhun asti', () => {
    const games = parseLiigaScheduleText(RAW);
    expect(games.length).toBeGreaterThan(150);
    expect(games[0]).toMatchObject({
      date: '2025-09-09',
      home: 'HPK',
      away: 'TPS',
      homeScore: 2,
      awayScore: 3,
      resultType: 'VL',
    });
  });

  it('rakentaa kierrokset, joissa ensimmaisen paivan Elo tulee kauden 2024-25 sijoituksesta', () => {
    // Ei enaa litteaa 1500:aa kaikille — lahto-Elo siemennetaan edellisen
    // kauden runkosarjan lopputaulukosta (Wikipedia, "2024-25 Liiga season").
    // Lukko oli runkosarjan voittaja (112 pistetta), Jukurit viimeinen (49
    // pistetta) — kasin laskettu vertailuarvo molemmille.
    const file = buildLiigaRoundsFile(RAW);
    expect(file.rounds.length).toBeGreaterThan(20);
    expect(file.teams).toHaveLength(16);
    expect(file.rounds[0].games).toHaveLength(6);

    const eloByTeamId = new Map(file.rounds[0].ratings.map((r) => [r.team_id, r.elo]));
    const lukko = file.teams.find((t) => t.name === 'Lukko')!;
    const jukurit = file.teams.find((t) => t.name === 'Jukurit')!;
    const tappara = file.teams.find((t) => t.name === 'Tappara')!;

    expect(eloByTeamId.get(lukko.id)).toBe(1632);
    expect(eloByTeamId.get(jukurit.id)).toBe(1254);
    // Tapparan pistemaara (90) on tasan taulukon keskiarvo — lahtee siis
    // 1500:sta, ei sattumalta vaan kaavan takia
    expect(eloByTeamId.get(tappara.id)).toBe(1500);

    // Ei enaa kaikki samat — juuri tama oli ongelma jota korjattiin
    expect(new Set(file.rounds[0].ratings.map((r) => r.elo)).size).toBeGreaterThan(1);
  });

  it('toisen kierroksen Eloissa nakyy oikeiden otteluiden vaikutus', () => {
    const file = buildLiigaRoundsFile(RAW);
    const hpk = file.rounds[1].ratings.find((rating) => rating.team_id === 9);
    const tps = file.rounds[1].ratings.find((rating) => rating.team_id === 5);
    expect(hpk?.elo).not.toBe(1500);
    expect(tps?.elo).not.toBe(1500);
  });

  it('ratings sisaltavat historialliset kertymat dynaamisia paivityksia varten', () => {
    const file = buildLiigaRoundsFile(RAW);
    const hpk = file.rounds[1].ratings.find((rating) => rating.team_id === 9);
    const tps = file.rounds[1].ratings.find((rating) => rating.team_id === 5);
    expect(hpk?.played).toBe(1);
    expect(hpk?.ot_losses).toBe(1);
    expect(hpk?.goals_for).toBe(2);
    expect(hpk?.goals_against).toBe(3);
    expect(tps?.played).toBe(1);
    expect((tps?.wins ?? 0) + (tps?.ot_wins ?? 0)).toBe(1);
  });
});
