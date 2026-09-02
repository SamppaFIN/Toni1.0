// Liigan Elo kausiennakosta + tuloksista (tiketti #104)

import { describe, it, expect } from 'vitest';
import { toSeasonMatches, calculateLiigaElo, liigaEloMap, LIIGA_HOME_ADVANTAGE } from './liiga-elo.js';
import { priorEloMap, normalizeLiigaName } from './liiga-priors.js';

const REG = 'ENDED_DURING_REGULAR_GAME_TIME';
const SO = 'ENDED_DURING_WINNING_SHOT_COMPETITION';

const peli = (koti: string, vieras: string, kg: number, vg: number, tyyppi = REG, pvm = '2026-09-01T15:30:00Z') => ({
  start: pvm, ended: true, finishedType: tyyppi,
  homeTeam: { teamName: koti, goals: kg },
  awayTeam: { teamName: vieras, goals: vg },
});

describe('toSeasonMatches', () => {
  it('varsinaisella peliajalla ratkennut sailyy sellaisenaan', () => {
    const [m] = toSeasonMatches([peli('Tappara', 'Ilves', 3, 1)]);
    expect(m).toMatchObject({ home: 'Tappara', away: 'Ilves', homeScore: 3, awayScore: 1, outcome: 'home' });
  });

  it('JATKOAJALLA ratkennut on Elon kannalta TASAPELI', () => {
    // 60 minuutissa kumpikaan ei voittanut
    const [m] = toSeasonMatches([peli('Sport', 'Jokerit', 5, 4, SO)]);
    expect(m.outcome).toBe('draw');
    expect(m.homeScore).toBe(4);
    expect(m.awayScore).toBe(4);
  });

  it('pelaamaton ottelu ohitetaan', () => {
    expect(toSeasonMatches([{ ...peli('A', 'B', 1, 0), ended: false }])).toHaveLength(0);
  });

  it('vajaa rivi ei kaada muita', () => {
    const rikki = { ...peli('A', 'B', 1, 0), homeTeam: { teamName: '', goals: 1 } };
    expect(toSeasonMatches([rikki, peli('C', 'D', 2, 1)])).toHaveLength(1);
  });

  it('jarjestetaan paivan mukaan', () => {
    const out = toSeasonMatches([
      peli('A', 'B', 1, 0, REG, '2026-09-05T15:00:00Z'),
      peli('C', 'D', 1, 0, REG, '2026-09-01T15:00:00Z'),
    ]);
    expect(out[0].date).toBe('2026-09-01');
  });
});

describe('calculateLiigaElo', () => {
  it('LAHTOARVOT tulevat kausiennakosta, eivat 1500:sta', () => {
    const { preSeason } = calculateLiigaElo([]);
    expect(preSeason.get(normalizeLiigaName('Tappara'))).toBeGreaterThan(1600);
    expect(preSeason.get(normalizeLiigaName('Jukurit'))).toBeLessThan(1400);
  });

  it('voitto nostaa ja tappio laskee', () => {
    const { ratings } = calculateLiigaElo([peli('SaiPa', 'Tappara', 4, 2)]);
    const lahto = priorEloMap();
    const saipa = ratings.find((r) => normalizeLiigaName(r.team) === normalizeLiigaName('SaiPa'))!;
    const tappara = ratings.find((r) => normalizeLiigaName(r.team) === normalizeLiigaName('Tappara'))!;
    expect(saipa.elo).toBeGreaterThan(lahto.get(normalizeLiigaName('SaiPa'))!.elo);
    expect(tappara.elo).toBeLessThan(lahto.get(normalizeLiigaName('Tappara'))!.elo);
  });

  it('ALTAVASTAAJAN voitto liikuttaa enemman kuin suosikin', () => {
    const yllatys = calculateLiigaElo([peli('Jukurit', 'Tappara', 3, 1)]);
    const odotettu = calculateLiigaElo([peli('Tappara', 'Jukurit', 3, 1)]);
    const jukuritYllatys = yllatys.ratings.find((r) => normalizeLiigaName(r.team) === 'jukurit')!;
    const tapparaOdotettu = odotettu.ratings.find((r) => normalizeLiigaName(r.team) === 'tappara')!;
    expect(Math.abs(jukuritYllatys.change)).toBeGreaterThan(Math.abs(tapparaOdotettu.change));
  });

  it('SUMMA SAILYY — Elo on nollasummainen myos eri lahtoarvoilla', () => {
    const ennen = [...priorEloMap().values()].reduce((s, v) => s + v.elo, 0);
    const { ratings } = calculateLiigaElo([peli('SaiPa', 'Tappara', 4, 2), peli('TPS', 'KooKoo', 4, 2)]);
    const pelanneet = new Set(ratings.map((r) => normalizeLiigaName(r.team)));
    const lahto = priorEloMap();
    const ennenPelanneet = [...pelanneet].reduce((s, k) => s + (lahto.get(k)?.elo ?? 0), 0);
    const jalkeen = ratings.reduce((s, r) => s + r.elo, 0);
    expect(jalkeen).toBeCloseTo(ennenPelanneet, 6);
    expect(ennen).toBeGreaterThan(0);
  });

  it('kotietu on jaakiekossa suurempi kuin jalkapallossa', () => {
    expect(LIIGA_HOME_ADVANTAGE).toBeGreaterThan(55);
  });
});

describe('liigaEloMap', () => {
  it('KAIKKI 17 joukkuetta mukana vaikka vain osa on pelannut', () => {
    const map = liigaEloMap([peli('SaiPa', 'Tappara', 4, 2)]);
    expect(map.size).toBe(17);
  });

  it('pelaamaton joukkue: ennakon arvo, muutos nolla', () => {
    const map = liigaEloMap([peli('SaiPa', 'Tappara', 4, 2)]);
    const jyp = map.get(normalizeLiigaName('JYP'))!;
    expect(jyp.change).toBe(0);
    expect(jyp.elo).toBe(priorEloMap().get(normalizeLiigaName('JYP'))!.elo);
  });

  it('MUUTOS MITATAAN ENNAKOSTA, ei 1500:sta', () => {
    const map = liigaEloMap([peli('SaiPa', 'Tappara', 4, 2)]);
    const saipa = map.get(normalizeLiigaName('SaiPa'))!;
    const lahto = priorEloMap().get(normalizeLiigaName('SaiPa'))!.elo;
    expect(saipa.change).toBe(saipa.elo - lahto);
    expect(saipa.change).toBeGreaterThan(0);
  });

  it('sijaluvut ovat uniikkeja ja kattavat koko sarjan', () => {
    const map = liigaEloMap([peli('SaiPa', 'Tappara', 4, 2)]);
    const sijat = [...map.values()].map((v) => v.rank).sort((a, b) => a - b);
    expect(sijat).toEqual([...Array(17)].map((_, i) => i + 1));
  });

  it('tyhja ottelulista -> pelkat ennakon arvot, kaikki muutokset nollia', () => {
    const map = liigaEloMap([]);
    expect(map.size).toBe(17);
    expect([...map.values()].every((v) => v.change === 0)).toBe(true);
  });
});
