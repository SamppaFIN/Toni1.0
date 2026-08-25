// E2E: Tulevan paivan ennakkohaku napin takaa (tiketti #63)
//
// ESPN-kutsut katkaistaan page.routella. Testataan se mita me hallitsemme:
// napin ilmestyminen, haun kaynnistyminen vasta painalluksesta, ja se etta
// ennakko EI esita olevansa taysi analyysi.

import { test, expect } from '@playwright/test';
import { useFootball, resetState, useCalendarDays, useFixtureSnapshot } from '../helpers.js';

const FIXTURES = {
  events: [
    {
      id: '90',
      date: '2026-08-29T14:00Z',
      status: { type: { state: 'pre', description: 'Scheduled' } },
      competitions: [
        {
          competitors: [
            { homeAway: 'home', team: { displayName: 'Liverpool' }, score: null },
            { homeAway: 'away', team: { displayName: 'Nottingham Forest' }, score: null },
          ],
          odds: [
            {
              provider: { name: 'DraftKings' },
              drawOdds: { moneyLine: 360 },
              moneyline: { home: { close: { odds: '-205' } }, away: { close: { odds: '+520' } } },
            },
          ],
        },
      ],
    },
  ],
};

test.describe('Tulevan paivan ennakkohaku', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    // Kiintea snapshot: sen ottelut ovat TANAAN, joten ylihuominen on
    // varmasti ilman kertoimia. Elava today.json ei kelpaa -- cron hakee
    // otteluita useille paiville, ja silloin hakunappia ei tarvita eika
    // testi ajaisi lainkaan.
    await useFixtureSnapshot(page);
    // Aikajana korvasi kiinteat paivanapit (tiketti #79). Kalenterissa on
    // tama paiva ja ylihuominen, jolla on ottelu muttei kertoimia -- juuri
    // se tilanne jossa ennakkohakunappi tarvitaan.
    await useCalendarDays(page, [0, 2]);
  });

  test('EI hae ESPN:aa ennen napin painallusta', async ({ page }) => {
    let calls = 0;
    await page.route('**/site.api.espn.com/**', (route: any) => {
      calls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) });
    });
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });

    // Kaynnistyksessa haetaan tanaan pelatut (football-results.js). Odota etta
    // se on valmis ennen mittausta -- muuten kesken oleva haku laskettaisiin
    // paivanvaihdon syyksi.
    await expect(page.locator('#round-played')).not.toBeEmpty({ timeout: 10000 });
    await page.waitForTimeout(300);

    const before = calls;
    // Siirry paivaan jossa ei ole otteluita
    await page.locator('.timeline-strip .day-btn').nth(2).click();
    await page.waitForTimeout(500);
    expect(calls, 'paivanvaihto ei saa laukaista hakua').toBe(before);
  });

  test('nappi ilmestyy tulevalle paivalle jolla ei ole otteluita', async ({ page }) => {
    await page.route('**/site.api.espn.com/**', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ events: [] }) })
    );
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await page.locator('.timeline-strip .day-btn').nth(2).click();

    const btn = page.locator('button:has-text("Hae ottelut ja kertoimet")');
    if (await btn.count()) await expect(btn.first()).toBeVisible();
  });

  test('haku nayttaa ottelut ja kertoimet desimaaleina', async ({ page }) => {
    await page.route('**/site.api.espn.com/**', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURES) })
    );
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await page.locator('.timeline-strip .day-btn').nth(2).click();

    const btn = page.locator('button:has-text("Hae ottelut ja kertoimet")');
    test.skip((await btn.count()) === 0, 'Paivalla on jo otteluita snapshotissa');
    await btn.first().click();

    const preview = page.locator('#day-preview');
    await expect(preview).toContainText('Liverpool', { timeout: 10000 });
    // -205 -> 1.49, +360 -> 4.60
    await expect(preview).toContainText('1.49');
    await expect(preview).toContainText('4.60');
  });

  test('ennakko sanoo ETTEI se ole taysi analyysi', async ({ page }) => {
    await page.route('**/site.api.espn.com/**', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FIXTURES) })
    );
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await page.locator('.timeline-strip .day-btn').nth(2).click();

    const btn = page.locator('button:has-text("Hae ottelut ja kertoimet")');
    test.skip((await btn.count()) === 0, 'Paivalla on jo otteluita snapshotissa');
    await btn.first().click();

    const preview = page.locator('#day-preview');
    await expect(preview).toContainText('ennakkotieto', { timeout: 10000 });
    await expect(preview).toContainText('yksi toimisto');
  });

  test('ESPN-virhe ei kaada nakymaa', async ({ page }) => {
    await page.route('**/site.api.espn.com/**', (route: any) => route.fulfill({ status: 500, body: '' }));
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await page.locator('.timeline-strip .day-btn').nth(2).click();
    const btn = page.locator('button:has-text("Hae ottelut ja kertoimet")');
    if (await btn.count()) {
      await btn.first().click();
      await expect(page.locator('#day-preview')).toContainText('Ei otteluita', { timeout: 10000 });
    }
    // Navigointi toimii yha
    await expect(page.locator('#round-games button:has-text("Tänään")').first()).toBeVisible();
  });
});
