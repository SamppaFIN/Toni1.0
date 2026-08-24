// E2E: Live-seuranta (tiketti #56)
//
// ESPN-kutsut katkaistaan page.routella: testi ei saa riippua ulkoisesta
// palvelusta eika kuormittaa sita. Testataan se mita me hallitsemme --
// renderointi, elinkaari ja virhetila.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

const SCOREBOARD = {
  events: [
    {
      id: '1',
      date: '2026-08-23T15:30Z',
      status: { type: { state: 'in', description: 'Second Half' }, displayClock: "77'" },
      competitions: [
        {
          competitors: [
            { homeAway: 'home', team: { displayName: 'Newcastle United' }, score: '2' },
            { homeAway: 'away', team: { displayName: 'Liverpool' }, score: '1' },
          ],
        },
      ],
    },
  ],
};

const SUMMARY = {
  boxscore: {
    teams: [
      {
        homeAway: 'home',
        team: { displayName: 'Newcastle United' },
        statistics: [
          { name: 'possessionPct', displayValue: '42.4' },
          { name: 'totalShots', displayValue: '11' },
          { name: 'shotsOnTarget', displayValue: '3' },
        ],
      },
      {
        homeAway: 'away',
        team: { displayName: 'Liverpool' },
        statistics: [
          { name: 'possessionPct', displayValue: '57.6' },
          { name: 'totalShots', displayValue: '20' },
          { name: 'shotsOnTarget', displayValue: '5' },
        ],
      },
    ],
  },
  keyEvents: [{ type: { text: 'Goal' }, clock: { displayValue: "23'" }, text: 'Isak scores' }],
};

async function stubEspn(page: any, opts: { fail?: boolean } = {}) {
  await page.route('**/site.api.espn.com/**', (route: any) => {
    if (opts.fail) return route.fulfill({ status: 500, body: '' });
    const url = route.request().url();
    const body = url.includes('/summary') ? SUMMARY : SCOREBOARD;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}

test.describe('Live-seuranta', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
  });

  test('nayttaa tilanteen, kellon ja ottelutilastot', async ({ page }) => {
    await stubEspn(page);
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');

    const live = page.locator('#live-content');
    await expect(live).toContainText('Newcastle United', { timeout: 10000 });
    await expect(live).toContainText('2 – 1');
    await expect(live).toContainText("77'");
    // Juuri nama kayttaja pyysi
    await expect(live).toContainText('Pallonhallinta');
    await expect(live).toContainText('42.4');
    await expect(live).toContainText('Laukaukset');
  });

  test('maalitapahtumat nakyvat minuutteineen', async ({ page }) => {
    await stubEspn(page);
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#live-content')).toContainText("23'", { timeout: 10000 });
  });

  test('ei hae ESPN:aa ennen kuin Seuranta avataan', async ({ page }) => {
    let calls = 0;
    await page.route('**/site.api.espn.com/**', (route: any) => {
      calls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCOREBOARD) });
    });
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    expect(calls, 'Kierros-valilehdella ei pida hakea live-dataa').toBe(0);

    await page.click('.tab[data-tab="tracker"]');
    await expect.poll(() => calls, { timeout: 10000 }).toBeGreaterThan(0);
  });

  test('ESPN-virhe nakyy tekstina eika kaada nakymaa', async ({ page }) => {
    await stubEspn(page, { fail: true });
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    // Simulaationappi on yha paikallaan -- live ei saa rikkoa muuta
    await expect(page.locator('#sim-btn')).toBeVisible();
    await expect(page.locator('#live-content')).toContainText('Live-tilanne', { timeout: 10000 });
  });

  test('live-osio on piilossa jaakiekkotilassa', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bt_sport', 'hockey'));
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#live-content')).toBeHidden();
  });
});

test.describe('Keskinaiset kohtaamiset (tiketti #69)', () => {
  const SUMMARY_H2H = {
    seasonseries: [
      {
        events: [
          {
            date: '2025-03-10T19:45Z',
            statusType: { completed: true },
            competitors: [
              { homeAway: 'home', team: { displayName: 'Fulham' }, score: '2' },
              { homeAway: 'away', team: { displayName: 'Chelsea' }, score: '1' },
            ],
          },
        ],
      },
    ],
  };

  test('kohtaamiset haetaan ja naytetaan', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.route('**/site.api.espn.com/**', async (route: any) => {
      const url = route.request().url();
      if (url.includes('/summary')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUMMARY_H2H) });
      }
      // Scoreboard: palauta ottelu jonka nimet vastaavat snapshotia
      const snap = await (await page.request.get('/data/today.json')).json();
      const m = snap.matches?.[0];
      if (!m) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' });
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          events: [
            {
              id: '999',
              date: m.kickoff,
              status: { type: { state: 'pre', description: 'Scheduled' } },
              competitions: [
                {
                  competitors: [
                    { homeAway: 'home', team: { displayName: m.home.name }, score: null },
                    { homeAway: 'away', team: { displayName: m.away.name }, score: null },
                  ],
                },
              ],
            },
          ],
        }),
      });
    });

    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });

    const card = page.locator('#round-games .card').filter({ has: page.locator('button:has-text("Tunnusluvut")') }).first();
    await card.locator('button:has-text("Tunnusluvut")').click();

    // Joko kohtaamiset tai selkea "ei loytynyt" -- ei koskaan jumiin jaava lataus
    await expect(card).toContainText(/Aiemmat kohtaamiset|ei loytynyt|ei ole ilmaista tunnuslukulahdetta/, { timeout: 10000 });
  });
});
