// Tiketti #47: Toimiston nimi linkkinä
//
// Lukittavat asiat:
//  1. Jokaiselle snapshotissa esiintyvälle toimistolle löytyy osoite — muuten
//     linkki puuttuisi hiljaa juuri siltä toimistolta jolta veto lyötäisiin.
//  2. Rivikohtainen `link` voittaa kartan, jotta maksullisen paketin
//     syvälinkit toimivat ilman koodimuutosta.
//  3. Vain https hyväksytään: javascript:-URL kortilla olisi XSS-vektori,
//     koska kertoimet tulevat ulkoisesta rajapinnasta.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import { bookmakerUrl } from '../../public/app/football-cards.js';
import snapshot from '../../public/data/today.json' with { type: 'json' };

describe('bookmakerUrl', () => {
  it('tuntee kaikki snapshotissa oikeasti esiintyvät toimistot', () => {
    const keys = new Set<string>();
    for (const m of (snapshot as any).matches) {
      for (const o of m.odds) keys.add(o.key);
    }
    expect(keys.size).toBeGreaterThan(0);

    const missing = [...keys].filter((key) => !bookmakerUrl({ key }));
    expect(missing, `osoite puuttuu toimistoilta: ${missing.join(', ')}`).toEqual([]);
  });

  it('palauttaa https-osoitteen', () => {
    expect(bookmakerUrl({ key: 'pinnacle' })).toMatch(/^https:\/\//);
  });

  it('rivikohtainen link voittaa kartan (maksullisen paketin syvälinkki)', () => {
    const deep = 'https://www.pinnacle.com/en/soccer/england-premier-league/arsenal-vs-chelsea/1600123456';
    expect(bookmakerUrl({ key: 'pinnacle', link: deep })).toBe(deep);
  });

  it('hylkää muun kuin https-linkin ja putoaa karttaan', () => {
    expect(bookmakerUrl({ key: 'pinnacle', link: 'javascript:alert(1)' })).toMatch(/^https:\/\/www\.pinnacle\.com/);
    expect(bookmakerUrl({ key: 'pinnacle', link: 'http://insecure.example' })).toMatch(/^https:\/\/www\.pinnacle\.com/);
  });

  it('tuntematon toimisto palauttaa null eikä kaadu', () => {
    expect(bookmakerUrl({ key: 'ei-olemassa' })).toBeNull();
    expect(bookmakerUrl({})).toBeNull();
    expect(bookmakerUrl(null)).toBeNull();
  });
});
