// Sarjakohtainen virheensieto (tiketti #101)
//
// TOSITAPAUS: cron haki seitseman sarjan kertoimet onnistuneesti, kahdeksas
// (Liiga) palautti verkkotason virheen "fetch failed", ja KOKO SNAPSHOT jai
// julkaisematta. Krediitit oli jo kaytetty, data oli jo haettu, eika mitaan
// julkaistu.
//
// Testit ajetaan puhtaan logiikan tasolla: verkkokutsu on korvattu, koska
// tarkoitus on lukita KAYTOS eika rajapinta.

import { describe, it, expect } from 'vitest';

/** Sama luokittelu kuin ingestFootballOdds:ssa */
function onVerkkovirhe(viesti: string): boolean {
  return /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND|socket/i.test(viesti);
}

describe('verkkovirheen tunnistus', () => {
  it('Noden fetch failed tunnistetaan verkkovirheeksi', () => {
    expect(onVerkkovirhe('fetch failed')).toBe(true);
  });

  it('yhteyden katkeamiset tunnistetaan', () => {
    for (const v of ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND api.the-odds-api.com', 'socket hang up']) {
      expect(onVerkkovirhe(v), v).toBe(true);
    }
  });

  it('HTTP-virhetta EI pideta verkkovirheena — se ei korjaannu toistamalla', () => {
    for (const v of ['Odds API 404: Not Found', 'Odds API 401: Unauthorized', 'kvootta loppui']) {
      expect(onVerkkovirhe(v), v).toBe(false);
    }
  });
});

/** Simuloi hakusilmukan sietologiikka */
function ajaHaku(
  sarjat: string[],
  haku: (sarja: string, yritys: number) => { ok: true } | { ok: false; viesti: string }
): { onnistui: string[]; epaonnistui: string[]; heitti: string | null } {
  const onnistui: string[] = [];
  const epaonnistui: string[] = [];

  for (const sarja of sarjat) {
    for (let yritys = 1; yritys <= 2; yritys++) {
      const t = haku(sarja, yritys);
      if (t.ok) { onnistui.push(sarja); break; }
      if (onVerkkovirhe(t.viesti) && yritys === 1) continue;
      epaonnistui.push(sarja);
      break;
    }
  }

  const heitti =
    epaonnistui.length === sarjat.length && sarjat.length > 0
      ? `Kertoimien haku epäonnistui kaikille ${sarjat.length} sarjalle`
      : null;
  return { onnistui, epaonnistui, heitti };
}

describe('hakusilmukan sietokyky', () => {
  const sarjat = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'icehockey_liiga'];

  it('TOSITAPAUS: seitseman onnistuu, kahdeksas kaatuu -> seitseman sailyy', () => {
    const out = ajaHaku(sarjat, (s) =>
      s === 'icehockey_liiga' ? { ok: false, viesti: 'fetch failed' } : { ok: true }
    );
    expect(out.onnistui).toHaveLength(7);
    expect(out.epaonnistui).toEqual(['icehockey_liiga']);
    expect(out.heitti).toBeNull();
  });

  it('verkkovirhe yritetaan KERRAN uudelleen ja toinen yritys voi onnistua', () => {
    const out = ajaHaku(['a'], (_s, yritys) =>
      yritys === 1 ? { ok: false, viesti: 'fetch failed' } : { ok: true }
    );
    expect(out.onnistui).toEqual(['a']);
    expect(out.epaonnistui).toEqual([]);
  });

  it('HTTP-virhetta EI yriteta uudelleen — toinen yritys maksaisi krediitin', () => {
    let kutsuja = 0;
    ajaHaku(['a'], () => { kutsuja++; return { ok: false, viesti: 'Odds API 404' }; });
    expect(kutsuja).toBe(1);
  });

  it('verkkovirhe yrittaa tasan kahdesti, ei enempaa', () => {
    let kutsuja = 0;
    ajaHaku(['a'], () => { kutsuja++; return { ok: false, viesti: 'fetch failed' }; });
    expect(kutsuja).toBe(2);
  });

  it('KAIKKIEN kaatuminen heittaa — tyhjaa ei julkaista hiljaa vanhan paalle', () => {
    const out = ajaHaku(sarjat, () => ({ ok: false, viesti: 'Odds API 401' }));
    expect(out.heitti).toBeTruthy();
  });

  it('yhdenkin onnistuminen riittaa julkaisuun', () => {
    const out = ajaHaku(sarjat, (s) => (s === 'a' ? { ok: true } : { ok: false, viesti: 'Odds API 404' }));
    expect(out.heitti).toBeNull();
    expect(out.onnistui).toEqual(['a']);
  });

  it('tyhja sarjalista ei heita', () => {
    expect(ajaHaku([], () => ({ ok: true })).heitti).toBeNull();
  });

  it('usea kaatuva sarja ei estä muita', () => {
    const out = ajaHaku(sarjat, (s) =>
      ['b', 'd', 'icehockey_liiga'].includes(s) ? { ok: false, viesti: 'Odds API 404' } : { ok: true }
    );
    expect(out.onnistui).toHaveLength(5);
    expect(out.epaonnistui).toHaveLength(3);
  });
});
