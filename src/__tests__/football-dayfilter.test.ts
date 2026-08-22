// Tiketti #46: Ottelulistan päiväsuodatin
//
// Testataan vain puhdas jaottelu (partitionByDay) — renderöinti todennetaan
// Playwrightilla, kuten muissakin selainmoduuleissa.
//
// Tärkein lukittava asia: JO ALKANUT ottelu ei saa koskaan päätyä listalle,
// ei edes "näytä kaikki" -tilassa. Sen kerroin on vanhentunut eikä siihen voi
// enää lyödä, mutta kortilla se näyttää identtiseltä pelattavan kohteen kanssa
// — juuri se harhautti käyttäjää kun eilinen SJK-ottelu jäi listalle.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import { partitionByDay } from '../../public/app/football-cards.js';

/** Ottelu annettuna paikallisena kellonaikana — testit ovat aikavyöhykkeestä riippumattomia */
function match(id: string, local: Date) {
  return { id, kickoff: local.toISOString() };
}

/** Paikallinen aika sen sijaan että kirjoitettaisiin UTC-merkkijono käsin */
function localTime(y: number, m: number, d: number, h: number, min = 0) {
  return new Date(y, m - 1, d, h, min, 0, 0);
}

describe('partitionByDay', () => {
  const now = localTime(2026, 8, 22, 8, 35);

  it('erottaa alkaneet, tämän päivän ja myöhemmät', () => {
    const matches = [
      match('eilen', localTime(2026, 8, 21, 22, 0)),
      match('aiemmin-tanaan', localTime(2026, 8, 22, 7, 0)),
      match('tanaan-1', localTime(2026, 8, 22, 14, 30)),
      match('tanaan-2', localTime(2026, 8, 22, 19, 30)),
      match('huomenna', localTime(2026, 8, 23, 15, 0)),
    ];
    const { started, todayUpcoming, later } = partitionByDay(matches, now);

    expect(started.map((m: any) => m.id)).toEqual(['eilen', 'aiemmin-tanaan']);
    expect(todayUpcoming.map((m: any) => m.id)).toEqual(['tanaan-1', 'tanaan-2']);
    expect(later.map((m: any) => m.id)).toEqual(['huomenna']);
  });

  it('jo alkanut tämän päivän ottelu menee startediin, ei todayUpcomingiin', () => {
    const matches = [match('juuri-alkanut', localTime(2026, 8, 22, 8, 30))];
    const { started, todayUpcoming } = partitionByDay(matches, now);
    expect(started).toHaveLength(1);
    expect(todayUpcoming).toHaveLength(0);
  });

  it('jokainen ottelu päätyy tasan yhteen ryhmään', () => {
    const matches = [
      match('a', localTime(2026, 8, 21, 20, 0)),
      match('b', localTime(2026, 8, 22, 12, 0)),
      match('c', localTime(2026, 8, 23, 12, 0)),
      match('d', localTime(2026, 8, 24, 12, 0)),
    ];
    const { started, todayUpcoming, later } = partitionByDay(matches, now);
    expect(started.length + todayUpcoming.length + later.length).toBe(matches.length);
  });

  it('tyhjä lista ei kaadu', () => {
    const { started, todayUpcoming, later } = partitionByDay([], now);
    expect([started, todayUpcoming, later].every((x: any) => x.length === 0)).toBe(true);
  });

  it('kelvoton kickoff ei päädy tämän päivän listalle', () => {
    const { todayUpcoming, later } = partitionByDay([{ id: 'rikki', kickoff: 'ei-aika' }], now);
    expect(todayUpcoming).toHaveLength(0);
    expect(later.map((m: any) => m.id)).toEqual(['rikki']);
  });

  it('keskiyön rajatapaus: 23:59 tänään on tänään, 00:01 huomenna ei ole', () => {
    const matches = [
      match('myohain-tanaan', localTime(2026, 8, 22, 23, 59)),
      match('heti-huomenna', localTime(2026, 8, 23, 0, 1)),
    ];
    const { todayUpcoming, later } = partitionByDay(matches, now);
    expect(todayUpcoming.map((m: any) => m.id)).toEqual(['myohain-tanaan']);
    expect(later.map((m: any) => m.id)).toEqual(['heti-huomenna']);
  });
});
