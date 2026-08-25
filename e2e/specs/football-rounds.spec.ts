// E2E: Menneiden kierrosten arviointi (tiketti #80)
//
// Ydinvaatimus: nakyma erottaa ANALYYSIVIRHEEN EPAONNESTA. Testit syottavat
// molemmat tapaukset ja tarkistavat etta ne nakyvat eri tavalla -- juuri se
// erottelu on koko ominaisuuden syy.

import { test, expect, Page } from '@playwright/test';
import { useFootball, useHockey, resetState, useFixtureSnapshot } from '../helpers.js';

function reviews() {
  const pick = (side: string, odds: number, verdict: string, minutes: number, profit: number) => ({
    side, odds, book: 'Pinnacle', edge: 0.08, flag: 'strong', stake: 2,
    won: verdict === 'osui', minutes_leading: minutes, share_leading: minutes / 90,
    last_lead_minute: minutes ? 88 : null, verdict, profit_units: profit,
  });

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    rounds: [
      {
        date: '2026-08-23',
        matches: [
          {
            match_id: 'a', league: 'Valioliiga', sport_key: 'soccer_epl',
            kickoff: '2026-08-23T15:30:00.000Z', home: 'Newcastle United', away: 'Liverpool',
            score: '2–2', outcome: 'draw',
            model: { home: 0.45, draw: 0.28, away: 0.27 },
            implied: { home: 0.25, draw: 0.26, away: 0.49 },
            model_correct: false, market_correct: false,
            goals: [{ minute: 5, side: 'home' }, { minute: 88, side: 'away' }],
            has_timeline: true,
            picks: [pick('home', 4.0, 'kaatui_lopussa', 83, -1)],
          },
          {
            match_id: 'b', league: 'Valioliiga', sport_key: 'soccer_epl',
            kickoff: '2026-08-23T19:00:00.000Z', home: 'Arsenal', away: 'Coventry City',
            score: '3–0', outcome: 'home',
            model: { home: 0.5, draw: 0.25, away: 0.25 },
            implied: { home: 0.8, draw: 0.12, away: 0.08 },
            model_correct: true, market_correct: true,
            goals: [{ minute: 15, side: 'home' }, { minute: 50, side: 'home' }, { minute: 70, side: 'home' }],
            has_timeline: true,
            picks: [pick('away', 21.0, 'ei_koskaan_voitolla', 0, -1)],
          },
        ],
        summary: { matches: 2, model_correct: 1, market_correct: 1, picks: 2, picks_won: 0, profit_units: -2, never_leading: 1 },
      },
    ],
  };
}

async function useReviews(page: Page, body: unknown = reviews()) {
  await page.route('**/data/reviews.json', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

async function openHistory(page: Page) {
  await page.goto('/demo.html');
  await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
  await page.click('.tab[data-tab="history"]');
}

test.describe('Menneet kierrokset', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await useReviews(page);
  });

  test('kierros nakyy yhteenvetoineen', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('Menneet kierrokset', { timeout: 10000 });
    await expect(page.locator('#rounds-content')).toContainText('2026-08-23');
  });

  test('MALLI JA MARKKINA aina rinnakkain', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('Malli', { timeout: 10000 });
    await expect(page.locator('#rounds-content')).toContainText('Markkina');
  });

  test('ANALYYSIVIRHE nostetaan varoituksena otsikkotasolle', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('ei ollut voitolla kertaakaan', { timeout: 10000 });
    await expect(page.locator('#rounds-content')).toContainText('analyysivirheitä');
  });

  test('EPAONNI ja ANALYYSIVIRHE erottuvat toisistaan', async ({ page }) => {
    await openHistory(page);
    const content = page.locator('#rounds-content');
    await expect(content).toContainText('johti loppuun asti, kaatui', { timeout: 10000 });
    await expect(content).toContainText('EI kertaakaan voitolla');
  });

  test('liputetun kohteen kerroin ja minuutit nakyvat', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('21.00', { timeout: 10000 });
    await expect(page.locator('#rounds-content')).toContainText('83 min voitolla');
  });

  test('LIIAN PIENI OTOS sanotaan varoituksena', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('Otos on liian pieni', { timeout: 10000 });
  });

  test('kierroksen voi sulkea ja avata', async ({ page }) => {
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('Newcastle United', { timeout: 10000 });
    await page.click('#rounds-content button:has-text("2026-08-23")');
    await expect(page.locator('#rounds-content')).not.toContainText('Newcastle United');
  });

  test('tyhja historia sanotaan suoraan', async ({ page }) => {
    await useReviews(page, { schema_version: 1, generated_at: '', rounds: [] });
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('ei ole vielä ratkennut', { timeout: 10000 });
  });

  test('PUUTTUVA TIEDOSTO ei kaada nakymaa', async ({ page }) => {
    await page.route('**/data/reviews.json', (route: any) => route.fulfill({ status: 404 }));
    await openHistory(page);
    await expect(page.locator('#rounds-content')).toContainText('Kierrosarvioita ei saatu', { timeout: 10000 });
  });

  test('osio on piilossa jaakiekkotilassa', async ({ page }) => {
    await useHockey(page);
    await page.goto('/demo.html');
    await page.click('.tab[data-tab="history"]');
    await expect(page.locator('#rounds-content')).toBeHidden();
  });
});
