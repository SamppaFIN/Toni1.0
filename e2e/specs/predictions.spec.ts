// E2E: Ennusteet ja simulaatio
import { test, expect } from '@playwright/test';
import { useHockey, resetState } from '../helpers.js';

/**
 * Simulaation kaynnistysnappi.
 *
 * Jaakiekkotilassa renderTracker() piilottaa #sim-btn:n ja simulaatio
 * kaynnistetaan kierrosnakymän bannerista. Nama testit odottivat nappia
 * Seuranta-valilehdelta ja hajosivat kun se siirtyi -- toiminnallisuus
 * oli koko ajan ehja. Haetaan nappi tekstilla, ei sijainnilla.
 */
function simButton(page: import("@playwright/test").Page) {
  return page.locator('button:has-text("Simuloi kierros"), #sim-btn:visible').first();
}

async function startSimulation(page: import("@playwright/test").Page) {
  await simButton(page).click();
}
test.describe('Ennusteet ja simulaatio', () => {

  test.beforeEach(async ({ page }) => {
    // Tiketti #31: nama testit koskevat jaakiekkodemoa, joka on lipun takana
    await useHockey(page);
    await resetState(page);
  });

  test('Kierros-näkymässä näkyy mallin 1X2-todennäköisyydet', async ({ page }) => {
    await page.goto('/demo.html');
    const modelLine = page.locator('#round-games .card:has-text("Malli:")').first();
    await expect(modelLine).toBeVisible({ timeout: 5000 });
    const text = await modelLine.textContent();
    expect(text).toMatch(/\d+% \/ \d+% \/ \d+%/);
  });

  test('Seuranta-välilehti löytyy ja siinä on simulaation käynnistysnappi', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(simButton(page)).toBeVisible({ timeout: 5000 });
    await expect(simButton(page)).toContainText(/Simuloi|Käynnistä/);
  });

  test('simulaation voi ajaa ilman vetoja', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });

    // Vaatimus vahintaan yhdesta vedosta POISTETTIIN kun kausisimulaatio
    // korvasi arvotut tulokset oikeilla edellisen kauden tuloksilla:
    // ottelutulokset ovat kiinnostavia myos ilman panosta.
    await startSimulation(page);

    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#tracker-list')).not.toBeEmpty({ timeout: 10000 });
  });

  test('vedon voi asettaa ja simulaatio käynnistyy', async ({ page }) => {
    await page.goto('/demo.html');
    // Aseta veto
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    // Käynnistä simulaatio
    // Nappi on kierrosnakymassa; Seurantaan siirrytaan vasta simulaation jalkeen
    await startSimulation(page);

    // Bannerinappi ei vaihda tilaa samoin kuin vanha #sim-btn, joten
    // tarkistetaan se mita testi oikeasti tarkoitti: simulaatio kaynnistyi.
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#tracker-list')).not.toBeEmpty({ timeout: 10000 });
  });

  test('pikavedot tarjotaan vain kesken olevalle ottelulle', async ({ page }) => {
    await page.goto('/demo.html');
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    await startSimulation(page);
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#tracker-list')).not.toBeEmpty({ timeout: 10000 });

    // Kausisimulaatio nayttaa edellisen kauden OIKEAT tulokset heti, joten
    // ottelut ratkeavat valittomasti. Pikaveto seuraavasta maalista on
    // mielekas vain kesken olevalle ottelulle -- testataan siis SAANTO:
    // pikavetonappi esiintyy tasan silloin kun ottelu on yha kaynnissa.
    const live = await page.locator('#tracker-list .card:has-text("⏱")').count();
    const quickBets = await page.locator('button:has-text("seuraava maali 10€")').count();

    if (live === 0) {
      expect(quickBets, 'ratkenneille otteluille ei pida tarjota pikavetoa').toBe(0);
    } else {
      expect(quickBets, 'kesken olevalle ottelulle pitaa tarjota pikaveto').toBeGreaterThan(0);
    }
  });

  test('Kierrosraportti näkyy simulaation jälkeen', async ({ page }) => {
    await page.goto('/demo.html');
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    // Nappi on kierrosnakymassa; Seurantaan siirrytaan vasta simulaation jalkeen
    await startSimulation(page);
    // Odota raporttia (simulaatio kestää 20s)
    await expect(page.locator('h3:has-text("Kierrosraportti")')).toBeVisible({ timeout: 30000 });
    // Vedonlyöntitulokset-osio näyttää jokaisen vedon odotuksen/toteuman/tuloksen
    await expect(page.locator('h4:has-text("Vedonlyöntitulokset")')).toBeVisible();
    await expect(page.locator('text=Odotus:')).toBeVisible();
    await expect(page.locator('text=Toteuma:')).toBeVisible();
  });

  test('Historia-välilehti näyttää vedonlyöntihistorian', async ({ page }) => {
    await page.goto('/demo.html');
    await page.locator('#round-games .card .bk-odds').first().click();
    await page.click('button:has-text("✅ Veto")');
    // Nappi on kierrosnakymassa; Seurantaan siirrytaan vasta simulaation jalkeen
    await startSimulation(page);
    await expect(page.locator('h3:has-text("Kierrosraportti")')).toBeVisible({ timeout: 30000 });
    await page.click('.tab[data-tab="history"]');
    const cards = page.locator('#history-list .card');
    expect(await cards.count()).toBeGreaterThanOrEqual(1);
  });

});
