// E2E: Elo kortilla, laskentaerittely, näyttöasetukset ja kerroinvärit
// (tiketti #39)

import { test, expect, Page } from '@playwright/test';
import { useFootball, resetState, useFixtureSnapshot } from '../helpers.js';

async function openSection(page: Page, cardIndex: number, label: string) {
  const card = page.locator('#round-games .card').nth(cardIndex);
  await card.locator(`button:has-text("${label}")`).click();
  return card;
}

/** Käännä yksi näyttöasetus ja palaa Kierrokseen */
async function toggleDisplay(page: Page, label: string) {
  await page.click('.tab[data-tab="admin"]');
  await page.locator(`#admin-content button:has-text("${label}")`).first().click();
  await page.click('.tab[data-tab="round"]');
}

test.describe('Elo ja laskentaerittely', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('kortilla näkyy molempien joukkueiden Elo-luku ja ero', async ({ page }) => {
    const card = page.locator('#round-games .card').nth(2);
    await expect(card).toContainText('Elo');
    // Elo-luvut ovat neljä numeroa 1500:n molemmin puolin
    await expect(card).toContainText(/1[3-6]\d\d/);
    await expect(card).toContainText('ero');
  });

  test('Elo-luvut näkyvät myös tunnuslukuosiossa', async ({ page }) => {
    const card = await openSection(page, 2, 'Tunnusluvut');
    await expect(card).toContainText('kauden Elo');
  });

  test('laskentaosio näyttää jokaisen välivaiheen kaavoineen', async ({ page }) => {
    // Laskenta on oletuksena pois päältä — se on pitkä
    await expect(page.locator('#round-games .card').nth(2).locator('button:has-text("Laskenta")')).toHaveCount(0);
    await toggleDisplay(page, 'Laskennan vaiheet');

    const card = await openSection(page, 2, 'Laskenta');
    await expect(card).toContainText('Marginaalin poisto per toimisto');
    await expect(card).toContainText('Konsensus ja sharp-ankkuri');
    await expect(card).toContainText('Paras hinta komission jälkeen');
    await expect(card).toContainText('Edge');
    await expect(card).toContainText('Kelly-panos');
  });

  test('laskentaosio ei varoita tarkistuslaskun poikkeamasta', async ({ page }) => {
    await toggleDisplay(page, 'Laskennan vaiheet');
    // Käydään kaikki kortit läpi: jos selaimen edge-laskenta eroaisi
    // snapshotin luvusta, osio näyttäisi varoituksen
    const count = await page.locator('#round-games .card').count();
    for (let i = 2; i < count; i++) {
      const card = await openSection(page, i, 'Laskenta');
      await expect(card).not.toContainText('tarkistuslasku antaa');
    }
  });

  test('Elo-vaihe näkyy laskennassa kun Elo-luvut ovat saatavilla', async ({ page }) => {
    await toggleDisplay(page, 'Laskennan vaiheet');
    const card = await openSection(page, 2, 'Laskenta');
    await expect(card).toContainText('Elo-odotusarvo');
    await expect(card).toContainText('E = 1 / (1 + 10^');
  });
});

test.describe('Kerroinvärit erottavat parhaan hinnan ylikertoimesta', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('paras hinta ilman valueta saa tähden muttei väritaustaa', async ({ page }) => {
    // Tämä on se korjaus jota käyttäjä pyysi: aiemmin jokainen paras hinta
    // näytti vihreältä vaikka odotusarvo oli negatiivinen
    const plainBest = page.locator('#round-games .bk-odds.best:not(.value-strong):not(.value-candidate)').first();
    await expect(plainBest).toBeVisible();
    await expect(plainBest).toContainText('⭐');

    const bg = await plainBest.evaluate((el) => getComputedStyle(el).backgroundColor);
    // Läpinäkyvä tai täysin läpinäkyvä väri — ei täytettä
    expect(bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent').toBe(true);
  });

  test('ylikerroin saa väritaustan ja value-ikonin, ei tähteä', async ({ page }) => {
    const value = page.locator('#round-games .bk-odds.value-strong, #round-games .bk-odds.value-candidate').first();
    await expect(value).toBeVisible();
    await expect(value).not.toContainText('⭐');

    const bg = await value.evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg).not.toBe('rgba(0, 0, 0, 0)');
  });

  test('value-luokka on vain sillä ruudulla jolla edge ylittää kynnyksen', async ({ page }) => {
    // Snapshotin lippujen määrä ja värillisten ruutujen määrä täsmäävät
    const flagged = await page.evaluate(() => {
      const snap = (window as unknown as { BTF: { getSnapshot: () => { matches: Array<{ analysis: { edges: Array<{ flag: string }> } }> } } }).BTF.getSnapshot();
      return snap.matches.reduce((n, m) => n + m.analysis.edges.filter((e) => e.flag !== 'none').length, 0);
    });
    const colored = await page.locator('#round-games .bk-odds.value-strong, #round-games .bk-odds.value-candidate').count();
    expect(colored).toBe(flagged);
  });

  test('selite kertoo että tähti ei tarkoita kannattavaa vetoa', async ({ page }) => {
    await expect(page.locator('#round-games')).toContainText('ei tarkoita että veto kannattaa');
  });
});

test.describe('Näyttöasetukset', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('Elo-luvut voi piilottaa ja palauttaa', async ({ page }) => {
    await expect(page.locator('#round-games')).toContainText('📈 Elo');
    await toggleDisplay(page, 'Elo-luvut');
    await expect(page.locator('#round-games')).not.toContainText('📈 Elo');
    await toggleDisplay(page, 'Elo-luvut');
    await expect(page.locator('#round-games')).toContainText('📈 Elo');
  });

  test('kerroinvertailun voi piilottaa ilman että kortti hajoaa', async ({ page }) => {
    await toggleDisplay(page, 'Kerroinvertailu');
    await expect(page.locator('#round-games .bk-odds')).toHaveCount(0);
    // Kortit ovat yhä olemassa ja osiot toimivat
    await expect(page.locator('#round-games .card').nth(2)).toBeVisible();
    const card = await openSection(page, 2, 'Tunnusluvut');
    await expect(card).toContainText('sarjasija');
  });

  test('osion piilotus poistaa myös sen napin', async ({ page }) => {
    await expect(page.locator('#round-games button:has-text("Uutiset")').first()).toBeVisible();
    await toggleDisplay(page, 'Uutiset');
    await expect(page.locator('#round-games button:has-text("Uutiset")')).toHaveCount(0);
  });

  test('avoin osio sulkeutuu jos se piilotetaan asetuksista', async ({ page }) => {
    const card = await openSection(page, 2, 'Tunnusluvut');
    await expect(card).toContainText('sarjasija');
    await toggleDisplay(page, 'Tunnusluvut');
    await expect(page.locator('#round-games')).not.toContainText('sarjasija');
  });

  test('asetukset säilyvät sivun päivityksen yli', async ({ page }) => {
    await toggleDisplay(page, 'Todennäköisyyspalkki');
    await expect(page.locator('#round-games .progress-bar')).toHaveCount(0);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#round-games .progress-bar')).toHaveCount(0);
  });

  test('palauta oletukset tuo kaiken takaisin', async ({ page }) => {
    await toggleDisplay(page, 'Elo-luvut');
    await toggleDisplay(page, 'Uutiset');
    await expect(page.locator('#round-games')).not.toContainText('📈 Elo');

    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Palauta oletukset")');
    await page.click('.tab[data-tab="round"]');

    await expect(page.locator('#round-games')).toContainText('📈 Elo');
    await expect(page.locator('#round-games button:has-text("Uutiset")').first()).toBeVisible();
  });

  test('asetukset eivät muuta analyysin lukuja', async ({ page }) => {
    const before = await page.evaluate(() => {
      const snap = (window as unknown as { BTF: { getSnapshot: () => unknown } }).BTF.getSnapshot();
      return JSON.stringify(snap);
    });

    await toggleDisplay(page, 'Elo-luvut');
    await toggleDisplay(page, 'Analyysi');

    const after = await page.evaluate(() => {
      const snap = (window as unknown as { BTF: { getSnapshot: () => unknown } }).BTF.getSnapshot();
      return JSON.stringify(snap);
    });

    expect(after).toBe(before);
  });
});
