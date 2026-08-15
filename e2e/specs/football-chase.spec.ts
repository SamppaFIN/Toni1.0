// E2E: Tappioketju (Martingale-jahtaus, tiketti #35)
//
// Kolmen häviön ketju: 10 € → 20 € → 40 € → (80 € estetty stop-lossilla).
// Kassa alkaa 100 €:sta, joten jokainen vaihe on tarkistettavissa laskien.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

test.describe('Tappioketju', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.addInitScript(() => localStorage.removeItem('bt_chase_chains'));
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="chase"]');
  });

  test('välilehti on näkyvissä jalkapallotilassa ja varoittaa mekaniikasta', async ({ page }) => {
    const view = page.locator('#chase-content');
    await expect(view).toContainText('Martingale');
    await expect(view).toContainText('riskialtis');
    await expect(view).toContainText('Aloita tappioketju');
  });

  test('panosmoodin selite näkyy oletuksena', async ({ page }) => {
    await expect(page.locator('#chase-content')).toContainText('Panos kaksinkertaistuu');
  });

  test('kerroinmoodiin vaihto muuttaa selitteen', async ({ page }) => {
    await page.click('button:has-text("Tuplaa kerroin")');
    await expect(page.locator('#chase-content')).toContainText('Kertoimen pitää tuplaantua');
  });

  test('ketjun voi aloittaa ja kassa vähenee panoksen verran', async ({ page }) => {
    await page.locator('[data-chase-side="home"]').click();
    await page.locator('#chase-stake').fill('10');
    await page.click('button:has-text("Aloita ketju")');

    await expect(page.locator('#bankroll-display')).toContainText('90.00');
    await expect(page.locator('#chase-content')).toContainText('Aktiivinen tappioketju');
  });

  test('koko ketju: 10 → 20 → 40 → stop-loss → luovutus, kassa 100 → 30', async ({ page }) => {
    // Aloitus: 10 €
    await page.locator('[data-chase-side="home"]').click();
    await page.locator('#chase-stake').fill('10');
    await page.click('button:has-text("Aloita ketju")');
    await expect(page.locator('#bankroll-display')).toContainText('90.00');

    // Häviö #1 → vaadittu jatko 20 €
    await page.click('button:has-text("❌ Häviö")');
    await expect(page.locator('#chase-content')).toContainText('20.00');
    await expect(page.locator('button:has-text("Stop-loss")')).toHaveCount(0);

    await page.selectOption('#chase-cont-match', { index: 1 });
    await page.locator('[data-chase-cont-side="away"]').click();
    await page.locator('#chase-cont-odds').fill('2.10');
    await page.click('button:has-text("Aseta jatkoveto")');
    await expect(page.locator('#bankroll-display')).toContainText('70.00'); // 90 − 20

    // Häviö #2 → vaadittu jatko 40 € (4× — vielä sallittu)
    await page.click('button:has-text("❌ Häviö")');
    await expect(page.locator('#chase-content')).toContainText('40.00');
    await expect(page.locator('#chase-content')).not.toContainText('Stop-loss saavutettu');

    await page.selectOption('#chase-cont-match', { index: 0 });
    await page.locator('[data-chase-cont-side="draw"]').click();
    await page.locator('#chase-cont-odds').fill('2.00');
    await page.click('button:has-text("Aseta jatkoveto")');
    await expect(page.locator('#bankroll-display')).toContainText('30.00'); // 70 − 40

    // Häviö #3 → seuraava olisi 80 € = yli 4× → stop-loss
    await page.click('button:has-text("❌ Häviö")');
    const view = page.locator('#chase-content');
    await expect(view).toContainText('Stop-loss saavutettu');
    await expect(page.locator('button:has-text("Aseta jatkoveto")')).toHaveCount(0);
    await expect(page.locator('#chase-cont-match')).toHaveCount(0);

    // Luovutus ei veloita kassaa enempää
    await page.click('button:has-text("Luovuta — kirjaa tappio")');
    await expect(page.locator('#bankroll-display')).toContainText('30.00');
    await expect(view).toContainText('Aiemmat ketjut');
    await expect(view).toContainText('Luovutettu');
    await expect(view).toContainText('-70.00'); // 10+20+40 hävitty
  });

  test('voitto missä tahansa vaiheessa sulkee ketjun voittona ja kuittaa tappiot', async ({ page }) => {
    await page.locator('[data-chase-side="home"]').click();
    await page.locator('#chase-stake').fill('10');
    await page.click('button:has-text("Aloita ketju")');

    await page.click('button:has-text("❌ Häviö")');
    await page.selectOption('#chase-cont-match', { index: 1 });
    await page.locator('[data-chase-cont-side="away"]').click();
    await page.locator('#chase-cont-odds').fill('3.00'); // 20 € @ 3.00 → palautus 60 €
    await page.click('button:has-text("Aseta jatkoveto")');

    const kassaEnnen = await page.locator('#bankroll-display').innerText(); // 70.00
    await page.click('button:has-text("✅ Voitto")');

    // 70 (jäljellä) + 60 (palautus) = 130, mutta kassa oli jo vähennetty 20:llä
    // kun veto asetettiin, joten voitto lisää koko payoutin: 70 + 60 = 130
    await expect(page.locator('#bankroll-display')).toContainText('130.00');
    expect(kassaEnnen).toContain('70.00');

    const view = page.locator('#chase-content');
    await expect(view).toContainText('Aloita tappioketju'); // uusi lomake heti näkyvissä
    await expect(view).toContainText('Aiemmat ketjut');
    await expect(view).toContainText('Voitettu');
    await expect(view).toContainText('+30.00'); // netto: 60 palautus − (10+20) sijoitettu
  });

  test('luovuttaminen kesken ketjun (ennen stop-lossia) on mahdollista', async ({ page }) => {
    await page.locator('[data-chase-side="home"]').click();
    await page.locator('#chase-stake').fill('10');
    await page.click('button:has-text("Aloita ketju")');
    await page.click('button:has-text("❌ Häviö")');

    await expect(page.locator('button:has-text("Luovuta tässä")')).toBeVisible();
    await page.click('button:has-text("Luovuta tässä")');

    await expect(page.locator('#bankroll-display')).toContainText('90.00'); // ei enää vetoja
    await expect(page.locator('#chase-content')).toContainText('Luovutettu');
    await expect(page.locator('#chase-content')).toContainText('-10.00');
  });

  test('"Aloita alusta" tyhjentää myös tappioketjut', async ({ page }) => {
    await page.locator('[data-chase-side="home"]').click();
    await page.locator('#chase-stake').fill('10');
    await page.click('button:has-text("Aloita ketju")');

    await page.click('#reset-header-btn');
    await page.waitForTimeout(500);

    expect(await page.evaluate(() => localStorage.getItem('bt_chase_chains'))).toBeNull();
    await page.click('.tab[data-tab="chase"]');
    await expect(page.locator('#chase-content')).toContainText('Aloita tappioketju');
    await expect(page.locator('#chase-content')).not.toContainText('Aktiivinen tappioketju');
  });

  test('vain yksi ketju voi olla aktiivinen kerrallaan — aloituslomake piilotetaan', async ({ page }) => {
    await page.locator('[data-chase-side="home"]').click();
    await page.locator('#chase-stake').fill('10');
    await page.click('button:has-text("Aloita ketju")');

    // Aktiivisen ketjun aikana ei näytetä uutta aloituslomaketta
    await expect(page.locator('button:has-text("Aloita ketju")')).toHaveCount(0);
  });
});
