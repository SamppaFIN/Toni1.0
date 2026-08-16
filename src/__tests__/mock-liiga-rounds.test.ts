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

  it('rakentaa kierrokset, joissa ensimmaisen paivan Elo on 1500', () => {
    const file = buildLiigaRoundsFile(RAW);
    expect(file.rounds.length).toBeGreaterThan(20);
    expect(file.teams).toHaveLength(16);
    expect(file.rounds[0].games).toHaveLength(6);
    expect(file.rounds[0].ratings.every((rating) => rating.elo === 1500)).toBe(true);
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
