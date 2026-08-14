// E2E: Ennusteet ja simulaatio
import { test, expect } from '@playwright/test';
import { useHockey, resetState } from '../helpers.js';

test.describe('Ennusteet ja simulaatio', () => {

  test.beforeEach(async ({ page }) => {
    // Tiketti #31: nama testit koskevat jaakiekkodemoa, joka on lipun takana
    await useHockey(page);
    await resetState(page);
  });

  test('Kierros-näkymässä näkyy mallin 1X2-todennäköisyydet', async ({ page }) => {
    await page.goto('/demo.html');
    const modelLine = page.locator('#round-games .card:has-text("Malli:")').first();
    await expect(modelLine).toBeVisible({ timeout: 5000 });
    const text = await modelLine.textContent();
    expect(text).toMatch(/\d+% \/ \d+% \/ \d+%/);
  });

  test('Seuranta-välilehti löytyy ja siinä on simulaation käynnistysnappi', async ({ page }) => {
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#sim-btn')).toBeVisible();
    await expect(page.locator('#sim-btn')).toContainText('Käynnistä');
  });

  test('simulaatio vaatii vähintään yhden vedon', async ({ page }) => {
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="tracker"]');
    await page.click('#sim-btn');
    // Varoitus tulee, peliä ei käynnistetä
    await expect(page.locator('.toast')).toContainText('Aseta ensin vetoja');
    await expect(page.locator('#sim-btn')).toBeEnabled();
  });

  test('vedon voi asettaa ja simulaatio käynnistyy', async ({ page }) => {
    await page.goto('/demo.html');
    // Aseta veto
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    // Käynnistä simulaatio
    await page.click('.tab[data-tab="tracker"]');
    await page.click('#sim-btn');
    await expect(page.locator('#sim-btn')).toBeDisabled();
    await expect(page.locator('#sim-btn')).toContainText('käynnissä');
  });

  test('pikaveto-napit näkyvät live-simulaatiossa', async ({ page }) => {
    await page.goto('/demo.html');
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    await page.click('.tab[data-tab="tracker"]');
    await page.click('#sim-btn');
    await expect(page.locator('button:has-text("seuraava maali 10€")').first()).toBeVisible({ timeout: 5000 });
  });

  test('Kierrosraportti näkyy simulaation jälkeen', async ({ page }) => {
    await page.goto('/demo.html');
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    await page.click('.tab[data-tab="tracker"]');
    await page.click('#sim-btn');
    // Odota raporttia (simulaatio kestää 20s)
    await expect(page.locator('h3:has-text("Kierrosraportti")')).toBeVisible({ timeout: 30000 });
    // Vedonlyöntitulokset-osio näyttää jokaisen vedon odotuksen/toteuman/tuloksen
    await expect(page.locator('h4:has-text("Vedonlyöntitulokset")')).toBeVisible();
    await expect(page.locator('text=Odotus:')).toBeVisible();
    await expect(page.locator('text=Toteuma:')).toBeVisible();
  });

  test('Historia-välilehti näyttää vedonlyöntihistorian', async ({ page }) => {
    await page.goto('/demo.html');
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    await page.click('.tab[data-tab="tracker"]');
    await page.click('#sim-btn');
    await expect(page.locator('h3:has-text("Kierrosraportti")')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="history"]');
    const cards = page.locator('#history-list .card');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

});
