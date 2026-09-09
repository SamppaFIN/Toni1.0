// Liigan Elon lahdemerkinta kertoo kumpi kahdesta lahteesta on kasilla
//
// Elo syntyy perakkain kahdesta: kausiennakko antaa lahtoarvon (#103) ja
// pelatut ottelut siirtavat sita (#104). Putki merkitsi sen AINA
// "lahto-Eloksi", vaikka tuloksia oli jo luettu — eli lahdelista vaitti
// ettei yhtaan ottelua ole vaikuttanut lukuun. Sama virhelaji kuin tiketissa
// #103 korjattu ESPN-merkinta: vaara lahde on pahempi kuin puuttuva, koska
// koko listan tarkoitus on etta luvun voi jaljittaa.

import { describe, it, expect } from 'vitest';
import { liigaEloProvider, EloLookup } from '../publish/live-snapshot.js';
import { previewSource } from '../analyze/liiga-priors.js';

function eloMap(changes: number[]): EloLookup {
  const map: EloLookup = new Map();
  changes.forEach((change, i) => map.set(`joukkue-${i}`, { elo: 1500 + change, change, rank: i + 1 }));
  return map;
}

describe('liigaEloProvider', () => {
  it('sanoo "lahto-Elo" kun yksikaan ottelu ei ole viela siirtanyt lukua', () => {
    expect(liigaEloProvider(eloMap([0, 0, 0]))).toBe(`${previewSource().name} (lahto-Elo)`);
  });

  it('nimeaa toteutuneet tulokset heti kun jokin luku on liikkunut', () => {
    expect(liigaEloProvider(eloMap([0, 0, 12]))).toBe(`${previewSource().name} + toteutuneet tulokset (Elo)`);
  });

  it('lasketaan mukaan myos negatiivinen muutos', () => {
    expect(liigaEloProvider(eloMap([0, -8]))).toBe(`${previewSource().name} + toteutuneet tulokset (Elo)`);
  });

  it('tyhja kartta on lahtoarvo eika tuloksia — ei vaiteta mittausta ilman dataa', () => {
    expect(liigaEloProvider(eloMap([]))).toBe(`${previewSource().name} (lahto-Elo)`);
  });

  it('merkinta nimeaa aina ennakon lahteen, jotta luku on jaljitettavissa', () => {
    for (const changes of [[0], [5]]) {
      expect(liigaEloProvider(eloMap(changes))).toContain(previewSource().name);
    }
  });
});
