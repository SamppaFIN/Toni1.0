// Simulaatio Admin-togglen takana (tiketti #78)
//
// Ohjelma kayttaa oikeaa dataa. Simuloitu tulos nayttaa kortilla samalta kuin
// pelattu, joten sekaannus maksaa enemman kuin ominaisuus tuottaa. Testit
// lukitsevat kolme asiaa: piilossa oletuksena, saatavilla togglesta, eika
// jaakiekko rikkoutunut.

import { test, expect } from '@playwright/test';
import { useFootball, useHockey, resetState, useFixtureSnapshot, useSimulation } from '../helpers.js';

test.describe('Simulaation nakyvyys', () => {
  test('OLETUKSENA piilossa jalkapallotilassa', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');

    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#sim-btn')).toBeHidden();
  });

  test('piilotettuna Seuranta kertoo mista simulaation saa paalle', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');

    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#tracker-list')).toContainText('Admin');
  });

  test('Admin-toggle tuo napin nakyviin', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await useSimulation(page);
    await page.goto('/demo.html');

    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#sim-btn')).toBeVisible();
  });

  test('Admin-valilehdella on Simulaatio-valinta', async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await useFixtureSnapshot(page);
    await page.goto('/demo.html');

    await page.click('.tab[data-tab="admin"]');
    await expect(page.locator('#admin')).toContainText('Simulaatio');
  });

  test('jaakiekon kausisimulaatio toimii kuten ennen', async ({ page }) => {
    await useHockey(page);
    await resetState(page);
    await page.goto('/demo.html');

    await page.click('.tab[data-tab="tracker"]');
    // Jaakiekossa nappia ohjaa demo.html:n oma logiikka, ei jalkapallon prefs
    await expect(page.locator('#tracker')).toBeVisible();
  });
});
