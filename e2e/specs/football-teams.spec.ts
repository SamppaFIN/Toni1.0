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

  test('puuttuva data näytetään hallitusti eikä tyhjänä', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="teams-fb"]');
    await expect(page.locator('#teams-fb-list')).toContainText('teams:football');
  });
});
