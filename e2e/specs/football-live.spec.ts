// E2E: Live-seuranta (tiketti #55)
//
// live.json on cronin tuottama eikä committoitu, joten testit eivät saa
// olettaa sen olevan olemassa. Testataan molemmat tilat: puuttuva tiedosto
// (hallittu ohje) ja injektoitu tiedosto (oikea renderöinti).

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

const LIVE = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  unavailable: ['pallonhallinta', 'laukaukset', 'kulmat', 'kortit'],
  matches: [
    {
      match_key: 'x1',
      league: 'soccer_epl',
      home: 'Newcastle United',
      away: 'Liverpool',
      kickoff: new Date(Date.now() - 40 * 60000).toISOString(),
      home_score: 1,
      away_score: 2,
      completed: false,
      minute: 40,
      last_update: new Date().toISOString(),
    },
  ],
};

test.describe('Live-seuranta', () => {
  test('puuttuva live.json näytetään ohjeena eikä tyhjänä', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.route('**/data/live.json', (r) => r.fulfill({ status: 404, body: '' }));
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#live-content')).toContainText('npm run live');
  });

  test('näyttää tilanteen, arvioidun minuutin ja puuttuvat tilastot', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.route('**/data/live.json', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIVE) })
    );
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');

    const live = page.locator('#live-content');
    await expect(live).toContainText('Newcastle United');
    await expect(live).toContainText('Liverpool');
    await expect(live).toContainText('1 – 2');
    await expect(live).toContainText("~40'");
    // Rehellisyys puuttuvista kentistä on osa sopimusta, ei koriste
    await expect(live).toContainText('pallonhallinta');
    await expect(live).toContainText('laukaukset');
  });

  test('päättynyt ottelu merkitään eikä sille anneta minuuttia', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    const done = { ...LIVE, matches: [{ ...LIVE.matches[0], completed: true, minute: null }] };
    await page.route('**/data/live.json', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(done) })
    );
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#live-content')).toContainText('päättynyt');
  });

  test('live-osio on piilossa jääkiekkotilassa', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bt_sport', 'hockey'));
    await resetState(page);
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#live-content')).toBeHidden();
  });
});
