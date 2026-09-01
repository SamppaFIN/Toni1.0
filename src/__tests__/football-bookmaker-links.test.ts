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

// Tiketti #98: linkin pitaa vieda oikean LAJIN sivulle
//
// BUGI: kartta oli yksilajinen ajalta jolloin putki oli, ja jaakiekko
// lisattiin sen ymparilta huomaamatta. Jaakiekkokortilta linkki vei
// toimiston jalkapallosivulle.
describe('Lajitietoiset toimistolinkit (tiketti #98)', () => {
  const rivi = (key: string) => ({ bookmaker: 'X', key, link: null });

  it('jaakiekkokortilta EI viedä jalkapallosivulle', () => {
    const url = bookmakerUrl(rivi('coolbet'), 'hockey');
    expect(url).toBeTruthy();
    expect(url).not.toContain('football');
    expect(url).toContain('hockey');
  });

  it('jalkapallokortti toimii kuten ennen', () => {
    expect(bookmakerUrl(rivi('coolbet'), 'football')).toContain('football');
  });

  it('oletus on jalkapallo — vanhat kutsupaikat eivat riko', () => {
    expect(bookmakerUrl(rivi('coolbet'))).toContain('football');
  });

  it('RIVIKOHTAINEN syvalinkki voittaa lajikartan', () => {
    const deep = { bookmaker: 'X', key: 'coolbet', link: 'https://esimerkki.fi/ottelu/1' };
    expect(bookmakerUrl(deep, 'hockey')).toBe('https://esimerkki.fi/ottelu/1');
  });

  it('tuntematon toimisto -> null molemmilla lajeilla', () => {
    expect(bookmakerUrl(rivi('tuntematon'), 'hockey')).toBeNull();
    expect(bookmakerUrl(rivi('tuntematon'), 'football')).toBeNull();
  });

  it('KAIKILLA tunnetuilla toimistoilla on molemmat lajit', () => {
    const kirjat = ['pinnacle', 'onexbet', 'coolbet', 'nordicbet', 'betsson', 'unibet_se', 'matchbook'];
    for (const k of kirjat) {
      expect(bookmakerUrl(rivi(k), 'football'), k).toBeTruthy();
      expect(bookmakerUrl(rivi(k), 'hockey'), k).toBeTruthy();
    }
  });
});
