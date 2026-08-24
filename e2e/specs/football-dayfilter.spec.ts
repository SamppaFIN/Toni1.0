// E2E: Paivanavigointi kierrossivulla (tiketit #46, #60)
//
// Jaottelulogiikka on yksikkotestattu injektoidulla kellolla
// (football-dayfilter.test.ts), joten taalla ei tarkisteta otteluiden
// lukumaaria -- ne riippuisivat ajopaivasta ja testi lakastuisi hiljaa.
// Taalla todennetaan etta navigointi on kytketty renderointiin ja tila sailyy.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
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

test.describe('Paivanapit molemmissa teemoissa (tiketti #66)', () => {
  for (const theme of ['system', 'casino']) {
    test(`napit erottuvat taustasta teemalla "${theme}"`, async ({ page }) => {
      await useFootball(page);
      await resetState(page);
      await page.addInitScript((t) => localStorage.setItem('bt_ui_theme', t), theme);
      await page.goto('/demo.html');
      await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });

      const btn = page.locator('#round-games .day-btn').first();
      await expect(btn).toBeVisible();

      const style = await btn.evaluate((el) => {
        const cs = getComputedStyle(el);
        return { bg: cs.backgroundColor, border: cs.borderTopColor, width: cs.borderTopWidth };
      });

      // Aiemmin tausta oli kovakoodattu 8 % valkoista joka katosi kasino-teeman
      // gradientilla. Nyt napilla on sek\u00e4 lapinakymaton tausta etta reuna.
      expect(style.bg, 'napilla pitaa olla nakyva tausta').not.toBe('rgba(0, 0, 0, 0)');
      expect(parseFloat(style.width), 'napilla pitaa olla reuna').toBeGreaterThan(0);
      expect(style.border, 'reunan pitaa olla nakyva').not.toBe('rgba(0, 0, 0, 0)');
    });
  }

  test('aktiivinen nappi erottuu passiivisesta', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });

    const active = page.locator('#round-games .day-btn.active').first();
    const inactive = page.locator('#round-games .day-btn:not(.active)').first();
    const bg = (l: any) => l.evaluate((el: Element) => getComputedStyle(el).backgroundColor);

    expect(await bg(active)).not.toBe(await bg(inactive));
  });
});

test.describe('Tyhjan sivun varakeino (regressio #60)', () => {
  test('kierrosnakyma EI ole tyhja kun paivan ainoa ottelu on alkanut', async ({ page }) => {
    await useFootball(page);
    await resetState(page);

    // Fikstuuri levylta, kickoff tunti sitten -> ottelu on "alkanut"
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/snapshot-with-elo.json', import.meta.url), 'utf8')
    );
    fixture.generated_at = new Date().toISOString();
    fixture.matches = [{ ...fixture.matches[0], kickoff: new Date(Date.now() - 3600_000).toISOString() }];

    await page.route('**/data/today.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
    );
    await page.addInitScript(() => localStorage.removeItem('bt_football_day_filter'));
    await page.goto('/demo.html');

    // Paivasuodatin piilottaa alkaneet, mutta kun muuta ei ole, ne on
    // naytettava merkittyna. Tyhja sivu on aina huonompi kuin vanhentunut
    // kortti jonka vieressa lukee etta se on vanhentunut.
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText('alkaneet');
  });
});
