// E2E: Joukkueet -näkymä
import { test, expect } from '@playwright/test';
import { useHockey, resetState } from '../helpers.js';

test.describe('Joukkueet -näkymä', () => {

  test.beforeEach(async ({ page }) => {
    // Tiketti #31: nama testit koskevat jaakiekkodemoa
    await useHockey(page);
    await resetState(page);
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="teams"]');
  });

  test('näyttää joukkuekortit', async ({ page }) => {
    const cards = page.locator('#teams-list .card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
  });

  test('joukkuetiedoissa näkyy Elo-luku', async ({ page }) => {
    const firstCard = page.locator('#teams-list .card').first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    const text = await firstCard.textContent();
    expect(text).toContain('Elo');
  });

  test('PDO:n mukaan näkyy tulkinta (Yli/Ali/—)', async ({ page }) => {
    const pdoBadges = page.locator('#teams-list .badge');
    const count = await pdoBadges.count();
    expect(count).toBeGreaterThan(0);
    const texts = await pdoBadges.allTextContents();
    const hasPdoLabel = texts.some(t => ['Yli', 'Ali', 'Norm'].includes(t.trim()));
    expect(hasPdoLabel).toBe(true);
  });

  test('joukkueet on järjestetty Elo-lukeman mukaan', async ({ page }) => {
    const eloElements = page.locator('#teams-list .card span:has-text("Elo:")');
    const elos: number[] = [];
    const count = await eloElements.count();
    for (let i = 0; i < count; i++) {
      const text = await eloElements.nth(i).textContent();
      const match = text?.match(/Elo:\s*(\d+)/);
      if (match) elos.push(Number(match[1]));
    }
    // Tarkista että järjestys on laskeva
    for (let i = 1; i < elos.length; i++) {
      expect(elos[i]).toBeLessThanOrEqual(elos[i-1]);
    }
  });

  test('mobiili-viewport toimii (max 480px)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14
    const cards = page.locator('#teams-list .card');
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    // Kortin ei pitäisi mennä yli viewportin
    const firstCardBox = await cards.first().boundingBox();
    expect(firstCardBox).not.toBeNull();
    if (firstCardBox) {
      expect(firstCardBox.width).toBeLessThanOrEqual(390);
    }
  });

});
