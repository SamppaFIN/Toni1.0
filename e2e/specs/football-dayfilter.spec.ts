// E2E: Ottelulistan päiväsuodatin (tiketti #46)
//
// Työnjako testien välillä on tarkoituksellinen: jaottelulogiikka on
// yksikkötestattu injektoidulla kellolla (football-dayfilter.test.ts), joten
// täällä ei tarkisteta otteluiden lukumääriä — ne riippuisivat ajopäivästä ja
// testi lakastuisi hiljaa huomenna. Täällä todennetaan vain että suodatin on
// kytketty renderöintiin ja että tila säilyy.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

test.describe('Ottelulistan päiväsuodatin', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    // Ei erillistä bt_football_day_filter-tyhjennystä: Playwright antaa joka
    // testille tuoreen kontekstin, joten localStorage on jo tyhjä. addInitScript
    // ajaisi myös reloadissa ja pyyhkisi juuri sen tilan jota säilyvyystesti mittaa.
    await page.goto('/demo.html');
  });

  test('oletuksena rajaa tähän päivään ja tarjoaa napin kaikkiin', async ({ page }) => {
    await expect(page.locator('button:has-text("Näytä kaikki")')).toBeVisible({ timeout: 10000 });
    // Joko tämän päivän ottelut näkyvät, tai ne on jo pelattu ja pudottiin
    // seuraaviin — molemmat ovat oikeita, kumpi sattuu riippuu kellonajasta.
    const text = (await page.locator('#round-games').textContent()) ?? '';
    expect(/ottelua tänään|näytetään seuraavat/.test(text)).toBe(true);
  });

  test('EI KOSKAAN tyhjää listaa jos aikaikkunassa on pelaamattomia otteluita', async ({ page }) => {
    await expect(page.locator('button:has-text("Näytä kaikki")')).toBeVisible({ timeout: 10000 });

    const upcoming = await page.evaluate(() => {
      const s = (window as any).BTF.getSnapshot();
      return s.matches.filter((m: any) => Date.parse(m.kickoff) > Date.now()).length;
    });
    test.skip(upcoming === 0, 'Snapshotissa ei ole yhtään pelaamatonta ottelua');

    // Oletustilassa (vain tänään) kortteja pitää näkyä, vaikka päivän ottelut
    // olisi jo pelattu — silloin pudotaan automaattisesti seuraaviin.
    await expect(page.locator('#round-games .card').first()).toBeVisible();
    const cards = await page.locator('#round-games .card').count();
    expect(cards).toBeGreaterThan(0);
  });

  test('napista saa kaikki ottelut näkyviin ja takaisin', async ({ page }) => {
    await expect(page.locator('button:has-text("Näytä kaikki")')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Näytä kaikki")');

    await expect(page.locator('button:has-text("Vain tänään")')).toBeVisible();
    await expect(page.locator('#round-games')).not.toContainText('ottelua tänään');

    await page.click('button:has-text("Vain tänään")');
    await expect(page.locator('button:has-text("Näytä kaikki")')).toBeVisible();
  });

  test('kaikki-tilassa on vähintään yhtä monta korttia kuin tänään-tilassa', async ({ page }) => {
    await expect(page.locator('button:has-text("Näytä kaikki")')).toBeVisible({ timeout: 10000 });
    const todayCount = await page.locator('#round-games .card').count();

    await page.click('button:has-text("Näytä kaikki")');
    const allCount = await page.locator('#round-games .card').count();

    expect(allCount).toBeGreaterThanOrEqual(todayCount);
  });

  test('valinta säilyy sivun päivityksen yli', async ({ page }) => {
    await expect(page.locator('button:has-text("Näytä kaikki")')).toBeVisible({ timeout: 10000 });
    await page.click('button:has-text("Näytä kaikki")');
    await expect(page.locator('button:has-text("Vain tänään")')).toBeVisible();

    await page.reload();
    await expect(page.locator('button:has-text("Vain tänään")')).toBeVisible({ timeout: 10000 });
  });
});
