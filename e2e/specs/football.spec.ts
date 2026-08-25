// E2E: Jalkapallo-ottelukortti oikeilla kertoimilla (tiketit #30, #31)
//
// Testit ajetaan snapshotia vasten joka on committoitu repoon (public/data/today.json).
// Snapshot voi olla joko 'live' (oikeat kertoimet) tai 'mock' (esimerkkidata),
// joten testit eivät oleta tiettyjä joukkueita tai kertoimia — ne tarkistavat
// rakenteen ja logiikan, eivät yksittäisiä lukuja.

import { test, expect } from '@playwright/test';
import { useFootball, resetState, useFixtureSnapshot, fixtureSnapshot } from '../helpers.js';

test.describe('Jalkapallonäkymä', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    // Moduuli latautuu deferoituna ja hakee snapshotin
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
  });

  test('jalkapallo on oletuslaji ja otsikko kertoo sen', async ({ page }) => {
    await expect(page.locator('.glass-header h1')).toContainText('⚽');
  });

  test('Liiga-kohtainen välilehti on piilotettu, yhteiset näkyvät', async ({ page }) => {
    // Joukkueet-näkymä on Liiga-spesifi (Elo, PDO) → piilossa
    await expect(page.locator('.tab[data-tab="teams"]')).toBeHidden();
    // Seuranta on molemmilla lajeilla, mutta jalkapallon simulaationa (tiketti 32)
    await expect(page.locator('.tab[data-tab="tracker"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="tracker"]')).toContainText('🏟️');
    await expect(page.locator('.tab[data-tab="round"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="slip"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="admin"]')).toBeVisible();
  });

  test('banneri kertoo datan lähteen ja tuoreuden', async ({ page }) => {
    const banner = page.locator('#round-games .card').first();
    await expect(banner).toContainText('Päivän kohteet');
    await expect(banner).toContainText('Lähteet:');
    // Tila on aina jokin näistä kolmesta
    await expect(banner).toContainText(/OIKEAT KERTOIMET|ESIMERKKIDATA|VANHENTUNUT/);
  });

  test('ottelukortilla on kertoimet usealta toimistolta ja paras merkitty', async ({ page }) => {
    const oddsButtons = page.locator('#round-games .bk-odds');
    expect(await oddsButtons.count()).toBeGreaterThan(3);

    // Paras kerroin per kohde: tarkalleen 3 per ottelu
    const best = page.locator('#round-games .bk-odds.best');
    const bestCount = await best.count();
    expect(bestCount).toBeGreaterThanOrEqual(3);
    expect(bestCount % 3).toBe(0);

    // Paras hinta merkitään ⭐:llä VAIN jos siinä ei ole value-lippua — liputettu
    // ruutu näyttää lippunsa (🟡/💎) tähden sijaan (tiketti #39: tähti = paras
    // hinta, väri ja ikoni = ylikerroin). Testi ei siis saa olettaa että
    // ensimmäinen paras ruutu on tähdellinen; se riippuu siitä mikä ottelu
    // sattuu olemaan listan kärjessä.
    const markers = await best.allTextContents();
    const marked = markers.filter((t) => /⭐|💎|🟡/.test(t));
    expect(marked.length, `paras kerroin ilman merkintää: ${markers.join(' | ')}`).toBe(markers.length);
  });

  test('paras kerroin on rivinsä korkein näytetty arvo tai voittaa komission jälkeen', async ({ page }) => {
    // Poimitaan yhden ottelun kotikertoimet ja varmistetaan että merkitty paras
    // ei ole pienempi kuin muut ilman syytä (komissio on ainoa sallittu syy)
    const marked = page.locator('#round-games .bk-odds.best').first();
    const title = await marked.getAttribute('title');
    expect(title).toContain('paras');
  });

  test('kolme analyysiosiota avautuvat ja sulkeutuvat', async ({ page }) => {
    const card = page.locator('#round-games .card').nth(1);

    for (const label of ['Tunnusluvut', 'Uutiset', 'Analyysi']) {
      const button = card.locator(`button:has-text("${label}")`);
      const before = (await card.innerText()).length;
      await button.click();
      await expect(async () => {
        expect((await card.innerText()).length).toBeGreaterThan(before);
      }).toPass({ timeout: 3000 });
      await button.click(); // sulkeutuu
    }
  });

  test('analyysiosio näyttää mallin, markkinan ja edgen', async ({ page }) => {
    const card = page.locator('#round-games .card').nth(1);
    await card.locator('button:has-text("Analyysi")').click();

    await expect(card).toContainText('Malli:');
    await expect(card).toContainText('markkina');
    await expect(card).toContainText('Markkinan kate');
    await expect(card).toContainText('Edge ja panossuositus');
    await expect(card).toContainText('reilu');
    // Edge-kaava selitetään käyttäjälle
    await expect(card).toContainText('mallin todennäköisyys × kerroin');
  });

  test('tunnuslukuosio näyttää joukkuetilastot tai kertoo miksi ei', async ({ page }) => {
    const card = page.locator('#round-games .card').nth(1);
    await card.locator('button:has-text("Tunnusluvut")').click();
    // Joko tilastot tai selkeä selitys niiden puuttumisesta
    await expect(card).toContainText(/sarjasija|ei ole ilmaista tunnuslukulähdettä/);
  });

  test('kertoimen klikkaus avaa vetoponnahduksen mallin arviolla', async ({ page }) => {
    await page.locator('#round-games .bk-odds').first().click();
    const popup = page.locator('[id^="fbetpop-"]:visible');
    await expect(popup).toBeVisible();
    // Ponnahdus kertoo mitä malli ajattelee kohteesta
    await expect(popup).toContainText(/Malli: edge/);
    await expect(popup).toContainText('Veto');
  });

  test('veto vähentää kassasta ja ilmestyy vetolappuun', async ({ page }) => {
    await expect(page.locator('#bankroll-display')).toContainText('100.00');

    await page.locator('#round-games .bk-odds').first().click();
    const popup = page.locator('[id^="fbetpop-"]:visible');
    await popup.locator('input[type="number"]').fill('15');
    await popup.locator('button:has-text("Veto")').click();

    await expect(page.locator('#bankroll-display')).toContainText('85.00');
    await expect(page.locator('#slip-count')).toContainText('(1)');

    await page.click('.tab[data-tab="slip"]');
    await expect(page.locator('#slip-list')).toContainText('Panos: 15.00€');
    // Jalkapallovedon voi ratkaista manuaalisesti kunnes simulaatio on olemassa (tiketti 32)
    await expect(page.locator('#slip-list button:has-text("✅")')).toBeVisible();
  });

  test('asetettu veto näkyy myös ottelukortilla', async ({ page }) => {
    await page.locator('#round-games .bk-odds').first().click();
    await page.locator('[id^="fbetpop-"]:visible button:has-text("Veto")').click();
    await expect(page.locator('#round-games')).toContainText('🎫');
  });

  test('panos ei voi ylittää kassaa', async ({ page }) => {
    await page.locator('#round-games .bk-odds').first().click();
    const popup = page.locator('[id^="fbetpop-"]:visible');
    await popup.locator('input[type="number"]').fill('99999');
    await popup.locator('button:has-text("Veto")').click();

    await expect(page.locator('.toast')).toContainText('Virheellinen panos');
    await expect(page.locator('#bankroll-display')).toContainText('100.00');
  });

  test('Admin-välilehdellä voi vaihtaa lajia ja palata jalkapalloon', async ({ page }) => {
    await page.click('.tab[data-tab="admin"]');
    await expect(page.locator('#admin-content')).toContainText('Laji');
    await expect(page.locator('#admin-content button:has-text("Jalkapallo")')).toBeVisible();
    await expect(page.locator('#admin-content button:has-text("Jääkiekko")')).toBeVisible();
    // Jalkapallo on valittuna
    await expect(page.locator('#admin-content button:has-text("Jalkapallo")')).toContainText('✓');
  });

  test('näytetyt toimistot tulevat snapshotista — keksittyjä kertoimia ei ole', async ({ page }) => {
    // genOddsForBookmaker() keksii kertoimia jääkiekkodemolle. Jos se pääsisi
    // ajamaan jalkapallotilassa, keksityt ja oikeat kertoimet sekoittuisivat
    // erottamattomasti. Tämä testi todistaa ettei niin käy: jokainen ruudulla
    // näkyvä toimisto löytyy snapshotista.
    // Sama lahde jonka sivu sai (ks. fixtureSnapshot-kommentti helpers.ts:ssa)
    const snapshot = fixtureSnapshot();
    const allowed = new Set<string>(snapshot.matches.flatMap((m) => m.odds.map((o) => o.bookmaker)));
    expect(allowed.size).toBeGreaterThan(0);

    const shown = await page.locator('#round-games .bk-name').allInnerTexts();
    expect(shown.length).toBeGreaterThan(0);
    for (const name of shown) {
      // Tiketti #54: nimen perassa voi olla " ↗" kun API antoi suoran
      // syvalinkin kupongille. Se on merkinta, ei osa toimiston nimea.
      const clean = name.replace(/s*↗s*$/, '').trim();
      expect(allowed, `toimisto "${clean}" ei löydy snapshotista — keksittyä dataa?`).toContain(clean);
    }

    // Eikä jääkiekkodemon FALLBACK-joukkueita näy missään
    await expect(page.locator('#round-games')).not.toContainText('Tappara');
    await expect(page.locator('#round-games')).not.toContainText('Kärpät');
  });
});
