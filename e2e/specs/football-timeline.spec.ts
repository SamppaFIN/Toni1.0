// E2E: Paivanavigointi kolmena elementtina
//
// Viisi nappia (#82) korvattiin kolmella: < | paivamaara | >. Indeksit ovat
// siis 0 = taaksepain, 1 = keskimmainen (paivamaara + paluu tahan paivaan),
// 2 = eteenpain. Testit syottavat oman kalenterin, jotta ne eivat riipu
// siita mita cron on sattunut hakemaan -- sama periaate kuin
// useFixtureSnapshotissa.
//
// Kalenterissa on tarkoituksella AUKKO: eilen, tanaan ja ylihuomenna
// pelataan, huomenna ei. Juuri se aukko testaa nuolten tarkeimman saannon --
// ne hyppaavat OTTELUPAIVIIN eivatka kalenteripaiviin.

import { test, expect, Page } from '@playwright/test';
import { useFootball, useHockey, resetState, useFixtureSnapshot, useLiigaFixture } from '../helpers.js';

function ymd(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function kickoff(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(18, 0, 0, 0);
  return d.toISOString();
}

function calendar() {
  const match = (offset: number, home: string, away: string, hasOdds: boolean, league = 'Valioliiga') => ({
    espn_id: `${home}-${away}`,
    match_id: hasOdds ? `soccer_epl:${ymd(offset)}:${home}-${away}` : null,
    date: ymd(offset),
    kickoff: kickoff(offset),
    sport_key: 'soccer_epl',
    league,
    home,
    away,
    status: offset < 0 ? 'finished' : 'upcoming',
    home_score: offset < 0 ? 2 : null,
    away_score: offset < 0 ? 1 : null,
    has_odds: hasOdds,
  });

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    range: { from: ymd(-1), to: ymd(2) },
    days: [
      { date: ymd(-1), matches: 1, with_odds: 1, leagues: ['Valioliiga'] },
      { date: ymd(0), matches: 2, with_odds: 1, leagues: ['Valioliiga'] },
      // Huomenna (offset 1) puuttuu tarkoituksella
      { date: ymd(2), matches: 3, with_odds: 0, leagues: ['Serie A'] },
    ],
    matches: [
      match(-1, 'Menneet', 'Kotijoukkue', true),
      match(0, 'Tanaan', 'Vastustaja', true),
      match(0, 'Kertoimeton', 'Ottelu', false),
      match(2, 'Ylihuominen', 'Ottelu A', false, 'Serie A'),
      match(2, 'Ylihuominen', 'Ottelu B', false, 'Serie A'),
      match(2, 'Ylihuominen', 'Ottelu C', false, 'Serie A'),
    ],
  };
}

/**
 * Kalenteri jossa on SEKÄ jalkapallo- että jääkiekko-otteluita samalla
 * "tänään"-päivällä (tiketti #105).
 *
 * fixtures.json kattaa kaikki seuratut sarjat, ei vain yhtä lajia. Ilman
 * lajisuodatusta jääkiekkotila laskisi mukaan myös jalkapallo-ottelut (ja
 * päinvastoin) — juuri tämä testaa ettei niin käy.
 */
function mixedCalendar() {
  const base = calendar();
  const hockey = (offset: number, home: string, away: string) => ({
    espn_id: `liiga-${home}-${away}`,
    match_id: null,
    date: ymd(offset),
    kickoff: kickoff(offset),
    sport_key: 'icehockey_liiga',
    league: 'Liiga',
    home,
    away,
    status: offset < 0 ? 'finished' : 'upcoming',
    home_score: offset < 0 ? 3 : null,
    away_score: offset < 0 ? 2 : null,
    has_odds: false,
  });

  return {
    ...base,
    // days-kenttä ei enää ohjaa selainta (#105: se lasketaan matches:sta
    // lajisuodatettuna), mutta pidetään mukana rakenteen validoinnin vuoksi.
    matches: [...base.matches, hockey(0, 'Tappara', 'Ilves')],
  };
}

async function useCalendar(page: Page, body: unknown = calendar()) {
  await page.route('**/data/fixtures.json', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

const nav = (page: Page) => page.locator('.day-nav');
const buttons = (page: Page) => page.locator('.day-nav .day-btn');
const selectedDay = (page: Page) => page.evaluate(() => localStorage.getItem('bt_timeline_day'));

test.describe('Päivänavigointi', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await useCalendar(page);
    // HUOM: bt_timeline_day EI nollata addInitScriptilla. Se ajetaan myos
    // reloadissa, jolloin sailyvyystesti ei voisi menna lapi. Playwright
    // antaa joka testille tuoreen kontekstin, joten localStorage on tyhja.
  });

  test('KOLME elementtia, ei enempaa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await buttons(page).count()).toBe(3);
  });

  test('jarjestys on nuoli, paivamaara, nuoli', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    const labels = await buttons(page).allInnerTexts();
    expect(labels[0]).toContain('\u2039');
    expect(labels[2]).toContain('\u203a');

    // Keskimmainen ei ole nuoli vaan ainoa tietosisalto: paiva ja maara
    expect(labels[1]).toContain('Tänään');
    expect(labels[1]).toMatch(/\d+\.\d+\./);
    expect(labels[1]).toContain('ottelua');
  });

  test('EI SCROLLBARIA — navigointi mahtuu ruudulle', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    const { overflows, barHeight } = await nav(page).evaluate((el) => ({
      overflows: el.scrollWidth > el.clientWidth + 1,
      barHeight: el.offsetHeight - el.clientHeight,
    }));
    expect(overflows).toBe(false);
    expect(barHeight).toBe(0);
  });

  test('vanhaa vieritettavaa nauhaa ei ole enaa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.timeline-strip')).toHaveCount(0);
  });

  test('keskimmainen nappi kertoo paivan JA otteluiden maaran', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    await expect(buttons(page).nth(1)).toContainText('Tänään');
    await expect(buttons(page).nth(1)).toContainText('2 ottelua');
  });

  // Nuolet eivat vie tyhjaan paivaan, mutta sailytetty valinta voi osua
  // sellaiseen. Silloin nakyman on sanottava suoraan ettei pelata -- tyhja
  // lista ilman selitysta nayttaa virheelta.
  test('tyhja paiva sanotaan suoraan eika jateta arvattavaksi', async ({ page }) => {
    await page.addInitScript((day: string) => localStorage.setItem('bt_timeline_day', day), ymd(1));
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await expect(buttons(page).nth(1)).toContainText('Huomenna');
    await expect(buttons(page).nth(1)).toContainText('0 ottelua');
  });

  test('NUOLI HYPPAA OTTELUPAIVAAN, ei kalenteripaivaan', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    // Valittuna tanaan; huomenna ei pelata -> nuolen pitaa vieda ylihuomiseen
    await buttons(page).nth(2).click();
    await expect.poll(() => selectedDay(page)).toBe(ymd(2));
  });

  test('taaksepain-nuoli vie edelliseen ottelupaivaan', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(0).click();
    await expect.poll(() => selectedDay(page)).toBe(ymd(-1));
  });

  test('nuoli HIMMENEE kun ottelupaivia ei ole enaa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(2).click(); // viimeiseen ottelupaivaan
    await expect(buttons(page).nth(2)).toBeDisabled();
  });

  test('keskimmainen on korostettu ja passiivinen kun katsotaan tata paivaa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await expect(buttons(page).nth(1)).toHaveClass(/active/);
    await expect(buttons(page).nth(1)).toBeDisabled();
  });

  // Keskimmainen on ainoa paluureitti tahan paivaan: nuolilla voi kavella
  // kauas, eika pikavalintoja enaa ole.
  test('keskimmainen palauttaa tahan paivaan kun ollaan muualla', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(0).click(); // eiliseen
    await expect.poll(() => selectedDay(page)).toBe(ymd(-1));
    await expect(buttons(page).nth(1)).toBeEnabled();

    await buttons(page).nth(1).click();
    await expect.poll(() => selectedDay(page)).toBe(ymd(0));
  });

  // Koko uudistuksen syy: aiemmin paivamaara nakyi vain silloin kun valinta
  // oli pikavalintojen ulkopuolella. Nyt se on aina luettavissa.
  test('PAIVAMAARA NAKYY AINA -- myos tanaan ja ylihuomenna', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    const dayMonth = (offset: number) => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      return `${d.getDate()}.${d.getMonth() + 1}.`;
    };

    await expect(buttons(page).nth(1)).toContainText(dayMonth(0));

    await buttons(page).nth(2).click(); // ylihuominen
    await expect(buttons(page).nth(1)).toContainText(dayMonth(2), { timeout: 10000 });
  });

  test('valinta sailyy sivun paivityksen yli', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(0).click();
    const selected = await selectedDay(page);
    expect(selected).toBeTruthy();

    await page.reload();
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await selectedDay(page)).toBe(selected);
  });

  test('KERTOIMETON OTTELU NAKYY otteluohjelmana, ei piiloteta', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(2).click(); // ylihuominen: 3 ottelua ilman kertoimia
    await expect(page.locator('#round-games')).toContainText('Otteluohjelma', { timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText('Ylihuominen');
  });

  test('otteluohjelma ryhmittelee sarjoittain', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    await buttons(page).nth(2).click();
    await expect(page.locator('#round-games')).toContainText('Serie A', { timeout: 10000 });
  });

  test('mennyt ottelu nayttaa tuloksen otteluohjelmassa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    await buttons(page).nth(0).click(); // eilinen
    await expect(page.locator('#round-games')).toContainText(/2–1|Menneet/, { timeout: 10000 });
  });

  test('KALENTERIN PUUTTUMINEN ei kaada nakymaa', async ({ page }) => {
    await page.route('**/data/fixtures.json', (route: any) => route.fulfill({ status: 404 }));
    await page.goto('/demo.html');

    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await buttons(page).count()).toBe(3);
    await expect(page.locator('#round-games')).toContainText('Otteluohjelmaa ei saatu');
  });

  test('ilman kalenteria nuolet askeltavat vuorokauden kerrallaan', async ({ page }) => {
    await page.route('**/data/fixtures.json', (route: any) => route.fulfill({ status: 404 }));
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(2).click();
    await expect.poll(() => selectedDay(page)).toBe(ymd(1));
  });

  test('RIKKINAINEN KALENTERI kasitellaan kuten puuttuva', async ({ page }) => {
    await useCalendar(page, { days: 'ei taulukko' });
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await buttons(page).count()).toBe(3);
  });

  // Tiketti #105: navigointi näkyy NYT myös jääkiekkotilassa ja laskee
  // vain SM-liigan pelipäivät — se oli aiemmin piilossa kokonaan, koska
  // jääkiekolla ei ollut omaa otteluohjelmalähdettä (fixtures.ts:n
  // `espn: null` pudotti sarjan kalenterista, ks. src/publish/fixtures.ts).
  test('jaakiekkotilassa navigointi nakyy ja laskee vain jaakiekkopaivat', async ({ page }) => {
    // useLiigaFixture asettaa bt_sport='both' (nayttaakseen kortin
    // molemmissa tiloissa) — useHockey pitaa rekisteroida SEN JALKEEN, jotta
    // 'hockey' voittaa initScriptien suoritusjarjestyksessa.
    await useLiigaFixture(page);
    await useHockey(page);
    await useCalendar(page, mixedCalendar());
    await page.goto('/demo.html');

    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await buttons(page).count()).toBe(3);

    // "Tänään" sisältää mixedCalendar():ssa 2 jalkapallo-ottelua ja 1
    // jääkiekko-ottelun — jääkiekkotilan laskurin pitää näyttää 1, ei 3.
    const labels = await buttons(page).allInnerTexts();
    expect(labels[1]).toContain('Tänään');
    expect(labels[1]).toContain('1 ottelu');
  });

  test('sama sekakalenteri: jalkapallotilassa laskuri jattaa jaakiekko-ottelun pois', async ({ page }) => {
    await useCalendar(page, mixedCalendar());
    await page.goto('/demo.html');

    // Tässä tilassa "Tänään" on kaksi jalkapallo-ottelua (ks. calendar()),
    // mixedCalendar():n jääkiekko-ottelu ei saa nostaa lukua kolmeen.
    const labels = await buttons(page).allInnerTexts();
    expect(labels[1]).toContain('Tänään');
    expect(labels[1]).toContain('2 ottelua');
  });
});
