// E2E: Palvelimen kerroinarkisto (tiketti #83)
//
// BUGI JOKA TAMA LUKITSEE: pelattu ottelu jolle oli kertoimet, tunnusluvut ja
// mallin arvio nakyi "Otteluohjelma — ilman julkaistuja kertoimia" -listassa.
//
// Syy: projektissa oli KAKSI ARKISTOA jotka eivat puhuneet keskenaan.
//   selaimessa   bt_odds_archive    (tiketti #60)
//   palvelimella odds-history.json  (tiketti #75)
// Kortit lukivat vain ensimmaista. Tyhjalla selaimella palvelin tiesi,
// selain ei.
//
// Testit ajetaan TYHJALLA selainarkistolla, koska juuri se on se tilanne
// jossa vika nakyi.

import { test, expect, Page } from '@playwright/test';
import { useFootball, useHockey, resetState } from '../helpers.js';

function ymd(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Eilinen ottelu, kello 19 paikallista -> varmasti eilisen paivan puolella */
function kickoffYesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  d.setHours(19, 0, 0, 0);
  return d.toISOString();
}

const MATCH_ID = 'soccer_epl:2026-08-24:FUL-CHE';

/** Palvelinarkisto: pelattu ottelu taysine tietoineen */
function oddsHistory() {
  const edge = (side: string, odds: number, edgeVal: number, flag: string) => ({
    side, odds, odds_effective: odds, book: 'Unibet', model_prob: 0.48,
    implied_prob: 0.23, edge: edgeVal, flag, kelly_fraction: 0.02, stake_suggestion: flag === 'strong' ? 1.2 : 0,
  });

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    matches: [
      {
        match_id: MATCH_ID,
        league: 'Valioliiga',
        sport_key: 'soccer_epl',
        kickoff: kickoffYesterday(),
        home: 'Fulham',
        away: 'Chelsea',
        points: [
          {
            at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
            odds: { home: 4.3, draw: 4.01, away: 1.93 },
            book: { home: 'Unibet', draw: '1xBet', away: '1xBet' },
            model: { home: 0.4775, draw: 0.1885, away: 0.334 },
            implied: { home: 0.2325, draw: 0.2494, away: 0.5181 },
            edge: { home: 1.0532, draw: -0.2441, away: -0.3554 },
            flag: { home: 'strong', draw: 'none', away: 'none' },
            stake: { home: 1.23 },
          },
          {
            at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
            odds: { home: 4.2, draw: 3.82, away: 1.97 },
            book: { home: 'Unibet', draw: '1xBet', away: '1xBet' },
            model: { home: 0.4775, draw: 0.1885, away: 0.334 },
            implied: { home: 0.238, draw: 0.2617, away: 0.5076 },
            edge: { home: 1.0055, draw: -0.2799, away: -0.3419 },
            flag: { home: 'strong', draw: 'none', away: 'none' },
            stake: { home: 1.2 },
          },
        ],
        opening: {
          books: [
            { bookmaker: 'Unibet', key: 'unibet', market: '1X2', home: 4.3, draw: 3.95, away: 1.9, commission: 0, link: null },
            { bookmaker: 'Pinnacle', key: 'pinnacle', market: '1X2', home: 4.1, draw: 4.01, away: 1.93, commission: 0, link: null },
          ],
          best: {
            home: 4.3, draw: 4.01, away: 1.93,
            home_effective: 4.3, draw_effective: 4.01, away_effective: 1.93,
            home_book: 'Unibet', draw_book: 'Pinnacle', away_book: 'Pinnacle',
          },
          stats: {
            home: { rank: 12, played: 2, form: 'LW', gf_pg: 1.5, ga_pg: 1.5, home_gf_pg: 2, away_gf_pg: 1, xg_pg: null, rest_days: 4, ppg: 1.5 },
            away: { rank: 3, played: 2, form: 'WW', gf_pg: 2.5, ga_pg: 0.5, home_gf_pg: 3, away_gf_pg: 2, xg_pg: null, rest_days: 5, ppg: 3 },
            h2h: [],
          },
          edges: [edge('home', 4.3, 1.0532, 'strong'), edge('draw', 4.01, -0.2441, 'none'), edge('away', 1.93, -0.3554, 'none')],
          home_team: { name: 'Fulham', short: 'FUL', color: null },
          away_team: { name: 'Chelsea', short: 'CHE', color: null },
          model_extra: {
            method: 'poisson+sharp-blend', lambda_home: 1.62, lambda_away: 1.31,
            poisson_probs: { home: 0.44, draw: 0.25, away: 0.31 }, blend_weight: 0.35,
            over25: 0.52, btts: 0.55,
          },
        },
        result: { outcome: 'away', home_score: 2, away_score: 3 },
      },
    ],
  };
}

/** Kalenteri joka tuntee ottelun ja kertoo etta sille ON kertoimet */
function fixtures() {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    range: { from: ymd(-1), to: ymd(0) },
    days: [
      { date: ymd(-1), matches: 1, with_odds: 1, leagues: ['Valioliiga'] },
      { date: ymd(0), matches: 1, with_odds: 0, leagues: ['Valioliiga'] },
    ],
    matches: [
      {
        espn_id: '1', match_id: MATCH_ID, date: ymd(-1), kickoff: kickoffYesterday(),
        sport_key: 'soccer_epl', league: 'Valioliiga', home: 'Fulham', away: 'Chelsea',
        status: 'finished', home_score: 2, away_score: 3, has_odds: true,
      },
      {
        espn_id: '2', match_id: null, date: ymd(0),
        kickoff: (() => { const d = new Date(); d.setHours(20, 0, 0, 0); return d.toISOString(); })(),
        sport_key: 'soccer_epl', league: 'Valioliiga', home: 'Odottaa', away: 'Kertoimia',
        status: 'upcoming', home_score: null, away_score: null, has_odds: false,
      },
    ],
  };
}

/** Snapshot ilman eilista ottelua — API on jo pudottanut sen */
function emptySnapshot() {
  return {
    schema_version: 1, generated_at: new Date().toISOString(), sport: 'football',
    source: 'live', providers: ['E2E'], leagues: ['Valioliiga'], matches: [],
  };
}

async function setup(page: Page, opts: { history?: unknown; snapshot?: unknown } = {}) {
  await page.route('**/data/odds-history.json', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.history ?? oddsHistory()) })
  );
  await page.route('**/data/fixtures.json', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixtures()) })
  );
  await page.route('**/data/today.json', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(opts.snapshot ?? emptySnapshot()) })
  );
  // TYHJA selainarkisto — juuri se tilanne jossa vika nakyi
  await page.addInitScript(() => localStorage.removeItem('bt_odds_archive'));
}

const yesterdayBtn = (page: Page) => page.locator('.day-nav .day-btn').nth(1);

test.describe('Palvelinarkisto', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await setup(page);
  });

  test('PELATTU OTTELU SAA KORTIN vaikka selainarkisto on tyhja', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();

    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });
    await expect(page.locator('#round-games .card').first()).toBeVisible();
  });

  test('EI PUTOA otteluohjelmalistaan', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });

    // Otteluohjelma-osio on kertoimettomille; talla ottelulla ON kertoimet
    await expect(page.locator('#round-games')).not.toContainText('Otteluohjelma');
  });

  test('KERTOIMET nakyvat toimistoittain', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });

    await expect(page.locator('#round-games')).toContainText('Unibet');
    await expect(page.locator('#round-games')).toContainText('Pinnacle');
    await expect(page.locator('#round-games .bk-odds').first()).toBeVisible();
  });

  test('VALUE-LIPPU sailyy arkistosta', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });

    await expect(page.locator('#round-games')).toContainText('1 value-kohdetta');
  });

  test('TUNNUSLUVUT sailyvat arkistosta', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });

    await page.locator('#round-games button:has-text("Tunnusluvut")').first().click();
    // Sarjasija tunnusluvuista
    await expect(page.locator('#round-games')).toContainText(/12|LW/);
  });

  test('kortti on merkitty arkistoiduksi — vetoa ei voi enaa lyoda', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });

    await expect(page.locator('#round-games')).toContainText('arkistosta');
  });

  test('SNAPSHOT VOITTAA arkiston samasta ottelusta', async ({ page }) => {
    // Sama ottelu snapshotissa eri kertoimella: tuoreempi havainto voittaa
    const snap = emptySnapshot() as any;
    snap.matches = [
      {
        id: MATCH_ID,
        kickoff: kickoffYesterday(),
        league: 'Valioliiga',
        home: { name: 'Fulham' },
        away: { name: 'Chelsea' },
        model: { method: 'poisson', lambda_home: 1.6, lambda_away: 1.3, probs: { home: 0.4, draw: 0.25, away: 0.35 }, poisson_probs: { home: 0.4, draw: 0.25, away: 0.35 }, blend_weight: 0.35, over25: 0.5, btts: 0.5, top_scores: [], adjustments: [] },
        market: { margin: 0.05, implied: { home: 0.24, draw: 0.25, away: 0.51 }, sharp: null, sharp_source: null },
        stats: { home: null, away: null, h2h: [] },
        news: [],
        odds: [{ bookmaker: 'TuoreToimisto', key: 'x', market: '1X2', home: 9.99, draw: 4, away: 1.9, commission: 0, link: null }],
        best: { home: 9.99, draw: 4, away: 1.9, home_effective: 9.99, draw_effective: 4, away_effective: 1.9, home_book: 'TuoreToimisto', draw_book: 'TuoreToimisto', away_book: 'TuoreToimisto' },
        analysis: {
          edges: [
            { side: 'home', odds: 9.99, odds_effective: 9.99, book: 'TuoreToimisto', model_prob: 0.4, implied_prob: 0.24, edge: 1.4, flag: 'strong', kelly_fraction: 0.02, stake_suggestion: 2 },
            { side: 'draw', odds: 4, odds_effective: 4, book: 'TuoreToimisto', model_prob: 0.25, implied_prob: 0.25, edge: 0, flag: 'none', kelly_fraction: 0, stake_suggestion: 0 },
            { side: 'away', odds: 1.9, odds_effective: 1.9, book: 'TuoreToimisto', model_prob: 0.35, implied_prob: 0.51, edge: -0.33, flag: 'none', kelly_fraction: 0, stake_suggestion: 0 },
          ],
          news_window: false,
          bankroll_basis: 100,
        },
      },
    ];
    // Ylikirjoita VAIN snapshot: setup() on jo ajettu beforeEachissa, ja
    // reittien rekisterointi uudelleen jattaisi kaksi kasittelijaa samalle
    // osoitteelle
    await page.unroute('**/data/today.json');
    await page.route('**/data/today.json', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snap) })
    );

    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });

    await expect(page.locator('#round-games')).toContainText('TuoreToimisto');
    // Arkiston toimistot EIVAT saa nakya: snapshot korvasi kortin kokonaan
    await expect(page.locator('#round-games')).not.toContainText('Pinnacle');
    // Ottelu nakyy KERRAN, ei kahtena. Lahdebanneri on myos .card, joten
    // suodatetaan ottelun nimella.
    expect(await page.locator('#round-games .card').filter({ hasText: 'Chelsea' }).count()).toBe(1);
  });

  test('PUUTTUVA palvelinarkisto ei kaada nakymaa', async ({ page }) => {
    await page.route('**/data/odds-history.json', (route: any) => route.fulfill({ status: 404 }));
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    // Tyhja mutta ehja: selitys ja otteluohjelma
    await expect(page.locator('#round-games')).toContainText(/Ei otteluita|Otteluohjelma/, { timeout: 10000 });
  });

  test('RIKKINAINEN palvelinarkisto kasitellaan kuten puuttuva', async ({ page }) => {
    await page.unroute('**/data/odds-history.json');
    await page.route('**/data/odds-history.json', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"matches":"ei taulukko"}' })
    );
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText(/Ei otteluita|Otteluohjelma/, { timeout: 10000 });
  });

  test('KERTOIMETON ottelu saa yha rehellisen selityksen', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    // Tanaan: yksi ottelu ilman kertoimia
    await page.locator('.day-nav .day-btn').nth(2).click();
    await expect(page.locator('#round-games')).toContainText('Otteluohjelma', { timeout: 10000 });
    await expect(page.locator('#round-games')).toContainText('Kertoimia ei ole vielä julkaistu');
  });

  test('palvelinarkisto ei vaikuta jaakiekkotilaan', async ({ page }) => {
    await useHockey(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
    await expect(page.locator('#round-games')).not.toContainText('Fulham');
  });
});

// Lopputulos kortilla (tiketti #84)
//
// Kortti nayttoi "alkanut" myos ottelulle joka oli pelattu loppuun tunteja
// sitten. Teknisesti tosi, mutta se ei kerro mita tapahtui.
test.describe('Ratkenneen ottelun kortti', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await setup(page);
  });

  test('nayttaa LOPPUTULOKSEN eika "alkanut"', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();

    const card = page.locator('#round-games .card').filter({ hasText: 'Chelsea' });
    await expect(card).toContainText('2–3', { timeout: 10000 });
    await expect(card).toContainText('ratkennut');
    await expect(card).not.toContainText('alkanut');
  });

  test('tulos tulee KALENTERISTA kun arkistossa ei ole sita', async ({ page }) => {
    // Sama ottelu ilman result-kenttaa: kalenteri kertoo 2-3
    const history: any = oddsHistory();
    history.matches[0].result = null;
    await page.unroute('**/data/odds-history.json');
    await page.route('**/data/odds-history.json', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(history) })
    );

    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();

    const card = page.locator('#round-games .card').filter({ hasText: 'Chelsea' });
    await expect(card).toContainText('2–3', { timeout: 10000 });
  });

  test('ALKAMATON ottelu nayttaa yha ajan aloitukseen', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    // Tanaan: kalenterissa alkamaton ottelu ilman kertoimia -> ei korttia,
    // mutta otsikko ei saa vaittaa sita ratkenneeksi
    await page.locator('.day-nav .day-btn').nth(2).click();
    await expect(page.locator('#round-games')).not.toContainText('ratkennut', { timeout: 10000 });
  });
});

// Lahdebanneri menneella paivalla (tiketti #87)
//
// "Kertoimet haettu 365 min sitten — aja putki uudelleen" nakyi myos
// mennytta kierrosta katsottaessa. Siella kertoimien KUULUU olla vanhoja,
// eika putken ajaminen toisi takaisin eilisia hintoja.
test.describe('Lahdebanneri', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await setup(page);
  });

  test('MENNYT PAIVA: arkisto, ei vanhentumisvaroitusta', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('Fulham', { timeout: 10000 });

    await expect(page.locator('#round-games')).toContainText('Menneen päivän kohteet');
    await expect(page.locator('#round-games')).toContainText('ARKISTO');
    await expect(page.locator('#round-games')).not.toContainText('VANHENTUNUT');
    await expect(page.locator('#round-games')).not.toContainText('Aja putki uudelleen');
  });

  test('menneella paivalla sanotaan ettei vetoa voi enaa lyoda', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await yesterdayBtn(page).click();
    await expect(page.locator('#round-games')).toContainText('vetoa ei voi enää lyödä', { timeout: 10000 });
  });

  test('TANAAN: normaali banneri, ei arkistomerkintaa', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('.day-nav')).toBeVisible({ timeout: 10000 });
    await page.locator('.day-nav .day-btn').nth(2).click();
    await expect(page.locator('#round-games')).toContainText('Päivän kohteet', { timeout: 10000 });
    await expect(page.locator('#round-games')).not.toContainText('Menneen päivän');
  });
});
