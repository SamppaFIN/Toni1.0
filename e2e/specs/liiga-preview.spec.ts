// Tiketti #103: Liigan avauskierros kortilla
//
// Kolme asiaa joita käyttäjä ei nähnyt ja jotka tämä lukitsee:
//
//   1. LÄHTÖ-ELO joukkueen nimen perässä. Luku oli laskettu oikein koko
//      ajan, mutta se ei päätynyt kortille asti: tyhjä kausi ei ollut
//      `null`, joten kausiennakon varareitti ei ajanut ja `stats` jäi
//      nulliksi. Ks. src/__tests__/liiga-empty-season.test.ts.
//   2. ENNAKON PLUSSAT JA MIINUKSET. Ne olivat snapshotissa, mutta vain
//      Analyysi-osion perustelutekstissä yhtenä pilkkuluettelona.
//   3. VEIKKAUKSEN KERTOIMET. Ne eivät tule rajapinnasta lainkaan, joten
//      suomalainen käyttäjä vertaili hintoja joita hän ei voi pelata.

import { test, expect } from '@playwright/test';
import { useLiigaFixture, resetState } from '../helpers.js';

test.describe('Liigan avauskierros', () => {
  test.beforeEach(async ({ page }) => {
    await useLiigaFixture(page);
    await resetState(page);
    await page.goto('/demo.html');
  });

  const liigaCard = (page: import('@playwright/test').Page) =>
    page.locator('#round-games .card').filter({ hasText: 'Jukurit' }).filter({ hasText: 'Liiga' }).first();

  test('lähtö-Elo näkyy joukkueiden nimissä', async ({ page }) => {
    const card = liigaCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });

    // Merkitty lähtötasoksi eikä mitatuksi: kausi ei ole alkanut
    await expect(card).toContainText('1380');
    await expect(card).toContainText('1455');
    await expect(card.locator('.matchup')).toContainText('lahtotaso');
  });

  test('ennakon plussat ja miinukset näkyvät ILMAN osion avaamista', async ({ page }) => {
    const card = liigaCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });
    // Nappi ei ole nakymista: karjet ovat kortilla suoraan
    await expect(card).toContainText('Altavastaajan mentaliteetti');
    await expect(card).toContainText('Materiaali Liigan heikoin');
  });

  test('Ennakko-osio avaa koko listan ja lähteen', async ({ page }) => {
    const card = liigaCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });

    await card.getByRole('button', { name: /Ennakko/ }).click();

    // Kaikki kohdat, ei vain ensimmainen
    await expect(card).toContainText('kapea rosteri');
    await expect(card).toContainText('putoamisuhka vakava');
    await expect(card).toContainText('ennakon sija #17');
    await expect(card).toContainText('lähtö-Elo 1380');

    // Lahde nakyviin: yhden toimituksen arvio on merkittava sellaiseksi
    const lahde = card.locator('a[href*="ristikaksi.com"]');
    await expect(lahde).toBeVisible();
    await expect(card).toContainText('ei mittaus');
  });

  test('Veikkauksen kerroin on listalla ja merkitty käsin syötetyksi', async ({ page }) => {
    const card = liigaCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });

    const rivi = card.locator('.odds-row').filter({ hasText: 'Veikkaus' });
    await expect(rivi).toBeVisible();
    await expect(rivi).toContainText('✍️');
    await expect(rivi).toContainText('2.82');
    await expect(rivi).toContainText('3.75');
    await expect(rivi).toContainText('2.37');
  });

  test('Veikkauksen nimi vie Veikkauksen kerroinsivulle', async ({ page }) => {
    const card = liigaCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });

    const linkki = card.locator('.odds-row').filter({ hasText: 'Veikkaus' }).locator('a.bk-link');
    await expect(linkki).toHaveAttribute('href', /^https:\/\/www\.veikkaus\.fi\//);
    await expect(linkki).toHaveAttribute('target', '_blank');
    await expect(linkki).toHaveAttribute('rel', /noopener/);

    // EI syvalinkkimerkkia: kasisyotto vie kerroinsivulle, ei tahan otteluun.
    // Vaarin luvattu syvalinkki olisi pahempi kuin rehellinen etusivulinkki.
    await expect(linkki).not.toContainText('↗');
  });

  test('käsin syötetty hinta on mukana analyysissä, ei vain listassa', async ({ page }) => {
    const card = liigaCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });

    // Jokainen ruutu saa oman odotusarvonsa (tiketti #88). Jos Veikkauksen rivi
    // olisi vain naytos, sen ruuduissa ei olisi prosenttilukua.
    const ruudut = card.locator('.odds-row').filter({ hasText: 'Veikkaus' }).locator('.bk-odds .ev');
    await expect(ruudut).toHaveCount(3);

    // Selite kertoo mita merkki tarkoittaa
    await expect(card).toContainText('käsin syötetty hinta');
  });

  test('kerrointa voi klikata vedon asettamiseksi kuten muitakin', async ({ page }) => {
    const card = liigaCard(page);
    await expect(card).toBeVisible({ timeout: 10000 });

    const nappi = card.locator('.odds-row').filter({ hasText: 'Veikkaus' }).locator('button.bk-odds').first();
    await nappi.click();
    await expect(card.locator('[id^="fbetpop-"]')).toContainText('Veikkaus');
  });
});
