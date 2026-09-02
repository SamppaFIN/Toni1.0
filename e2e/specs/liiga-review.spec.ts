// E2E: Jälkiarvio kortin footer-tabina (tiketti #105)
//
// data/liiga-reviews.json tulee vain jääkiekko-otteluille joilla cron on
// ehtinyt tuottaa arvion. Napin pitää siis näkyä vain silloin kun data on
// olemassa TÄLLE ottelulle, eikä koskaan jalkapallokortilla.

import { test, expect, Page } from '@playwright/test';
import { useHockey, useFootball, resetState, useLiigaFixture, useFixtureSnapshot } from '../helpers.js';

const MATCH_ID = 'icehockey_liiga:2026-09-01:JUK-HPK'; // täsmää snapshot-liiga-preview.json:in ensimmäiseen otteluun

function reviewsFile(matchId = MATCH_ID) {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    rounds: [
      {
        date: '2026-09-01',
        matches: [
          {
            matchId,
            date: '2026-09-01',
            home: 'Jukurit',
            away: 'HPK',
            regulationScore: '1–4',
            finalScore: '1–4',
            wentToOvertime: false,
            outcome: 'away',
            model: { home: 0.25, draw: 0.2, away: 0.55 },
            market: { home: 0.3, draw: 0.22, away: 0.48 },
            modelPick: 'away',
            marketPick: 'away',
            modelCorrect: true,
            marketCorrect: true,
            goals: [{ minute: 46, side: 'away' }],
            minutesLeading: 46,
            verdict: 'osui',
            claims: [
              { claim: 'Kausiennakon sija', model: 'HPK parempi (12. vs 17.)', actual: 'HPK', hit: true, note: 'Ennakon parempi joukkue' },
              { claim: 'Kotietu', model: 'koti 25.0 %', actual: 'vierasvoitto', hit: null, note: 'Malli ei pitänyt kotivoittoa selvänä suosikkina — ei testattavissa' },
            ],
          },
        ],
        summary: {
          matches: 1,
          modelCorrect: 1,
          marketCorrect: 1,
          claims: { 'Kausiennakon sija': { hit: 1, tested: 1 } },
          neverLeading: 0,
        },
      },
    ],
  };
}

async function useReviews(page: Page, body: unknown = reviewsFile()) {
  await page.route('**/data/liiga-reviews.json', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

test.describe('Jälkiarvio kortilla', () => {
  test('nappi nakyy otteluilla joilla on arvio, ja avaa sisallon', async ({ page }) => {
    await useHockey(page);
    await resetState(page);
    await useLiigaFixture(page);
    await useReviews(page);
    await page.goto('/demo.html');

    const button = page.locator('button:has-text("Jälkiarvio")').first();
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();

    const view = page.locator('#round-games');
    await expect(view).toContainText('Kausiennakon sija');
    await expect(view).toContainText('✓ osui');
    await expect(view).toContainText('ei testattavissa');
  });

  test('ottelu ilman arviota ei saa nappia', async ({ page }) => {
    await useHockey(page);
    await resetState(page);
    await useLiigaFixture(page);
    // Toinen ottelu (SAI-TAP) ei ole arkistossa lainkaan
    await useReviews(page, reviewsFile());
    await page.goto('/demo.html');

    const cards = page.locator('#round-games .card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const saipaCard = page.locator('#round-games .card', { hasText: 'SaiPa' });
    await expect(saipaCard.locator('button:has-text("Jälkiarvio")')).toHaveCount(0);
  });

  test('puuttuva tiedosto ei kaada korttia', async ({ page }) => {
    await useHockey(page);
    await resetState(page);
    await useLiigaFixture(page);
    await page.route('**/data/liiga-reviews.json', (route: any) => route.fulfill({ status: 404 }));
    await page.goto('/demo.html');

    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Jälkiarvio")')).toHaveCount(0);
  });

  test('jalkapallokortilla nappia ei koskaan nayteta', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await useReviews(page);
    await page.goto('/demo.html');

    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('button:has-text("Jälkiarvio")')).toHaveCount(0);
  });
});
