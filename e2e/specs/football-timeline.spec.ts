// E2E: Päivänavigointi viitenä nappina (tiketti #82)
//
// Vieritettava nauha (#79/#81) korvattiin viidella napilla. Testit syottavat
// oman kalenterin, jotta ne eivat riipu siita mita cron on sattunut hakemaan
// -- sama periaate kuin useFixtureSnapshotissa.
//
// Kalenterissa on tarkoituksella AUKKO: eilen, tanaan ja ylihuomenna
// pelataan, huomenna ei. Juuri se aukko testaa nuolten tarkeimman saannon --
// ne hyppaavat OTTELUPAIVIIN eivatka kalenteripaiviin.

import { test, expect, Page } from '@playwright/test';
import { useFootball, resetState, useFixtureSnapshot } from '../helpers.js';

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

  test('VIISI nappia, ei enempaa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await buttons(page).count()).toBe(5);
  });

  test('napit ovat nuoli, eilen, tanaan, huomenna, nuoli', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    const labels = await buttons(page).allInnerTexts();
    expect(labels[0]).toContain('‹');
    expect(labels[1]).toContain('Eilen');
    expect(labels[2]).toContain('Tänään');
    expect(labels[3]).toContain('Huomenna');
    expect(labels[4]).toContain('›');
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

  test('nimetty paiva nayttaa otteluiden maaran', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    await expect(buttons(page).nth(2)).toContainText('2'); // tanaan: 2 ottelua
  });

  test('paiva jolla ei pelata jaa himmeaksi mutta pysyy painettavana', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    const tomorrow = buttons(page).nth(3); // huomenna puuttuu kalenterista
    await expect(tomorrow).toHaveAttribute('style', /opacity/);
    await expect(tomorrow).toBeEnabled();
  });

  test('NUOLI HYPPAA OTTELUPAIVAAN, ei kalenteripaivaan', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    // Valittuna tanaan; huomenna ei pelata -> nuolen pitaa vieda ylihuomiseen
    await buttons(page).nth(4).click();
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

    await buttons(page).nth(4).click(); // viimeiseen ottelupaivaan
    await expect(buttons(page).nth(4)).toBeDisabled();
  });

  test('pikavalinta korostuu kun se on valittuna', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(1).click(); // Eilen
    await expect(buttons(page).nth(1)).toHaveClass(/active/);
    await expect(buttons(page).nth(2)).not.toHaveClass(/active/);
  });

  test('VALITTU PAIVA SANOTAAN kun se ei ole mikaan pikavalinnoista', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(4).click(); // ylihuominen
    await expect(page.locator('#round-games')).toContainText('Valittuna', { timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText(ymd(2));
  });

  test('valinta sailyy sivun paivityksen yli', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(1).click();
    const selected = await selectedDay(page);
    expect(selected).toBeTruthy();

    await page.reload();
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await selectedDay(page)).toBe(selected);
  });

  test('KERTOIMETON OTTELU NAKYY otteluohjelmana, ei piiloteta', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(4).click(); // ylihuominen: 3 ottelua ilman kertoimia
    await expect(page.locator('#round-games')).toContainText('Otteluohjelma', { timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText('Ylihuominen');
  });

  test('otteluohjelma ryhmittelee sarjoittain', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    await buttons(page).nth(4).click();
    await expect(page.locator('#round-games')).toContainText('Serie A', { timeout: 10000 });
  });

  test('mennyt ottelu nayttaa tuloksen otteluohjelmassa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    await buttons(page).nth(1).click(); // eilinen
    await expect(page.locator('#round-games')).toContainText(/2–1|Menneet/, { timeout: 10000 });
  });

  test('KALENTERIN PUUTTUMINEN ei kaada nakymaa', async ({ page }) => {
    await page.route('**/data/fixtures.json', (route: any) => route.fulfill({ status: 404 }));
    await page.goto('/demo.html');

    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await buttons(page).count()).toBe(5);
    await expect(page.locator('#round-games')).toContainText('Otteluohjelmaa ei saatu');
  });

  test('ilman kalenteria nuolet askeltavat vuorokauden kerrallaan', async ({ page }) => {
    await page.route('**/data/fixtures.json', (route: any) => route.fulfill({ status: 404 }));
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });

    await buttons(page).nth(4).click();
    await expect.poll(() => selectedDay(page)).toBe(ymd(1));
  });

  test('RIKKINAINEN KALENTERI kasitellaan kuten puuttuva', async ({ page }) => {
    await useCalendar(page, { days: 'ei taulukko' });
    await page.goto('/demo.html');
    await expect(nav(page)).toBeVisible({ timeout: 10000 });
    expect(await buttons(page).count()).toBe(5);
  });

  test('navigointi on piilossa jaakiekkotilassa', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bt_sport', 'hockey'));
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await expect(nav(page)).toHaveCount(0);
  });
});
