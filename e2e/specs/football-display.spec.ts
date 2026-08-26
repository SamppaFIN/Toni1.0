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

  test('Elo-luku näkyy suluissa joukkueen nimen perässä', async ({ page }) => {
    const matchup = page.locator('#round-games .card').nth(2).locator('.matchup');
    // Molemmille joukkueille oma luku sulkeissa, muutosnuoli mukana
    await expect(matchup).toContainText(/\(1[3-6]\d\d[▲▼·]\d+\)/);
    const parens = await matchup.locator('span[title*="Kauden Elo"]').count();
    expect(parens).toBe(2);
  });

  test('Elo-ero ja odotusarvo näkyvät omalla rivillään', async ({ page }) => {
    const card = page.locator('#round-games .card').nth(2);
    await expect(card).toContainText('Elo-ero');
    await expect(card).toContainText('odotusarvo');
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
    const plainBest = page.locator('#round-games .bk-odds.best:not(.value-strong):not(.value-candidate):not(.value-elite)').first();
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

  test('jokaisen ruudun väri seuraa sen OMAA odotusarvoa (tiketti #88)', async ({ page }) => {
    // Aiemmin tässä verrattiin värillisten ruutujen määrää snapshotin
    // lippujen määrään. Se lukitsi väärän säännön: lippu lasketaan pelkästä
    // parhaasta hinnasta, joten 10.00 sai värin ja saman kohteen 9.80 ei.
    // Nyt odotus lasketaan ruutu kerrallaan samalla kaavalla kuin kortilla.
    const expected = await page.evaluate(() => {
      type Row = { bookmaker: string; home: number; draw: number; away: number; commission: number };
      type Match = {
        odds: Row[];
        analysis: { edges: Array<{ side: 'home' | 'draw' | 'away'; model_prob: number }> };
      };
      const snap = (window as unknown as { BTF: { getSnapshot: () => { matches: Match[] } } }).BTF.getSnapshot();
      const eff = (odds: number, commission: number) => (odds > 1 ? 1 + (odds - 1) * (1 - commission) : odds);

      let colored = 0;
      let cells = 0;
      for (const m of snap.matches) {
        const probs = new Map(m.analysis.edges.map((e) => [e.side, e.model_prob]));
        for (const row of m.odds) {
          for (const side of ['home', 'draw', 'away'] as const) {
            cells++;
            const p = probs.get(side) ?? 0;
            if (p > 0 && p * eff(row[side], row.commission) - 1 > 0.03) colored++;
          }
        }
      }
      return { colored, cells };
    });

    // Fikstuuri on olemassa juuri tämän takia — jos siinä ei ole yhtään
    // ylikerrointa, testi menisi läpi tyhjänä
    expect(expected.colored).toBeGreaterThan(0);
    const painted = await page.locator(
      '#round-games .bk-odds.value-candidate, #round-games .bk-odds.value-strong, #round-games .bk-odds.value-elite'
    ).count();
    expect(painted).toBe(expected.colored);
    expect(await page.locator('#round-games .bk-odds').count()).toBe(expected.cells);
  });

  test('ruudussa näkyy oma odotusarvoprosentti', async ({ page }) => {
    // Väri ilman lukua jättäisi käyttäjän arvaamaan miksi ruutu on keltainen
    const first = page.locator('#round-games .bk-odds').first();
    await expect(first.locator('.ev')).toBeVisible();
    await expect(first.locator('.ev')).toContainText('%');
  });

  test('selite kertoo että tähti ei tarkoita kannattavaa vetoa', async ({ page }) => {
    await expect(page.locator('#round-games')).toContainText('ei tarkoita että veto kannattaa');
  });
});

test.describe('Value-tieto joka kortilla', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('jokainen ottelukortti kertoo value-tilanteensa avaamatta analyysia', async ({ page }) => {
    const cards = page.locator('#round-games .card');
    const count = await cards.count();
    for (let i = 1; i < count; i++) {
      const text = await cards.nth(i).innerText();
      // Joko nimetty value-kohde tai selvä "ei kohdetta" — ei hiljaista tyhjää
      expect(text.includes('edge') || text.includes('Ei value-kohdetta')).toBe(true);
    }
  });

  test('value-kortti nimeää kohteen, kertoimen, toimiston ja panoksen', async ({ page }) => {
    // Fixtuurin vahva kohde: Inter Turku 1 @ 1.48 NordicBet
    const card = page.locator('#round-games .card').filter({ hasText: 'Inter Turku' });
    await expect(card).toContainText('Inter Turku');
    await expect(card).toContainText('1.48');
    await expect(card).toContainText('NordicBet');
    await expect(card).toContainText('edge');
    await expect(card).toContainText('panos');
  });

  test('ilman value-kohdetta kortti sanoo sen suoraan ja perustelee', async ({ page }) => {
    const card = page.locator('#round-games .card').filter({ hasText: 'Arsenal' });
    await expect(card).toContainText('Ei value-kohdetta');
    await expect(card).toContainText('alle 3 %:n kynnyksen');
    await expect(card).toContainText('panossuositusta ei anneta');
    // Panossuositusta euroina ei tarjota — se on value-rivin muoto
    await expect(card).not.toContainText('· panos');
  });
});

test.describe('Välilehtipalkki', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
  });

  test('kaikki välilehdet ovat näkyvissä kapealla ruudulla', async ({ page }) => {
    // Aiemmin palkki vieri vaakasuunnassa ja Admin jäi reunan taakse ilman
    // vihjettä — asetukset olivat löytymättömissä puhelimella
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });

    const bar = await page.locator('#tab-bar').boundingBox();
    const tabs = page.locator('.tab:visible');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(7);

    for (let i = 0; i < count; i++) {
      const box = await tabs.nth(i).boundingBox();
      const label = await tabs.nth(i).innerText();
      expect(box, `välilehdellä ${label} ei ole mittoja`).not.toBeNull();
      expect(box!.x, `${label} alkaa palkin vasemmalta puolelta`).toBeGreaterThanOrEqual(bar!.x - 1);
      expect(box!.x + box!.width, `${label} jää palkin oikean reunan taakse`).toBeLessThanOrEqual(bar!.x + bar!.width + 1);
    }
  });

  test('Admin-välilehti on klikattavissa suoraan ilman vieritystä', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });

    await page.locator('.tab[data-tab="admin"]').click({ timeout: 3000 });
    await expect(page.locator('#admin-content')).toContainText('Teema');
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
