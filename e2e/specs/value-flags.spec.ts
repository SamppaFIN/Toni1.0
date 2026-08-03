// E2E: Value-flagit -näkymä
import { test, expect } from '@playwright/test';

test.describe('Value-flagit -näkymä', () => {

  test('näyttää oletuksena value-flagit -välilehden', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('#value.view.active')).toBeVisible();
    await expect(page.locator('.tab.active')).toContainText('Value');
  });

  test('näyttää value-flagit kortteina', async ({ page }) => {
    await page.goto('/demo.html');
    const cards = page.locator('#value-list .card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(2);
  });

  test('näyttää metriset tiedot (flageja, vahvoja)', async ({ page }) => {
    await page.goto('/demo.html');
    const metrics = page.locator('#metrics .metric');
    await expect(metrics.first()).toBeVisible({ timeout: 5000 });
    // Vähintään 1 flagi mock-datassa
    const count = await metrics.first().textContent();
    expect(Number(count)).toBeGreaterThan(0);
  });

  test('vahvan edgen flagilla on vihreä badge', async ({ page }) => {
    await page.goto('/demo.html');
    const strongBadge = page.locator('.badge-green').first();
    await expect(strongBadge).toBeVisible({ timeout: 5000 });
    const text = await strongBadge.textContent();
    expect(text).toContain('%');
  });

  test('vaihtaa välilehteä klikkaamalla', async ({ page }) => {
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="predictions"]');
    await expect(page.locator('#predictions.view.active')).toBeVisible();
    await expect(page.locator('#value.view.active')).not.toBeVisible();
  });

});
