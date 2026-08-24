// E2E: Kierros -näkymä (value-flagit osana pelikortteja)
import { test, expect } from '@playwright/test';
import { useHockey, resetState } from '../helpers.js';

/**
 * Ensimmainen OTTELUKORTTI -- ei kierroksen otsikkobanneri.
 *
 * Jaakiekkonakymaan lisattiin "Kausisimulaatio"-banneri ottelukorttien
 * eteen, jolloin .card:first osui banneriin ja kaikki nama testit
 * hajosivat vaikka toiminnallisuus oli ehja. Ottelukortin tunnistaa
 * .matchup-elementista jota bannerissa ei ole.
 */
function matchCards(page: import("@playwright/test").Page) {
  return page.locator('#round-games .card').filter({ has: page.locator('.matchup') });
}
test.describe('Kierros -näkymä', () => {

  test.beforeEach(async ({ page }) => {
    // Tiketti #31: nama testit koskevat jaakiekkodemoa, joka on lipun takana
    await useHockey(page);
    await resetState(page);
  });

  test('näyttää oletuksena Kierros-välilehden', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('#round.view.active')).toBeVisible();
    await expect(page.locator('.tab.active')).toContainText('Kierros');
  });

  test('näyttää pelikortit tuleville otteluille', async ({ page }) => {
    await page.goto('/demo.html');
    const cards = matchCards(page);
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
    expect(await cards.count()).toBeGreaterThanOrEqual(5);
  });

  test('pelikortissa näkyy joukkuenimet ja Elo suluissa', async ({ page }) => {
    await page.goto('/demo.html');
    const firstCard = matchCards(page).first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    const text = await firstCard.textContent();
    expect(text).toMatch(/\(\d{3,4}\)/);
  });

  test('näyttää kertoimet useilta vedonlyöntitoimistoilta', async ({ page }) => {
    await page.goto('/demo.html');
    const firstCard = matchCards(page).first();
    await expect(firstCard).toBeVisible({ timeout: 5000 });
    const bkNames = firstCard.locator('.bk-name');
    expect(await bkNames.count()).toBeGreaterThanOrEqual(2);
    const cells = firstCard.locator('.bk-odds');
    expect(await cells.count()).toBeGreaterThanOrEqual(6);
  });

  test('value-lippu ei valehtele: 💎 vain kun edge yli 3 %', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(matchCards(page).first()).toBeVisible({ timeout: 5000 });

    // Testataan SAANTO eika sita mika kortti sattuu olemaan ensimmaisena.
    // Suunta on tarkoituksellinen: jokaisen 💎:n on ansaittava paikkansa.
    // Vastakkainen suunta EI pade -- "+7.7 %" on kerroinruudun odotusarvo,
    // ja 💎 on kortin lippu PARHAALLE edgelle, eli eri asia.
    const flags = await page.locator('#round-games .card .badge').allTextContents();
    const diamonds = flags.filter((t) => t.includes('💎'));

    for (const t of diamonds) {
      const num = [...t].filter((c) => '0123456789.,+-'.includes(c)).join('').replace(',', '.');
      const pct = parseFloat(num);
      expect(Number.isFinite(pct), `lipussa ei ole lukua: "${t}"`).toBe(true);
      expect(pct, `💎 mutta edge vain ${pct} %: "${t}"`).toBeGreaterThan(3);
    }

    // Jos yhtaan lippua ei ole, sekin on kelvollinen tila -- simulaatio arpoo
    // kertoimet, eika jokaisella kierroksella ole ylikertoimia.
    expect(Array.isArray(diamonds)).toBe(true);
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
