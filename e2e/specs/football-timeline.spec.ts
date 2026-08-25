// E2E: Aikajanakontrolli (tiketti #79)
//
// Aikajana lukee fixtures.json:in ja nayttaa VAIN paivat joilla on otteluita.
// Testit syottavat oman kalenterin, jotta ne eivat riipu siita mita cron on
// sattunut hakemaan -- sama periaate kuin useFixtureSnapshotissa.

import { test, expect, Page } from '@playwright/test';
import { useFootball, resetState, useFixtureSnapshot } from '../helpers.js';

function ymd(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Kalenteri jossa on AUKKO: tanaan ja ylihuomenna pelataan, huomenna ei.
 * Juuri tama aukko on se mita testataan -- huomista ei saa nakya.
 */
function calendar() {
  const day = (offset: number, matches: number, withOdds: number, league = 'Valioliiga') => ({
    date: ymd(offset),
    matches,
    with_odds: withOdds,
    leagues: [league],
  });

  const match = (offset: number, home: string, away: string, hasOdds: boolean, league = 'Valioliiga') => ({
    espn_id: `${home}-${away}`,
    match_id: hasOdds ? `soccer_epl:${ymd(offset)}:${home}-${away}` : null,
    date: ymd(offset),
    kickoff: (() => {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      d.setHours(18, 0, 0, 0);
      return d.toISOString();
    })(),
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
    range: { from: ymd(-2), to: ymd(3) },
    // Kolme "oikeaa" paivaa + tayte, jotta nauha on varmasti vieritettava.
    // Ilman taytetta raahaustestit skippaisivat, ja skipattu testi lakastuu
    // hiljaa -- se opetus on kirjattu handoverissa kertaalleen.
    days: [
      day(-1, 1, 1),
      day(0, 2, 1),
      day(2, 3, 0, 'Serie A'),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((o) => day(o, 1, 0, 'La Liga')),
    ],
    matches: [
      match(-1, 'Menneet', 'Kotijoukkue', true),
      match(0, 'Tanaan', 'Vastustaja', true),
      match(0, 'Kertoimeton', 'Ottelu', false),
      match(2, 'Ylihuominen', 'Ottelu A', false, 'Serie A'),
      match(2, 'Ylihuominen', 'Ottelu B', false, 'Serie A'),
      match(2, 'Ylihuominen', 'Ottelu C', false, 'Serie A'),
      ...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((o) =>
        match(o, `Tayte ${o}`, 'Vastustaja', false, 'La Liga')
      ),
    ],
  };
}

async function useCalendar(page: Page) {
  await page.route('**/data/fixtures.json', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(calendar()) })
  );
}

test.describe('Aikajana', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await useCalendar(page);
    // HUOM: bt_timeline_day EI nollata addInitScriptilla. Se ajetaan myos
    // reloadissa, jolloin sailyvyystesti ei voisi koskaan mennä lapi.
    // Playwright antaa joka testille tuoreen kontekstin, joten localStorage
    // on valmiiksi tyhja.
  });

  test('aikajana nakyy ja sisaltaa ottelupaivat', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.timeline-strip')).toContainText('Tänään');
    await expect(page.locator('.timeline-strip')).toContainText('Eilen');
  });

  test('TYHJAA PAIVAA EI NAYTETA — huominen puuttuu kalenterista', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });
    // Huomenna ei ole otteluita, joten sita ei ole aikajanalla
    await expect(page.locator('.timeline-strip')).not.toContainText('Huomenna');
  });

  test('paivachip kertoo otteluiden maaran', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });
    const chips = page.locator('.timeline-strip .day-btn');
    // Kaikki + 15 ottelupaivaa (3 nimettya + 12 taytetta)
    expect(await chips.count()).toBe(16);
  });

  test('Kaikki-valinta on yha tarjolla', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip button:has-text("Kaikki")')).toBeVisible({ timeout: 10000 });
  });

  test('paivan valinta sailyy sivun paivityksen yli', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });

    // Valitse ylihuominen (Serie A -paiva)
    await page.locator('.timeline-strip .day-btn').nth(3).click();
    const selected = await page.evaluate(() => localStorage.getItem('bt_timeline_day'));
    expect(selected).toBeTruthy();

    await page.reload();
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });
    expect(await page.evaluate(() => localStorage.getItem('bt_timeline_day'))).toBe(selected);
  });

  test('KERTOIMETON OTTELU NAKYY otteluohjelmana, ei piiloteta', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });

    // Ylihuominen: kolme ottelua joista yhdellakaan ei ole kertoimia
    await page.locator('.timeline-strip .day-btn').nth(3).click();
    await expect(page.locator('#round-games')).toContainText('Otteluohjelma', { timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText('Ylihuominen');
  });

  test('otteluohjelma ryhmittelee sarjoittain', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });
    await page.locator('.timeline-strip .day-btn').nth(3).click();
    await expect(page.locator('#round-games')).toContainText('Serie A', { timeout: 10000 });
  });

  test('mennyt ottelu nayttaa tuloksen otteluohjelmassa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });
    await page.locator('.timeline-strip .day-btn').nth(1).click(); // eilinen
    await expect(page.locator('#round-games')).toContainText(/2–1|Menneet/, { timeout: 10000 });
  });

  test('KALENTERIN PUUTTUMINEN ei kaada nakymaa', async ({ page }) => {
    await page.route('**/data/fixtures.json', (route: any) => route.fulfill({ status: 404 }));
    await page.goto('/demo.html');
    // Kortit renderoityvat kuten ennen, ja puute sanotaan
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText('Otteluohjelmaa ei saatu');
  });

  test('RIKKINAINEN KALENTERI kasitellaan kuten puuttuva', async ({ page }) => {
    await page.route('**/data/fixtures.json', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"days":"ei taulukko"}' })
    );
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.timeline-strip')).toHaveCount(0);
  });

  test('aikajana on piilossa jaakiekkotilassa', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bt_sport', 'hockey'));
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await expect(page.locator('.timeline-strip')).toHaveCount(0);
  });
});

// Raahaus (tiketti #79)
//
// Nauha on raahattava, koska hiirella vaakavieritys on hankalaa ja
// kosketuslaitteella palkki on liian pieni sormelle. Vaikea osa ei ole
// raahaus vaan se ETTEI KLIKKAUS HUKU: molemmat tapahtuvat samassa
// elementissa ja ne erotetaan liikekynnyksesta.
test.describe('Aikajanan raahaus', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await useCalendar(page);
  });

  test('KLIKKAUS VALITSEE paivan vaikka nauha on raahattava', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });

    const chip = page.locator('.timeline-strip .day-btn').nth(3);
    const box = (await chip.boundingBox())!;
    // Painallus ja nosto samassa pisteessa = klikkaus, ei raahaus
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => localStorage.getItem('bt_timeline_day'))).toBeTruthy();
  });

  test('RAAHAUS EI VALITSE paivaa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });

    const before = await page.evaluate(() => localStorage.getItem('bt_timeline_day'));
    const chip = page.locator('.timeline-strip .day-btn').nth(3);
    const box = (await chip.boundingBox())!;

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Yli kynnyksen (6 px) -> raahaus
    await page.mouse.move(box.x + box.width / 2 - 60, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();

    expect(await page.evaluate(() => localStorage.getItem('bt_timeline_day'))).toBe(before);
  });

  test('nauha vierittyy vaakasuunnassa raahatessa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });

    // Kavenna ruutu niin etta nauha on varmasti vieritettava
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(150);

    const strip = page.locator('.timeline-strip');
    const scrollable = await strip.evaluate((el) => el.scrollWidth > el.clientWidth);
    test.skip(!scrollable, 'Nauha mahtuu ruudulle — ei vieritettavaa');

    await strip.evaluate((el) => (el.scrollLeft = 0));
    const box = (await strip.boundingBox())!;
    await page.mouse.move(box.x + box.width - 12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 12, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();

    expect(await strip.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  });

  test('nauha vierittyy valittuun paivaan eika jaa menneisyyteen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/demo.html');
    await expect(page.locator('.timeline-strip')).toBeVisible({ timeout: 10000 });

    const strip = page.locator('.timeline-strip');
    const scrollable = await strip.evaluate((el) => el.scrollWidth > el.clientWidth);
    test.skip(!scrollable, 'Nauha mahtuu ruudulle');

    // Aktiivinen chip on nakyvissa nauhan sisalla
    const visible = await strip.evaluate((el) => {
      const active = el.querySelector('.day-btn.active') as HTMLElement | null;
      if (!active) return false;
      return active.offsetLeft >= el.scrollLeft - 1 && active.offsetLeft < el.scrollLeft + el.clientWidth;
    });
    expect(visible).toBe(true);
  });
});
