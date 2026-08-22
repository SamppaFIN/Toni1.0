// E2E: Valioliigan joukkuetaulukko (tiketti #45)
//
// public/data/football-teams.json ei ole committoitu (vaatii FOOTBALL_DATA_TOKENin
// oikeaan hakuun, ks. src/publish/football-teams.ts) — testi varmistaa siis
// välilehden näkyvyyden lajin mukaan ja hallitun virhetilan puuttuvalle datalle.
// Cron tuottaa oikean tiedoston tuotannossa.

import { test, expect } from '@playwright/test';
import { useFootball, useHockey, resetState } from '../helpers.js';

test.describe('Joukkuetaulukko (jalkapallo)', () => {
  test('välilehti näkyy jalkapallotilassa', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.tab[data-tab="teams-fb"]')).toBeVisible();
  });

  test('välilehti on piilossa jääkiekkotilassa, hockeyn oma Joukkueet-tabi näkyy', async ({ page }) => {
    await useHockey(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('.tab[data-tab="teams"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="teams-fb"]')).toBeHidden();
  });

  test('näyttää joukkuetaulukon tai kertoo hallitusti miksi ei', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="teams-fb"]');

    // Tiedosto on cronin tuottama eikä committoitu (ks. src/publish/football-teams.ts),
    // joten molemmat tilat ovat kelvollisia — testi ei saa riippua siitä kumpi sattuu olemaan.
    const list = page.locator('#teams-fb-list');
    await expect(list).not.toBeEmpty();
    const text = (await list.textContent()) ?? '';
    expect(
      /voimaluku|Valioliiga/.test(text) || text.includes('teams:football'),
      `odotettiin joukkuetaulukkoa tai ohjetta, saatiin: ${text.slice(0, 120)}`
    ).toBe(true);
  });

  test('kun taulukko on ladattu, se näyttää voimaluvut', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="teams-fb"]');

    const list = page.locator('#teams-fb-list');
    const text = (await list.textContent()) ?? '';
    test.skip(text.includes('teams:football'), 'football-teams.json puuttuu — cron ei ole vielä ajanut');

    await expect(list).toContainText('voimaluku');
    await expect(list).toContainText('Hyökkäys');
    await expect(list.locator('.card').first()).toBeVisible();
  });
});
