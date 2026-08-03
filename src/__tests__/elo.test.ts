import { describe, it, expect } from 'vitest';
import { updateElo, updateBothElos, expectedScore } from '../analyze/elo.js';

describe('Elo-rating', () => {
  it('tasavahvat joukkueet: molempien odotusarvo on 0.5', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 1);
  });

  it('100 pisteen ero: vahvemman odotusarvo ~0.64', () => {
    const e = expectedScore(1600, 1500);
    expect(e).toBeGreaterThan(0.63);
    expect(e).toBeLessThan(0.65);
  });

  it('päivittää Eloa oikein kotivoitosta tasavahvoja vastaan', () => {
    const updated = updateElo(1500, 1500, 1);
    expect(updated).toBeCloseTo(1516, 0); // K=32, S=1, E=0.5 → +16
  });

  it('päivittää Eloa oikein tasapelistä', () => {
    const updated = updateElo(1500, 1500, 0.5);
    expect(updated).toBeCloseTo(1500, 0); // K=32, S=0.5, E=0.5 → +0
  });

  it('päivittää Eloa oikein häviöstä', () => {
    const updated = updateElo(1500, 1500, 0);
    expect(updated).toBeCloseTo(1484, 0); // K=32, S=0, E=0.5 → -16
  });

  it('altavastaajan yllätysvoitto tuottaa suuren muutoksen', () => {
    const { newHomeElo, newAwayElo } = updateBothElos(1700, 1300, 1, 4);
    // Altavastaaja voitti → iso pudotus suosikille, iso nousu altavastaajalle
    expect(newHomeElo).toBeLessThan(1690);
    expect(newAwayElo).toBeGreaterThan(1310);
  });

  it('updateBothElos palauttaa symmetriset tulokset', () => {
    const { newHomeElo, newAwayElo } = updateBothElos(1500, 1500, 3, 1);
    expect(newHomeElo + newAwayElo).toBeCloseTo(3000, 0); // kokonaissumma säilyy
    expect(newHomeElo).toBeGreaterThan(1500);
    expect(newAwayElo).toBeLessThan(1500);
  });
});
