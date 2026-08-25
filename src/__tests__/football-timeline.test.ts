// Tiketti #79: Aikajanan puhdas logiikka
//
// Renderointi ja raahaus todennetaan Playwrightilla; tassa vain se osa joka
// on puhdasta laskentaa. Tarkein: nearestDay ei saa koskaan palauttaa paivaa
// jota ei ole kalenterissa, koska kutsuja suodattaa ottelut sen perusteella
// ja saisi tyhjan listan ilman selitysta.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import { nearestDay, dayLabel, todayKey } from '../../public/app/football-timeline.js';

const days = (...dates: string[]) => dates.map((date) => ({ date, matches: 1, with_odds: 0, leagues: [] }));

describe('nearestDay', () => {
  it('tama paiva voittaa kun sina pelataan', () => {
    expect(nearestDay(days('2026-08-24', '2026-08-25', '2026-08-27'), '2026-08-25')).toBe('2026-08-25');
  });

  it('ilman tamanpaivaisia otetaan SEURAAVA ottelupaiva', () => {
    expect(nearestDay(days('2026-08-24', '2026-08-27'), '2026-08-25')).toBe('2026-08-27');
  });

  it('kun kaikki ovat menneisyydessa otetaan VIIMEISIN', () => {
    // Mennyt kierros on parempi kuin tyhja ruutu
    expect(nearestDay(days('2026-08-20', '2026-08-22'), '2026-08-25')).toBe('2026-08-22');
  });

  it('tyhja kalenteri -> null', () => {
    expect(nearestDay([], '2026-08-25')).toBeNull();
    expect(nearestDay(null, '2026-08-25')).toBeNull();
  });

  it('palauttaa AINA paivan joka on kalenterissa', () => {
    const list = days('2026-08-20', '2026-08-27', '2026-09-02');
    for (const today of ['2026-08-01', '2026-08-25', '2026-09-15']) {
      const pick = nearestDay(list, today);
      expect(list.map((d) => d.date)).toContain(pick);
    }
  });
});

describe('dayLabel', () => {
  it('tanaan, huomenna ja eilen saavat nimen', () => {
    expect(dayLabel('2026-08-25', '2026-08-25')).toBe('Tänään');
    expect(dayLabel('2026-08-26', '2026-08-25')).toBe('Huomenna');
    expect(dayLabel('2026-08-24', '2026-08-25')).toBe('Eilen');
  });

  it('muut paivat saavat viikonpaivan ja paivamaaran', () => {
    // 2026-08-29 on lauantai
    expect(dayLabel('2026-08-29', '2026-08-25')).toBe('la 29.8.');
  });

  it('kuukauden vaihde ei riko muotoilua', () => {
    expect(dayLabel('2026-09-01', '2026-08-25')).toMatch(/^\w{2} 1\.9\.$/);
  });

  it('kaukainen paiva ei saa Huomenna-nimea', () => {
    expect(dayLabel('2026-09-26', '2026-08-25')).not.toBe('Huomenna');
  });
});

describe('todayKey', () => {
  it('muotoilee paikallisen paivan ISO-muotoon', () => {
    expect(todayKey(new Date(2026, 7, 5))).toBe('2026-08-05');
  });

  it('tayttaa nollat yksinumeroisiin', () => {
    expect(todayKey(new Date(2026, 0, 9))).toBe('2026-01-09');
  });
});

// Tiketti #82: nuolinavigointi
//
// Tarkein saanto: nuoli hyppaa OTTELUPAIVAAN eika kalenteripaivaan. Sokea
// +1 vrk veisi tyhjalle paivalle, ja tyhja paiva nayttaa virheelta vaikka
// kyse on siita ettei silloin pelata.

// @ts-expect-error — selainmoduuli ilman tyyppejä
import { stepDay, shiftDay } from '../../public/app/football-timeline.js';

describe('shiftDay', () => {
  it('siirtaa eteen ja taakse', () => {
    expect(shiftDay('2026-08-25', 1)).toBe('2026-08-26');
    expect(shiftDay('2026-08-25', -1)).toBe('2026-08-24');
  });

  it('kuukauden vaihde toimii', () => {
    expect(shiftDay('2026-08-31', 1)).toBe('2026-09-01');
    expect(shiftDay('2026-09-01', -1)).toBe('2026-08-31');
  });

  it('vuoden vaihde toimii', () => {
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('karkauspaiva', () => {
    expect(shiftDay('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('kelvoton paiva palautuu sellaisenaan', () => {
    expect(shiftDay('rikki', 1)).toBe('rikki');
  });
});

describe('stepDay — hyppaa ottelupaiviin', () => {
  const days = (...dates: string[]) => dates.map((date) => ({ date, matches: 1, with_odds: 0, leagues: [] }));

  it('OHITTAA tyhjan paivan eteenpain', () => {
    // 26.8. ei ole kalenterissa -> hyppy 27.8:aan
    expect(stepDay('2026-08-25', 1, days('2026-08-25', '2026-08-27'))).toBe('2026-08-27');
  });

  it('OHITTAA tyhjan paivan taaksepain', () => {
    expect(stepDay('2026-08-27', -1, days('2026-08-24', '2026-08-27'))).toBe('2026-08-24');
  });

  it('viimeisesta eteenpain -> null (nuoli himmenee)', () => {
    expect(stepDay('2026-08-27', 1, days('2026-08-25', '2026-08-27'))).toBeNull();
  });

  it('ensimmaisesta taaksepain -> null', () => {
    expect(stepDay('2026-08-25', -1, days('2026-08-25', '2026-08-27'))).toBeNull();
  });

  it('valittu paiva EI ole kalenterissa: eteenpain loytyy seuraava', () => {
    expect(stepDay('2026-08-26', 1, days('2026-08-25', '2026-08-27'))).toBe('2026-08-27');
  });

  it('valittu paiva EI ole kalenterissa: taaksepain loytyy edellinen', () => {
    expect(stepDay('2026-08-26', -1, days('2026-08-25', '2026-08-27'))).toBe('2026-08-25');
  });

  it('ILMAN KALENTERIA askeltaa vuorokauden — muuta tietoa ei ole', () => {
    expect(stepDay('2026-08-25', 1, null)).toBe('2026-08-26');
    expect(stepDay('2026-08-25', -1, [])).toBe('2026-08-24');
  });

  it('yhden paivan kalenterissa molemmat nuolet himmenevat', () => {
    expect(stepDay('2026-08-25', 1, days('2026-08-25'))).toBeNull();
    expect(stepDay('2026-08-25', -1, days('2026-08-25'))).toBeNull();
  });
});
