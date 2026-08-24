// E2E: Jalkikateisarviointi (tiketti #70)
//
// Arkisto tayttyy vasta kun sovellus on ladannut kohteita, joten testit
// eivat oleta dataa. Todennetaan se mita me hallitsemme: nakyma latautuu,
// haku kaynnistyy vasta napista, ja liian pieni otos SANOTAAN.

import { test, expect } from '@playwright/test';
import { useFootball, useHockey, resetState } from '../helpers.js';

test.describe('Jalkikateisarviointi', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.addInitScript(() => localStorage.removeItem('bt_odds_archive'));
  });

  test('Historia-valilehdella on arviointinappi', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await page.click('.tab[data-tab="history"]');
    await expect(page.locator('#review-content')).toContainText('Miten malli on pärjännyt');
    await expect(page.locator('button:has-text("Arvioi ennusteet")')).toBeVisible();
  });

  test('EI hae ESPN:aa ennen napin painallusta', async ({ page }) => {
    let calls = 0;
    await page.route('**/site.api.espn.com/**', (route: any) => {
      calls++;
      return route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' });
    });
    await page.goto('/demo.html');
    await expect(page.locator('#round-played')).not.toBeEmpty({ timeout: 10000 });
    await page.waitForTimeout(300);

    const before = calls;
    await page.click('.tab[data-tab="history"]');
    await page.waitForTimeout(400);
    expect(calls, 'valilehden avaus ei saa laukaista hakua').toBe(before);
  });

  test('tyhja arkisto sanotaan suoraan', async ({ page }) => {
    await page.route('**/site.api.espn.com/**', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"events":[]}' })
    );
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await page.click('.tab[data-tab="history"]');
    await page.click('button:has-text("Arvioi ennusteet")');

    // Joko ratkenneita otteluita tai selkea selitys -- ei koskaan tyhjaa
    await expect(page.locator('#review-content')).toContainText(/ratkennutta|ei ole vielä ratkennut/, { timeout: 15000 });
  });

  test('osio on piilossa jaakiekkotilassa', async ({ page }) => {
    await useHockey(page);
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="history"]');
    await expect(page.locator('#review-content')).toBeHidden();
  });
});
