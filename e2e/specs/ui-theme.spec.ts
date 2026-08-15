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

  test('kasino-teema muuttaa taustan lisäksi otsikon fontin ja korttien reunat', async ({ page }) => {
    // Aiemmin teema vaihtoi käytännössä vain taustavärin. Tämä testi lukitsee
    // että vähintään tausta, otsikkofontti ja kortin reunaväri eroavat
    // oletusteemasta — ei vain yksi arvo.
    // .card:has(.matchup) valitsee oikean ottelukortin, ei sourceBanneria —
    // banner asettaa oman reunavärinsä inline-tyylillä joka ei riipu teemasta
    const before = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const h1 = getComputedStyle(document.querySelector('.glass-header h1'));
      const card = getComputedStyle(document.querySelector('#round-games .card:has(.matchup)'));
      return { bg: body.backgroundColor, font: h1.fontFamily, border: card.borderColor };
    });

    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Kasino")');
    await page.click('.tab[data-tab="round"]');
    await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'))).toBe('casino');

    const after = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const h1 = getComputedStyle(document.querySelector('.glass-header h1'));
      const card = getComputedStyle(document.querySelector('#round-games .card:has(.matchup)'));
      return { bg: body.backgroundColor, font: h1.fontFamily, border: card.borderColor };
    });

    expect(after.bg).not.toBe(before.bg);
    expect(after.font).not.toBe(before.font);
    expect(after.font.toLowerCase()).toContain('cinzel');
    expect(after.border).not.toBe(before.border);
  });

  test('kasino-teemassa numerot pysyvät järjestelmäfontissa vaikka otsikko vaihtuu', async ({ page }) => {
    // Cinzel on kaiverrettu otsikkofontti — Elo-luvut ja kertoimet eivät saa
    // siirtyä siihen, koska luettavuus dataile menee tyylin edelle
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Kasino")');
    await page.click('.tab[data-tab="round"]');

    const eloFont = await page.evaluate(() => {
      const span = document.querySelector('#round-games .matchup strong span');
      return span ? getComputedStyle(span).fontFamily.toLowerCase() : null;
    });
    if (eloFont) expect(eloFont).not.toContain('cinzel');
  });
});
