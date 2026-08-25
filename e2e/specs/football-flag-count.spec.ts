// E2E-regressio: otsikkolaskuri ja korttien merkinnat eivat saa erota
// (tiketti #77)
//
// BUGI JOKA TAMA LUKITSEE: otsikko lupasi "3 value-kohdetta" mutta yksikaan
// kortti ei nayttanyt varimerkintaa. Syy oli kahdessa eri totuudessa:
//
//   otsikko:  bestEdge(m).edge > 0.03        <- raaka edge, kovakoodattu raja
//   kortit:   edge.flag !== 'none'           <- palvelimen paatos
//
// Ne eivat ole sama asia. Palvelin voi kieltaytya liputtamasta kohdetta jonka
// edge ylittaa kynnyksen, jos mallin luottamus ei riita vaitteen tekemiseen
// (tiketti #53). Oikeassa arkistodatassa tallaisia kortteja oli tasan 3 --
// sama luku jonka kayttaja naki.
//
// Testi syottaa nimenomaan tallaisen kortin: edge 5.5 % mutta flag "none".

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

/** Kortti jonka edge ylittaa 3 % mutta jota palvelin EI liputtanut */
function snapshotWithUnflaggedEdge() {
  const edges = [
    { side: 'home', odds: 1.9, odds_effective: 1.9, book: 'Pinnacle', model_prob: 0.52,
      implied_prob: 0.53, edge: -0.012, flag: 'none', kelly_fraction: 0, stake_suggestion: 0 },
    { side: 'draw', odds: 3.6, odds_effective: 3.6, book: 'Pinnacle', model_prob: 0.26,
      implied_prob: 0.28, edge: -0.064, flag: 'none', kelly_fraction: 0, stake_suggestion: 0 },
    // Tama on se rivi: +5.5 % edge, mutta palvelin ei liputtanut
    { side: 'away', odds: 5.1, odds_effective: 5.1, book: 'Unibet', model_prob: 0.207,
      implied_prob: 0.196, edge: 0.055, flag: 'none', kelly_fraction: 0, stake_suggestion: 0 },
  ];

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    sport: 'football',
    source: 'live',
    providers: ['E2E'],
    leagues: ['Valioliiga'],
    matches: [
      {
        id: 'soccer_epl:2099-01-01:AAA-BBB',
        kickoff: new Date(Date.now() + 6 * 3600_000).toISOString(),
        league: 'Valioliiga',
        home: { name: 'Alpha FC' },
        away: { name: 'Beta United' },
        model: {
          method: 'poisson+sharp-blend', lambda_home: 1.5, lambda_away: 1.1,
          probs: { home: 0.52, draw: 0.26, away: 0.207 },
          poisson_probs: { home: 0.52, draw: 0.26, away: 0.22 },
          blend_weight: 0.35, over25: 0.5, btts: 0.5, top_scores: [], adjustments: [],
        },
        market: { margin: 0.05, implied: { home: 0.53, draw: 0.28, away: 0.196 }, sharp: null, sharp_source: null },
        stats: { home: null, away: null, h2h: [] },
        news: [],
        // Toimistotaulukko tarvitaan: varimerkinta piirtyy .bk-odds-soluun,
        // eika sita ole ilman kerroinrivia
        odds: [
          { bookmaker: 'Unibet', key: 'unibet', market: '1X2', home: 1.9, draw: 3.6, away: 5.1, commission: 0, fetched_at: new Date().toISOString(), link: null },
          { bookmaker: 'Pinnacle', key: 'pinnacle', market: '1X2', home: 1.88, draw: 3.5, away: 4.9, commission: 0, fetched_at: new Date().toISOString(), link: null },
        ],
        best: {
          home: 1.9, draw: 3.6, away: 5.1,
          home_effective: 1.9, draw_effective: 3.6, away_effective: 5.1,
          home_book: 'Unibet', draw_book: 'Unibet', away_book: 'Unibet',
        },
        analysis: { edges, news_window: false, bankroll_basis: 100 },
      },
    ],
  };
}

test.describe('Value-laskuri vs. korttien merkinnat', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
  });

  test('liputtamaton yli 3 %:n edge EI nay value-kohteena otsikossa', async ({ page }) => {
    await page.route('**/data/today.json', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshotWithUnflaggedEdge()) })
    );

    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });

    const summary = page.locator('#round-games').locator('text=/ottelua/').first();
    await expect(summary).toContainText('ei value-kohteita');
    await expect(page.locator('#round-games')).not.toContainText('1 value-kohdetta');
  });

  test('kortti sanoo suoraan ettei value-kohdetta ole', async ({ page }) => {
    await page.route('**/data/today.json', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshotWithUnflaggedEdge()) })
    );

    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).toContainText('Ei value-kohdetta', { timeout: 10000 });
  });

  test('otsikon luku vastaa varimerkittyjen kertoimien maaraa', async ({ page }) => {
    const snap = snapshotWithUnflaggedEdge();
    // Nostetaan yksi rivi oikeaksi lipuksi
    snap.matches[0].analysis.edges[2].flag = 'strong';
    snap.matches[0].analysis.edges[2].stake_suggestion = 2;

    await page.route('**/data/today.json', (route: any) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snap) })
    );

    await page.goto('/demo.html');
    await expect(page.locator('#round-games')).toContainText('1 value-kohdetta', { timeout: 10000 });

    // Ja kortilla on nyt vastaava merkinta
    const marked = page.locator('#round-games .value-strong, #round-games .value-candidate');
    expect(await marked.count()).toBeGreaterThan(0);
  });
});
