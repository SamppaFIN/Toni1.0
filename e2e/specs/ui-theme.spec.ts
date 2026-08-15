// E2E: Käyttöliittymäteema (tiketti #35)
//
// Oletusteema ('system') on alkuperäinen tumma OKLCH-teema koskematta.
// Uusi 'casino'-teema on sama komponenttirakenne, eri CSS-muuttujat.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

test.describe('Käyttöliittymäteema', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('oletusteemassa ei ole data-ui-theme-attribuuttia', async ({ page }) => {
    const attr = await page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'));
    expect(attr).toBeNull();
  });

  test('Admin-välilehdellä voi vaihtaa kasino-teemaan', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await expect(page.locator('#admin-content')).toContainText('Teema');

    await page.click('#admin-content button:has-text("Kasino")');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-ui-theme')))
      .toBe('casino');
    await expect(page.locator('#admin-content button:has-text("Kasino")')).toContainText('✓');
  });

  test('teema säilyy sivun päivityksen yli', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Kasino")');
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'))).toBe('casino');

    await page.reload({ waitUntil: 'networkidle' });
    const attr = await page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'));
    expect(attr).toBe('casino');
  });

  test('takaisin oletusteemaan poistaa attribuutin', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Kasino")');
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'))).toBe('casino');

    await page.click('#admin-content button:has-text("Oletus")');
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'))).toBeNull();
  });

  test('teeman vaihto ei muuta lajia tai dataa', async ({ page }) => {
    const cardsBefore = await page.locator('#round-games .card').count();
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Kasino")');
    await page.click('.tab[data-tab="round"]');
    expect(await page.locator('#round-games .card').count()).toBe(cardsBefore);
  });
});
