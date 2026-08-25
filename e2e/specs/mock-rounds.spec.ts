// E2E: Harjoituskierrokset (tiketti #37)
//
// Viisi valmiiksi generoitua kierrosta, joiden kertoimet on johdettu kauden
// oikeista Elo-luvuista. Tarkoitus: vetolappujen ja tappioketjujen testaaminen
// odottamatta oikeita otteluita.

import { test, expect, Page } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

/** Vaihda harjoitusdataan Admin-välilehdeltä ja palaa Kierrokseen */
async function enableMockRounds(page: Page) {
  await page.click('.tab[data-tab="admin"]');
  await page.click('#admin-content button:has-text("Harjoitus")');
  await expect(page.locator('#admin-content button:has-text("Harjoitus")')).toContainText('✓');
  await page.click('.tab[data-tab="round"]');
  await expect(page.locator('#round-games')).toContainText('Harjoituskierros');
}

test.describe('Harjoituskierrokset', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    // HUOM: bt_data_source ja bt_mock_round jätetään tarkoituksella
    // koskematta. addInitScript ajetaan JOKAISELLA navigoinnilla, myös
    // reloadilla, joten niiden tyhjentäminen siellä rikkoisi
    // säilyvyystestin. Playwright antaa joka testille tuoreen kontekstin,
    // joten localStorage on valmiiksi tyhjä.
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('oletuksena käytössä on oikea data, ei harjoitus', async ({ page }) => {
    await expect(page.locator('#round-games')).not.toContainText('Harjoituskierros');
    await page.click('.tab[data-tab="admin"]');
    await expect(page.locator('#admin-content button:has-text("Oikeat")')).toContainText('✓');
  });

  test('harjoitustilaan voi vaihtaa ja se näyttää kierroksen 1/5', async ({ page }) => {
    await enableMockRounds(page);
    await expect(page.locator('#round-games')).toContainText(/Harjoituskierros 1 \/ \d+/);
    // Harjoitusdata on aina merkitty, jottei sitä sekoita oikeisiin kertoimiin
    await expect(page.locator('#round-games')).toContainText('ESIMERKKIDATA');
  });

  test('kierroksella on kuusi ottelua ja kertoimia usealta toimistolta', async ({ page }) => {
    await enableMockRounds(page);
    // banneri + kierrosnavigaatio + 6 ottelukorttia
    expect(await page.locator('#round-games .card').count()).toBe(8);
    expect(await page.locator('#round-games .bk-odds').count()).toBeGreaterThan(50);
  });

  test('kertoimien peruste kerrotaan läpinäkyvästi analyysiosiossa', async ({ page }) => {
    await enableMockRounds(page);
    const card = page.locator('#round-games .card').nth(2);
    await card.locator('button:has-text("Analyysi")').click();
    await expect(card).toContainText('Elo');
  });

  test('vedon voi asettaa harjoituskierroksella', async ({ page }) => {
    await enableMockRounds(page);
    await page.locator('#round-games .bk-odds').first().click();
    const popup = page.locator('[id^="fbetpop-"]:visible');
    await popup.locator('input[type="number"]').fill('10');
    await popup.locator('button:has-text("Veto")').click();

    await expect(page.locator('#bankroll-display')).toContainText('90.00');
    await expect(page.locator('#slip-count')).toContainText('(1)');
  });

  test('kierroksesta toiseen: otteluparit vaihtuvat', async ({ page }) => {
    await enableMockRounds(page);
    const round1 = await page.locator('#round-games').innerText();

    await page.click('button:has-text("Seuraava kierros")');
    await expect(page.locator('#round-games')).toContainText(/Harjoituskierros 2 \/ \d+/);
    const round2 = await page.locator('#round-games').innerText();

    expect(round2).not.toBe(round1);
  });

  test('viimeisellä kierroksella tarjotaan aloitus alusta, ei seuraavaa', async ({ page }) => {
    await enableMockRounds(page);

    // Klikataan loppuun asti sen sijaan etta oletettaisiin kierrosten maara.
    // Harjoitusdata kasvoi 5 -> 23 kierrokseen, ja kovakoodattu luku hajotti
    // taman testin vaikka navigointi toimi taysin oikein.
    const guard = 60;
    for (let i = 0; i < guard; i++) {
      const next = page.locator('button:has-text("Seuraava kierros")');
      if ((await next.count()) === 0) break;
      await next.first().click();
      await page.waitForTimeout(250);
    }

    // Viimeisella kierroksella numero ja kokonaismaara ovat samat
    const text = (await page.locator('#round-games').textContent()) ?? '';
    const m = text.match(/Harjoituskierros (\d+) \/ (\d+)/);
    expect(m, 'kierrosnumeroa ei loytynyt').not.toBeNull();
    expect(m![1], 'pitaisi olla viimeisella kierroksella').toBe(m![2]);
    await expect(page.locator('button:has-text("Seuraava kierros")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Aloita kierrokset alusta")')).toBeVisible();

    await page.click('button:has-text("Aloita kierrokset alusta")');
    await expect(page.locator('#round-games')).toContainText(/Harjoituskierros 1 \/ \d+/);
  });

  test('kierros säilyy sivun päivityksen yli', async ({ page }) => {
    await enableMockRounds(page);
    await page.click('button:has-text("Seuraava kierros")');
    await expect(page.locator('#round-games')).toContainText(/Harjoituskierros 2 \/ \d+/);

    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.locator('#round-games')).toContainText(/Harjoituskierros 2 \/ \d+/);
  });

  test('avoin veto säilyy kierroksen vaihtuessa — ketjua voi jahdata eteenpäin', async ({ page }) => {
    await enableMockRounds(page);
    await page.locator('#round-games .bk-odds').first().click();
    const popup = page.locator('[id^="fbetpop-"]:visible');
    await popup.locator('input[type="number"]').fill('10');
    await popup.locator('button:has-text("Veto")').click();
    await expect(page.locator('#slip-count')).toContainText('(1)');

    await page.click('button:has-text("Seuraava kierros")');
    await expect(page.locator('#round-games')).toContainText(/Harjoituskierros 2 \/ \d+/);

    // Veto ei katoa — se on koko harjoituksen pointti
    await expect(page.locator('#slip-count')).toContainText('(1)');
  });

  test('simulaatio toimii harjoituskierroksella ja ratkaisee vedon', async ({ page }) => {
    // Tiketti #78: simulaationapit ovat oletuksena piilossa. Kytketaan ne
    // paalle SAMAA POLKUA kuin kayttaja -- Admin-valilehden togglesta.
    // localStorage-tynka ei kelpaisi tassa: beforeEach on jo navigoinut,
    // joten addInitScript ei enaa ajaudu.
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Simulaatio")');
    await enableMockRounds(page);
    await page.locator('#round-games .bk-odds').first().click();
    const popup = page.locator('[id^="fbetpop-"]:visible');
    await popup.locator('input[type="number"]').fill('10');
    await popup.locator('button:has-text("Veto")').click();

    await page.click('.tab[data-tab="tracker"]');
    await page.click('#sim-btn');
    await page.waitForFunction(() => document.getElementById('sim-btn')!.textContent!.includes('uudelleen'), null, {
      timeout: 45000,
    });

    await expect(page.locator('#tracker-list')).toContainText('Kierrosraportti');
    // Veto ratkesi: vetolappu on tyhjä
    await expect(page.locator('#slip-count')).toHaveText('');
  });

  test('takaisin oikeaan dataan poistaa kierrosnavigaation', async ({ page }) => {
    await enableMockRounds(page);
    await page.click('.tab[data-tab="admin"]');
    await page.click('#admin-content button:has-text("Oikeat")');
    await page.click('.tab[data-tab="round"]');

    await expect(page.locator('#round-games')).not.toContainText('Harjoituskierros');
    await expect(page.locator('#round-games')).toContainText('Päivän kohteet');
  });
});
