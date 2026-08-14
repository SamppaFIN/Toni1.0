// E2E: Jalkapallon päiväsimulaatio (tiketti #32)
//
// Simulaatio kestää 20 sekuntia, joten näissä testeissä on pidemmät timeoutit.
// Tulokset ovat satunnaisia, joten testit tarkistavat rakenteen ja
// invarianttien pitävyyden — eivät yksittäisiä lukuja.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

test.describe('Jalkapallon päiväsimulaatio', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
    await page.addInitScript(() => localStorage.removeItem('bt_sim_results'));
    await page.goto('/demo.html');
    await expect(page.locator('#round-games .card').first()).toBeVisible({ timeout: 10000 });
    await page.click('.tab[data-tab="tracker"]');
  });

  test('Seuranta-näkymä kertoo mitä simulaatio tekee ja varoittaa siitä', async ({ page }) => {
    const view = page.locator('#tracker-list');
    await expect(view).toContainText('Pelipäivän simulaatio');
    await expect(view).toContainText('SIMULOITU');
    // Käyttäjälle pitää olla selvää ettei tämä ole oikeaa dataa
    await expect(view).toContainText('arvottuja');
    await expect(view).toContainText('erilleen oikeista tuloksista');
  });

  test('simulaatio käynnistyy ilman vetoja', async ({ page }) => {
    // Jalkapallossa ottelutulokset kiinnostavat myös ilman panosta —
    // toisin kuin jääkiekkodemossa, joka vaatii vedon
    await page.click('#sim-btn');
    await expect(page.locator('#sim-btn')).toBeDisabled();
    await expect(page.locator('#sim-btn')).toContainText('käynnissä');
  });

  test('live-näkymä näyttää kellon ja kortit', async ({ page }) => {
    await page.click('#sim-btn');
    await page.waitForTimeout(3000);
    const cards = page.locator('#tracker-list .card');
    expect(await cards.count()).toBeGreaterThan(0);
    await expect(page.locator('#tracker-list')).toContainText(/\d+'/);
    await expect(page.locator('#tracker-list').first()).toContainText('SIMULOITU');
  });

  test('pikavetonapit näkyvät live-simulaatiossa ja veto vähentää kassasta', async ({ page }) => {
    await page.click('#sim-btn');
    await page.waitForTimeout(2500);

    const quickBet = page.locator('button:has-text("seuraava maali")').first();
    await expect(quickBet).toBeVisible();
    await quickBet.click();
    await page.waitForTimeout(400);
    await expect(page.locator('#bankroll-display')).toContainText('95.00');
  });

  test('kierrosraportti näyttää ennusteen ja toteuman', async ({ page }) => {
    await page.click('#sim-btn');
    await page.waitForFunction(() => document.getElementById('sim-btn')!.textContent!.includes('uudelleen'), null, {
      timeout: 45000,
    });

    const report = page.locator('#tracker-list');
    await expect(report).toContainText('Kierrosraportti');
    await expect(report).toContainText(/Malli osui \d+\/\d+/);
    // Sivumarkkinoiden toteuma näkyy, jotta mallin O/U- ja BTTS-arviot voi tarkistaa
    await expect(report).toContainText('O2.5');
    await expect(report).toContainText('BTTS');
    // Muistutus siitä ettei yhden kierroksen otos kerro mallin laadusta
    await expect(report).toContainText('otos ei kerro');
  });

  test('veto ratkeaa ja voitto hyvittyy kassaan oikein', async ({ page }) => {
    // Lyödään kaikkiin kolmeen kohteeseen samasta ottelusta: tasan yksi voittaa
    await page.click('.tab[data-tab="round"]');
    const row = page.locator('#round-games .card').nth(1).locator('.odds-row').nth(1);

    for (const col of [0, 1, 2]) {
      await row.locator('.bk-odds').nth(col).click();
      const popup = page.locator('[id^="fbetpop-"]:visible');
      await popup.locator('input[type="number"]').fill('10');
      await popup.locator('button:has-text("Veto")').click();
      await page.waitForTimeout(200);
    }
    await expect(page.locator('#bankroll-display')).toContainText('70.00');

    await page.click('.tab[data-tab="tracker"]');
    await page.click('#sim-btn');
    await page.waitForFunction(() => document.getElementById('sim-btn')!.textContent!.includes('uudelleen'), null, {
      timeout: 45000,
    });

    const settled = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('bt_history') ?? '[]').filter((h: { football?: boolean }) => h.football)
    );
    expect(settled).toHaveLength(3);

    const winners = settled.filter((b: { won: boolean }) => b.won);
    expect(winners).toHaveLength(1);

    // Kassa = 70 € + voittaneen vedon palautus
    const winner = winners[0] as { stake: number; odds: number };
    const expected = (70 + winner.stake * winner.odds).toFixed(2);
    await expect(page.locator('#bankroll-display')).toContainText(expected);
  });

  test('simuloidut tulokset tallentuvat omaan avaimeen ja on merkitty', async ({ page }) => {
    await page.click('#sim-btn');
    await page.waitForFunction(() => document.getElementById('sim-btn')!.textContent!.includes('uudelleen'), null, {
      timeout: 45000,
    });

    const state = await page.evaluate(() => ({
      sim: JSON.parse(localStorage.getItem('bt_sim_results') ?? '[]'),
      real: localStorage.getItem('bt_real_results'),
    }));

    expect(state.sim.length).toBeGreaterThan(0);
    // Jokainen tulos on merkitty simuloiduksi — tämä estää sen että mallin
    // tarkkuustilasto (tiketti 33) laskisi arpanoppaa mallin ansioksi
    expect(state.sim.every((r: { simulated: boolean }) => r.simulated === true)).toBe(true);
    // Oikeiden tulosten avain pysyy koskemattomana
    expect(state.real).toBeNull();
  });

  test('lopputulos on aina yhdenmukainen kirjatun lopputuloksen kanssa', async ({ page }) => {
    await page.click('#sim-btn');
    await page.waitForFunction(() => document.getElementById('sim-btn')!.textContent!.includes('uudelleen'), null, {
      timeout: 45000,
    });

    const results = await page.evaluate(() => JSON.parse(localStorage.getItem('bt_sim_results') ?? '[]'));
    for (const r of results as Array<{ home_score: number; away_score: number; outcome: string; over25: boolean; btts: boolean }>) {
      const expectedOutcome = r.home_score > r.away_score ? 'home' : r.home_score < r.away_score ? 'away' : 'draw';
      expect(r.outcome, `${r.home_score}-${r.away_score}`).toBe(expectedOutcome);
      expect(r.over25).toBe(r.home_score + r.away_score > 2.5);
      expect(r.btts).toBe(r.home_score > 0 && r.away_score > 0);
    }
  });

  test('"Aloita alusta" nollaa simulaation ja sen tulokset', async ({ page }) => {
    await page.click('#sim-btn');
    await page.waitForFunction(() => document.getElementById('sim-btn')!.textContent!.includes('uudelleen'), null, {
      timeout: 45000,
    });

    await page.click('#reset-header-btn');
    await page.waitForTimeout(600);

    expect(await page.evaluate(() => localStorage.getItem('bt_sim_results'))).toBeNull();
    await page.click('.tab[data-tab="tracker"]');
    await expect(page.locator('#sim-btn')).toContainText('Käynnistä');
    await expect(page.locator('#tracker-list')).toContainText('Pelipäivän simulaatio');
  });
});
