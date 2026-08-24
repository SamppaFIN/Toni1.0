// E2E: Paivanavigointi kierrossivulla (tiketit #46, #60)
//
// Jaottelulogiikka on yksikkotestattu injektoidulla kellolla
// (football-dayfilter.test.ts), joten taalla ei tarkisteta otteluiden
// lukumaaria -- ne riippuisivat ajopaivasta ja testi lakastuisi hiljaa.
// Taalla todennetaan etta navigointi on kytketty renderointiin ja tila sailyy.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

test.describe('Paivanavigointi', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
  });

  test('tarjoaa eilisen, tanaan, huomisen ja kaikki', async ({ page }) => {
    const nav = page.locator('#round-games');
    for (const label of ['Eilen', 'Tänään', 'Huomenna', 'Kaikki']) {
      await expect(nav.locator(`button:has-text("${label}")`).first()).toBeVisible();
    }
  });

  test('oletuksena tanaan on valittuna', async ({ page }) => {
    const today = page.locator('#round-games button:has-text("Tänään")').first();
    // Aktiivinen nappi on korostettu aksenttivarilla
    const weight = await today.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(weight)).toBeGreaterThanOrEqual(700);
  });

  test('paivan vaihto sailyy sivun paivityksen yli', async ({ page }) => {
    await page.locator('#round-games button:has-text("Huomenna")').first().click();
    await expect(page.locator('#round-games')).not.toBeEmpty();

    await page.reload();
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    const tomorrow = page.locator('#round-games button:has-text("Huomenna")').first();
    const weight = await tomorrow.evaluate((el) => getComputedStyle(el).fontWeight);
    expect(Number(weight), 'valinnan pitaa sailya').toBeGreaterThanOrEqual(700);
  });

  test('eiliseen voi siirtya ja nakyma pysyy ehjana', async ({ page }) => {
    await page.locator('#round-games button:has-text("Eilen")').first().click();
    // Joko arkistoituja otteluita tai selkea tyhja tila -- ei koskaan rikki
    await expect(page.locator('#round-games')).toContainText(/ottelua|Ei otteluita/, { timeout: 5000 });
    // Navigointi on yha kaytettavissa
    await expect(page.locator('#round-games button:has-text("Tänään")').first()).toBeVisible();
  });

  test('kaikki-tilassa on vahintaan yhta monta korttia kuin tanaan', async ({ page }) => {
    const todayCount = await page.locator('#round-games .card').count();
    await page.locator('#round-games button:has-text("Kaikki")').first().click();
    const allCount = await page.locator('#round-games .card').count();
    expect(allCount).toBeGreaterThanOrEqual(todayCount);
  });

  test('EI KOSKAAN tyhjaa listaa kun aikaikkunassa on pelaamattomia otteluita', async ({ page }) => {
    const upcoming = await page.evaluate(() => {
      const s = (window as any).BTF.getSnapshot();
      return s ? s.matches.filter((m: any) => Date.parse(m.kickoff) > Date.now()).length : 0;
    });
    test.skip(upcoming === 0, 'Snapshotissa ei ole pelaamattomia otteluita');

    await page.locator('#round-games button:has-text("Kaikki")').first().click();
    await expect(page.locator('#round-games .card').first()).toBeVisible();
  });
});
