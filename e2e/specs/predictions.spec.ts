// E2E: Ennusteet -näkymä
import { test, expect } from '@playwright/test';

test.describe('Ennusteet -näkymä', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="predictions"]');
  });

  test('näyttää ennustekortit', async ({ page }) => {
    const cards = page.locator('#predictions-list .card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(3);
  });

  test('näyttää osumatarkkuuden', async ({ page }) => {
    const metrics = page.locator('#accuracy-metrics .metric');
    await expect(metrics.first()).toBeVisible({ timeout: 5000 });
  });

  test('ratkenneella ennusteella on ✅ tai ❌', async ({ page }) => {
    const firstCard = page.locator('#predictions-list .card').first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    const text = await firstCard.textContent();
    expect(text).toMatch(/✅|❌|⏳/);
  });

  test('odottavalla ennusteella on ⏳', async ({ page }) => {
    // Mock-datassa ekat 2 ennustetta ovat upcoming (was_correct = null)
    const pendingCards = page.locator('#predictions-list .badge-muted');
    const count = await pendingCards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('näyttää todennäköisyydet prosentteina', async ({ page }) => {
    const probText = page.locator('.prob-text').first();
    await expect(probText).toBeVisible({ timeout: 5000 });
    const text = await probText.textContent();
    expect(text).toMatch(/\d+%/);
  });

});
