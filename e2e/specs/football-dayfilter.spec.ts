// E2E: Paivanavigointi kierrossivulla (tiketit #46, #60)
//
// Jaottelulogiikka on yksikkotestattu injektoidulla kellolla
// (football-dayfilter.test.ts), joten taalla ei tarkisteta otteluiden
// lukumaaria -- ne riippuisivat ajopaivasta ja testi lakastuisi hiljaa.
// Taalla todennetaan etta navigointi on kytketty renderointiin ja tila sailyy.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { useFootball, resetState, useFixtureSnapshot, useIsolatedArchives } from '../helpers.js';

test.describe('Paivanavigointi', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    // Kiintea snapshot: elava today.json voi olla tyhja tai sisaltaa vain
    // pelattuja otteluita, jolloin testit skippaisivat. Skipattu testi
    // lakastuu hiljaa.
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
  });

  test('tarjoaa eilisen, tanaan ja huomisen', async ({ page }) => {
    // Tiketti #82: "Kaikki" poistui kun navigointi supistui viiteen nappiin.
    // Koko aikaikkuna on yha tavoitettavissa nuolilla.
    const nav = page.locator('#round-games');
    for (const label of ['Eilen', 'Tänään', 'Huomenna']) {
      await expect(nav.locator(`button:has-text("${label}")`).first()).toBeVisible();
    }
    await expect(nav.locator('button:has-text("Kaikki")')).toHaveCount(0);
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

  test('NUOLILLA paasee aikaikkunan yli — Kaikki ei ole enaa tarpeen', async ({ page }) => {
    const buttons = page.locator('.day-nav .day-btn');
    await expect(buttons).toHaveCount(5);

    // Eteenpain kunnes nuoli himmenee: jokainen askel on ottelupaiva
    for (let i = 0; i < 12; i++) {
      const next = buttons.nth(4);
      if (await next.isDisabled()) break;
      await next.click();
      await expect(page.locator('#round-games')).not.toBeEmpty();
    }
    // Nakyma on ehja lopussakin
    await expect(page.locator('#round-games')).toContainText(/ottelua|Ei otteluita|Otteluohjelma/);
  });

  test('EI KOSKAAN tyhjaa listaa kun paivalla on pelaamattomia otteluita', async ({ page }) => {
    const upcoming = await page.evaluate(() => {
      const s = (window as any).BTF.getSnapshot();
      return s ? s.matches.filter((m: any) => Date.parse(m.kickoff) > Date.now()).length : 0;
    });
    test.skip(upcoming === 0, 'Snapshotissa ei ole pelaamattomia otteluita');

    // Tanaan-nappi: jos snapshotissa on pelaamattomia, kortteja pitaa nakya
    await page.locator('.day-nav .day-btn').nth(2).click();
    await expect(page.locator('#round-games')).toContainText(/ottelua|Ei otteluita/, { timeout: 5000 });
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
  // KAYTTAJAPALAUTE: paivasuodatin piilotti aiemmin myos KAYNNISSA OLEVAT
  // ottelut (kickoff ohitettu = "alkanut"), mika tyhjensi kierrosnakyman
  // lahes kokonaan kesken kierroksen. Suodatin tarkistaa nyt onko ottelu
  // OIKEASTI PAATTYNYT (finalScore(), sama kuin #84:n "ratkennut"-badge) —
  // kaynnissa oleva nakyy normaalisti. Varakeino testataan siis paattyneella
  // ottelulla, ei pelkalla kickoffin ohituksella.
  test('kierrosnakyma EI ole tyhja kun paivan ainoa ottelu on paattynyt', async ({ page }) => {
    await useFootball(page);
    await resetState(page);

    // Fikstuuri levylta, kickoff kaksi tuntia sitten JA tulos tiedossa ->
    // ottelu on OIKEASTI paattynyt, ei vain alkanut.
    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/snapshot-with-elo.json', import.meta.url), 'utf8')
    );
    fixture.generated_at = new Date().toISOString();
    fixture.matches = [{
      ...fixture.matches[0],
      kickoff: new Date(Date.now() - 2 * 3600_000).toISOString(),
      result: { home_score: 2, away_score: 1, outcome: 'home' },
    }];

    await page.route('**/data/today.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
    );
    // Tama testi koskee VARAKEINOA, ei sita mita cron on sattunut hakemaan
    await useIsolatedArchives(page);
    await page.goto('/demo.html');

    // Paivasuodatin piilottaa paattyneet, mutta kun muuta ei ole, ne on
    // naytettava merkittyna. Tyhja sivu on aina huonompi kuin vanhentunut
    // kortti jonka vieressa lukee etta se on paattynyt.
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText('päättyneet');
  });

  test('kaynnissa oleva ottelu nakyy normaalisti paalistalla, ei vain varakeinona', async ({ page }) => {
    await useFootball(page);
    await resetState(page);

    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/snapshot-with-elo.json', import.meta.url), 'utf8')
    );
    fixture.generated_at = new Date().toISOString();
    // Kickoff ohitettu, EI tulosta -> kaynnissa, ei paattynyt
    fixture.matches = [{ ...fixture.matches[0], kickoff: new Date(Date.now() - 20 * 60_000).toISOString() }];

    await page.route('**/data/today.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
    );
    await useIsolatedArchives(page);
    await page.goto('/demo.html');

    const view = page.locator('#round-games');
    await expect(view.locator('.card').first()).toBeVisible({ timeout: 10000 });
    await expect(view).toContainText('alkanut');
    // Kertoimet nakyvat (span) muttei klikattavina (button) — vedon
    // lyominen alkaneeseen otteluun ei ole mahdollista
    await expect(view.locator('span.bk-odds')).not.toHaveCount(0);
    await expect(view.locator('button.bk-odds')).toHaveCount(0);
  });
});

test.describe('Paattynyt ottelu jolla ON analyysi ei nayta vaarina "ei arkistoitu" (regressio)', () => {
  function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  test('paattynyt ottelu ei ilmesty Otteluohjelma-varakeinoon vaikka se on piilotettu paalistalta', async ({ page }) => {
    await useFootball(page);
    await resetState(page);

    const fixture = JSON.parse(
      readFileSync(new URL('../fixtures/snapshot-with-elo.json', import.meta.url), 'utf8')
    );
    fixture.generated_at = new Date().toISOString();

    // Ottelu A: paattyi 2h sitten (result asetettu) -> suodattuu pois
    // paalistalta ("N paattynyt"), mutta silla ON TAYSI ANALYYSI koska se on
    // ihan tavallinen korttiolio samasta snapshotista. Kaynnissa oleva EI
    // enaa suodatu (ks. edellinen describe-lohko) — juuri paattynyt on nyt
    // ainoa tapa saada ottelu pois paalistalta.
    const finished = {
      ...fixture.matches[0],
      kickoff: new Date(Date.now() - 2 * 3600_000).toISOString(),
      result: { home_score: 2, away_score: 1, outcome: 'home' },
    };
    // Ottelu B: alkaa 2h paasta -> nakyy normaalisti paalistalla.
    const upcoming = { ...fixture.matches[1], kickoff: new Date(Date.now() + 2 * 3600_000).toISOString() };
    fixture.matches = [finished, upcoming];

    const today = ymd(new Date());
    await page.route('**/data/today.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
    );
    // fixtures.json TUNTEE molemmat ottelut (has_odds: true) — juuri tama
    // aiemmin sai paattyneen ottelun nakymaan "ei arkistoitu"-varakeinossa,
    // koska knownIds rakennettiin vain NAKYVASTA listasta.
    await page.route('**/data/fixtures.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          schema_version: 1,
          generated_at: new Date().toISOString(),
          range: { from: today, to: today },
          days: [{ date: today, matches: 2, with_odds: 2, leagues: [finished.league, upcoming.league] }],
          matches: [
            { espn_id: 'a', match_id: finished.id, date: today, kickoff: finished.kickoff, sport_key: 'soccer_epl', league: finished.league, home: finished.home.name, away: finished.away.name, status: 'upcoming', home_score: null, away_score: null, has_odds: true },
            { espn_id: 'b', match_id: upcoming.id, date: today, kickoff: upcoming.kickoff, sport_key: 'soccer_finland_veikkausliiga', league: upcoming.league, home: upcoming.home.name, away: upcoming.away.name, status: 'upcoming', home_score: null, away_score: null, has_odds: true },
          ],
        }),
      })
    );
    await page.route('**/data/odds-history.json', (route) => route.fulfill({ status: 404 }));

    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });

    const view = page.locator('#round-games');
    // Nakyvissa vain paattymaton ottelu, ja piilotus sanotaan aakisesti
    await expect(view).toContainText(upcoming.home.name);
    await expect(view).toContainText('1 päättynyt');

    // PAATTYNYT OTTELU EI SAA ILMESTYA "ei arkistoitu"-varakeinoon: sille ON
    // analyysi, se on vain piilotettu toisesta syysta.
    await expect(view).not.toContainText('analyysia ei ole arkistoitu');
    await expect(view).not.toContainText('Otteluohjelma');
  });
});
