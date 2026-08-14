// E2E: Kierros -näkymä (value-flagit osana pelikortteja)
import { test, expect } from '@playwright/test';

test.describe('Kierros -näkymä', () => {

  test('näyttää oletuksena Kierros-välilehden', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('#round.view.active')).toBeVisible();
    await expect(page.locator('.tab.active')).toContainText('Kierros');
  });

  test('näyttää pelikortit tuleville otteluille', async ({ page }) => {
    await page.goto('/demo.html');
    const cards = page.locator('#round-games .card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
  });

  test('pelikortissa näkyy joukkuenimet ja Elo suluissa', async ({ page }) => {
    await page.goto('/demo.html');
    const firstCard = page.locator('#round-games .card').first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    const text = await firstCard.textContent();
    expect(text).toMatch(/\(\d{3,4}\)/);
  });

  test('näyttää kertoimet useilta vedonlyöntitoimistoilta', async ({ page }) => {
    await page.goto('/demo.html');
    const firstCard = page.locator('#round-games .card').first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    const bkNames = firstCard.locator('.bk-name');
    expect(await bkNames.count()).toBeGreaterThanOrEqual(2);
    const cells = firstCard.locator('.bk-odds');
    expect(await cells.count()).toBeGreaterThanOrEqual(6);
  });

  test('value-flag (💎) näkyy kun edge > 3%', async ({ page }) => {
    await page.goto('/demo.html');
    const flag = page.locator('#round-games .card .badge').first();
    await expect(flag).toBeVisible({ timeout: 5000 });
    const text = await flag.textContent();
    expect(text).toContain('💎');
  });

  test('näyttää mallin todennäköisyydet', async ({ page }) => {
    await page.goto('/demo.html');
    const modelLine = page.locator('#round-games .card:has-text("Malli:")').first();
    await expect(modelLine).toBeVisible({ timeout: 5000 });
    const text = await modelLine.textContent();
    expect(text).toMatch(/\d+% \/ \d+% \/ \d+%/);
  });

  test('vetoa voi lyödä kertoimia klikkaamalla', async ({ page }) => {
    await page.goto('/demo.html');
    const firstOdds = page.locator('#round-games .card .bk-odds').first();
    await firstOdds.click();
    await expect(page.locator('button:has-text("✅ Veto")')).toBeVisible();
    await page.click('button:has-text("✅ Veto")');
    // Kassa vähenee 100 → 90
    await expect(page.locator('#bankroll-display')).toHaveText(/90\.00 €/);
  });

  test('Vetolappu-välilehti näyttää asetetun vedon', async ({ page }) => {
    await page.goto('/demo.html');
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#slip-list .card').first()).toBeVisible();
  });

});
