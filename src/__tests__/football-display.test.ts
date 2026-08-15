// Tiketti #39: Elo kortilla, laskentaerittely ja näyttöasetukset
//
// Selainmoduuleista testataan vain puhdas laskenta. Renderöinti on todennettu
// Playwrightilla (e2e/specs/football-display.spec.ts), koska HTML-merkkijonon
// vertaaminen odotettuun merkkijonoon testaisi muotoilua eikä toimintaa.
//
// Tärkein tämän tiedoston tehtävä on lukita se, että selaimen tarkistuslaskut
// vastaavat palvelimen laskentaa. Jos joku muuttaa toista muttei toista,
// kortin "laskennan vaiheet" -osio alkaisi näyttää eri lukuja kuin analyysi
// — ja juuri sen osion tarkoitus on olla luotettava tarkistuslasku.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import { eloExpected, devigRow, effectiveOdds, ELO_HOME_ADVANTAGE } from '../../public/app/football-cards.js';
import { expectedScore, HOME_ADVANTAGE } from '../analyze/season-elo.js';
import { effectiveOdds as serverEffectiveOdds } from '../publish/snapshot.js';
import { removeMargin } from '../analyze/margin.js';

describe('Elo-odotusarvo selaimessa', () => {
  it('kotietu on sama vakio kuin palvelimella', () => {
    // Jos nämä eroavat, kortti näyttäisi eri odotusarvon kuin millä
    // harjoituskierrosten kertoimet on generoitu
    expect(ELO_HOME_ADVANTAGE).toBe(HOME_ADVANTAGE);
  });

  it('vastaa palvelimen expectedScorea kun kotietu nollataan', () => {
    for (const [a, b] of [
      [1500, 1500],
      [1604, 1349],
      [1349, 1604],
      [1520, 1480],
    ]) {
      expect(eloExpected(a, b, 0)).toBeCloseTo(expectedScore(a, b), 10);
    }
  });

  it('tasavahvoilla kotietu nostaa odotusarvon yli puolen', () => {
    const e = eloExpected(1500, 1500);
    expect(e).toBeGreaterThan(0.5);
    // 55 Elo-pisteen etu ≈ 58 %
    expect(e).toBeCloseTo(0.579, 2);
  });

  it('on monotoninen Elo-eron suhteen', () => {
    const weak = eloExpected(1400, 1600);
    const even = eloExpected(1500, 1500);
    const strong = eloExpected(1600, 1400);
    expect(weak).toBeLessThan(even);
    expect(even).toBeLessThan(strong);
  });

  it('pysyy välillä 0–1 äärimmäiselläkin erolla', () => {
    expect(eloExpected(3000, 1000)).toBeLessThanOrEqual(1);
    expect(eloExpected(1000, 3000)).toBeGreaterThanOrEqual(0);
  });
});

describe('Devig-tarkistuslasku selaimessa', () => {
  it('antaa saman katteen kuin palvelimen removeMargin', () => {
    const cases: Array<[number, number, number]> = [
      [1.95, 3.7, 4.0],
      [2.25, 3.3, 3.2],
      [1.36, 4.75, 7.9],
    ];
    for (const [h, d, a] of cases) {
      const client = devigRow(h, d, a);
      const server = removeMargin(h, d, a);
      expect(client.margin).toBeCloseTo(server.margin, 10);
      expect(client.probs.home).toBeCloseTo(server.home_prob, 10);
      expect(client.probs.draw).toBeCloseTo(server.draw_prob, 10);
      expect(client.probs.away).toBeCloseTo(server.away_prob, 10);
    }
  });

  it('normalisoidut todennäköisyydet summautuvat ykköseen', () => {
    const { probs } = devigRow(1.95, 3.7, 4.0);
    expect(probs.home + probs.draw + probs.away).toBeCloseTo(1, 12);
  });

  it('kate on positiivinen oikeilla kertoimilla', () => {
    expect(devigRow(1.95, 3.7, 4.0).margin).toBeGreaterThan(0);
  });

  it('reiluilla kertoimilla kate on nolla', () => {
    // 1/2 + 1/4 + 1/4 = 1 → ei katetta
    expect(devigRow(2, 4, 4).margin).toBeCloseTo(0, 12);
  });
});

describe('Tehollinen kerroin selaimessa', () => {
  it('vastaa palvelimen laskentaa', () => {
    for (const [odds, commission] of [
      [9.6, 0.05],
      [2.0, 0.02],
      [3.5, 0],
      [1.5, 0.015],
    ]) {
      expect(effectiveOdds(odds, commission)).toBeCloseTo(serverEffectiveOdds(odds, commission), 12);
    }
  });

  it('ilman komissiota kerroin ei muutu', () => {
    expect(effectiveOdds(4.2)).toBe(4.2);
  });

  it('komissio pienentää kerrointa mutta ei alle ykkösen', () => {
    expect(effectiveOdds(9.6, 0.05)).toBeCloseTo(9.17, 2);
    expect(effectiveOdds(9.6, 1)).toBe(1);
  });
});
