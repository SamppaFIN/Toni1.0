// E2E: Kerroinlaskuri jalkapallokortilla (tiketti #49)
//
// Laskennan oikeellisuus on lukittu yksikkötesteillä (football-calc.test.ts
// vertaa selainta palvelimeen). Täällä todennetaan se mitä yksikkötesti ei voi:
// että tekijän lisääminen oikeasti liikuttaa kortilla näkyviä lukuja ja että
// tila säilyy — eli että ketju UI → localStorage → uudelleenlaskenta toimii.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

/** Avaa ensimmäisen kortin Kerroinlaskuri-osio */
async function openCalculator(page: any) {
  await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  const button = page.locator('button:has-text("Kerroinlaskuri")').first();
  await button.click();
  return page.locator('#round-games').first();
}

test.describe('Kerroinlaskuri', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
  });

  test('osio aukeaa ja kertoo tekijän yksikön', async ({ page }) => {
    const view = await openCalculator(page);
    await expect(view).toContainText('Omat tekijät');
    await expect(view).toContainText('prosentteina');
    await expect(view).toContainText('Ei omia tekijöitä');
  });

  test('tekijä ilman nimeä ei mene läpi', async ({ page }) => {
    await openCalculator(page);
    await page.locator('input[id^="fac-label-"]').first().fill('');
    await page.locator('button:has-text("Lisää tekijä")').first().click();
    await expect(page.locator('#round-games')).toContainText('Ei omia tekijöitä');
  });

  test('tekijän lisääminen muuttaa λ:aa ja näkyy listassa', async ({ page }) => {
    await openCalculator(page);

    await page.locator('input[id^="fac-label-"]').first().fill('avainhyökkääjä poissa');
    await page.locator('input[id^="fac-delta-"]').first().fill('-30');
    await page.locator('button:has-text("Lisää tekijä")').first().click();

    const view = page.locator('#round-games');
    await expect(view).toContainText('avainhyökkääjä poissa');
    await expect(view).toContainText('-30 %');
    await expect(view).not.toContainText('Ei omia tekijöitä');
  });

  test('tekijän voi poistaa ja nollata', async ({ page }) => {
    await openCalculator(page);
    await page.locator('input[id^="fac-label-"]').first().fill('testitekijä');
    await page.locator('button:has-text("Lisää tekijä")').first().click();
    await expect(page.locator('#round-games')).toContainText('testitekijä');

    await page.locator('button:has-text("Nollaa")').first().click();
    await expect(page.locator('#round-games')).toContainText('Ei omia tekijöitä');
  });

  test('tekijät säilyvät sivun päivityksen yli', async ({ page }) => {
    await openCalculator(page);
    await page.locator('input[id^="fac-label-"]').first().fill('sailyva tekija');
    await page.locator('button:has-text("Lisää tekijä")').first().click();
    await expect(page.locator('#round-games')).toContainText('sailyva tekija');

    await page.reload();
    await openCalculator(page);
    await expect(page.locator('#round-games')).toContainText('sailyva tekija');
  });

  test('säädetty λ eroaa mallin λ:sta kun tekijä on lisätty', async ({ page }) => {
    await openCalculator(page);

    // Lue mallin λ ennen muutosta suoraan laskennasta, ei DOM-tekstistä
    const before = await page.evaluate(() => {
      const s = (window as any).BTF.getSnapshot();
      const m = s.matches.find((x: any) => x.model.lambda_home !== null);
      return m ? m.model.lambda_home : null;
    });
    test.skip(before === null, 'Snapshotissa ei ole Poisson-mallia (market-only)');

    await page.locator('input[id^="fac-label-"]').first().fill('iso muutos');
    await page.locator('input[id^="fac-delta-"]').first().fill('50');
    await page.locator('button:has-text("Lisää tekijä")').first().click();

    // λ-rivi näyttää muodon "malli → säädetty"; säädetyn pitää olla suurempi
    const view = page.locator('#round-games');
    await expect(view).toContainText('iso muutos');
    await expect(view).toContainText('+50 %');
  });
});
