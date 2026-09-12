// E2E: Käsin syötetty ottelukonteksti kortilla (tiketti #105)
//
// Yksikkötestit lukitsevat laskennan: että λ siirtyy, että `lambda_base` on
// säätämätön luku ja että selain pääsee takaisin siihen. Ne EIVÄT voi todeta
// sitä mistä koko ominaisuus on olemassa:
//
//   1. Pillerit näkyvät kortilla ILMAN että mitään avataan. Käyttäjä pyysi
//      näkemistä, ei nappia joka lupaa että jossain on jotain.
//   2. Pois kytkeminen oikeasti MUUTTAA laskettua lukua. Jos ketju
//      UI → localStorage → uudelleenlaskenta → renderöinti katkeaa mistä
//      tahansa kohtaa, nappi näyttää silti toimivan.
//   3. Valinta säilyy sivun päivityksen yli. Muuten "olen eri mieltä" on
//      voimassa yhden klikkauksen ajan.
//
// KORTTI HAETAAN SISÄLLÖN PERUSTEELLA eikä `.first()`:llä. Kierrosnäkymä
// järjestää kortit alkamisajan mukaan, joten ensimmäinen kortti ei ole se
// jolle fikstuuri asetti kontekstin — ja `.first()` mittaisi väärää korttia
// tavalla joka näyttää testin omalta virheeltä vasta kun se kaatuu.

import { test, expect } from '@playwright/test';
import { useFootball, resetState, useContextFixture, useIsolatedArchives } from '../helpers.js';

const PILLERI = 'Neljä voittoa putkeen';

/** Se kortti jolle fikstuuri asetti kontekstin */
function contextCard(page: any) {
  return page.locator('#round-games .card').filter({ hasText: PILLERI }).first();
}

async function openSection(page: any, label: string) {
  const card = contextCard(page);
  await expect(card).toBeVisible({ timeout: 10000 });
  await card.locator(`button:has-text("${label}")`).first().click();
  return card;
}

/** λ jonka kerroinlaskuri laskee — sama moduuli jota kortti käyttää */
async function adjustedLambda(page: any, disabled: string[]) {
  return page.evaluate((off: string[]) => {
    const w = window as any;
    const m = w.BTF.getSnapshot().matches.find((x: any) => x.context);
    return w.BTF.calc.recalculate(m, [], 100, off).lambdaHome;
  }, disabled);
}

test.describe('Ottelukonteksti', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useIsolatedArchives(page);
    await useContextFixture(page);
    await page.goto('/demo.html');
  });

  test('pillerit näkyvät kortilla ilman että osiota avataan', async ({ page }) => {
    const card = contextCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText(PILLERI);
    await expect(card).toContainText('Uusi hankinta debytoi');
    await expect(card).toContainText('Kuusi tasapelia perakkain');
  });

  test('pilleri kertoo λ-vaikutuksensa prosentteina', async ({ page }) => {
    const card = contextCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });
    await expect(card).toContainText('+20 %');
    await expect(card).toContainText('+15 %');
  });

  test('Ennakko-osio avautuu ja näyttää lähteen linkkinä', async ({ page }) => {
    const card = await openSection(page, 'Ennakko');
    await expect(card).toContainText('Ottelukonteksti — käsin syötetty');
    await expect(card).toContainText('Taustatieto ilman lambda-vaikutusta');
    await expect(card.locator('a[href="https://example.test/putki"]').first()).toBeVisible();
  });

  test('kerroinlaskurissa jokainen pilleri on kytkettävissä pois', async ({ page }) => {
    const card = await openSection(page, 'Kerroinlaskuri');
    await expect(card).toContainText('Ottelukonteksti — käsin syötetty');
    await expect(card.locator('button:has-text("✓ mukana")')).toHaveCount(3);
  });

  test('POIS KYTKEMINEN MUUTTAA LUKUA — ja nappi vaihtaa tilaa', async ({ page }) => {
    const card = await openSection(page, 'Kerroinlaskuri');

    const ennen = await adjustedLambda(page, []);
    await card.locator('button:has-text("✓ mukana")').first().click();

    await expect(contextCard(page).locator('button:has-text("○ pois")')).toHaveCount(1);

    const jalkeen = await adjustedLambda(page, ['testi-voittoputki']);
    expect(jalkeen).toBeLessThan(ennen);
  });

  test('valinta säilyy sivun päivityksen yli', async ({ page }) => {
    const card = await openSection(page, 'Kerroinlaskuri');
    await card.locator('button:has-text("✓ mukana")').first().click();
    await expect(contextCard(page).locator('button:has-text("○ pois")')).toHaveCount(1);

    await page.reload();
    const uusi = await openSection(page, 'Kerroinlaskuri');
    await expect(uusi.locator('button:has-text("○ pois")')).toHaveCount(1);
  });

  test('«Ota kaikki takaisin» palauttaa kaikki pillerit', async ({ page }) => {
    await openSection(page, 'Kerroinlaskuri');

    await contextCard(page).locator('button:has-text("✓ mukana")').first().click();
    await contextCard(page).locator('button:has-text("✓ mukana")').first().click();
    await expect(contextCard(page).locator('button:has-text("○ pois")')).toHaveCount(2);

    await contextCard(page).locator('button:has-text("Ota kaikki")').first().click();
    await expect(contextCard(page).locator('button:has-text("✓ mukana")')).toHaveCount(3);
  });
});
