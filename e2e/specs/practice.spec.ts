// E2E: Jalkapalloharjoituskortit Kierros-näkymässä (oikeat kertoimet, oma analyysi)
import { test, expect } from '@playwright/test';
import { useHockey, resetState } from '../helpers.js';

test.describe('Harjoituskortit', () => {

  test.beforeEach(async ({ page }) => {
    // Tiketti #31: nama testit koskevat jaakiekkodemoa, joka on lipun takana
    await useHockey(page);
    await resetState(page);
  });

  test('näyttää oikeat harjoituskohteet kertoimineen', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).toContainText('Harjoituskierros');
    await expect(page.locator('#round-games')).toContainText('VPS');
    await expect(page.locator('#round-games')).toContainText('Lech Poznan');
    await expect(page.locator('#round-games')).toContainText('Marginaali');
  });

  test('oma arvio laskee edgen ja näyttää value-badgen', async ({ page }) => {
    await page.goto('/demo.html');
    // Klaksvik-koti: 30% arvio @ 4.80 → edge = 0.30*4.80-1 = +44%
    const inp = page.locator('#pm-p1-home');
    await inp.fill('30');
    await expect(page.locator('#pe-p1-home')).toContainText('%');
    await expect(page.locator('#pe-p1-home')).toContainText('+');
  });

  test('harjoituskohteesta voi asettaa vedon ja ratkaista sen', async ({ page }) => {
    await page.goto('/demo.html');
    // Klikkaa Klaksvik-ottelun ensimmäistä kerrointa → popup → vahvista
    await page.locator('#round-games .pk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    await expect(page.locator('#bankroll-display')).toHaveText(/90\.00 €/);
    // Veto näkyy vetolapussa
    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#slip-list')).toContainText('Klaksvik');
    // Manuaalinen ratkaisu: voitto → kassa kasvaa
    await page.locator('#slip-list button[title="Merkitse voitoksi"]').click();
    await expect(page.locator('#bankroll-display')).not.toHaveText(/90\.00 €/);
    await page.click('.tab[data-tab="history"]');
    await expect(page.locator('#history-list')).toContainText('Klaksvik');
  });

});
