// E2E: Tanaan pelatut ottelut tuloksineen (tiketti #59)
//
// ESPN-kutsut katkaistaan page.routella: testi ei saa riippua ulkoisesta
// palvelusta eika kuormittaa sita.

import { test, expect } from '@playwright/test';
import { useFootball, resetState } from '../helpers.js';

/** Tanaan paikallisessa ajassa, jotta paivasuodatus osuu ajopaivasta riippumatta */
function todayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function scoreboard(matches: Array<{ home: string; away: string; hs: string; as: string; state: string }>) {
  return {
    events: matches.map((m, i) => ({
      id: String(i + 1),
      date: todayAt(15),
      status: { type: { state: m.state, description: m.state === 'post' ? 'Full Time' : 'Second Half' }, displayClock: "90'" },
      competitions: [
        {
          competitors: [
            { homeAway: 'home', team: { displayName: m.home }, score: m.hs },
            { homeAway: 'away', team: { displayName: m.away }, score: m.as },
          ],
        },
      ],
    })),
  };
}

async function stub(page: any, body: unknown) {
  await page.route('**/site.api.espn.com/**', (route: any) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  );
}

test.describe('Tanaan pelatut', () => {
  test.beforeEach(async ({ page }) => {
    await useFootball(page);
    await resetState(page);
  });

  test('nayttaa pelatut ottelut tuloksineen', async ({ page }) => {
    await stub(page, scoreboard([
      { home: 'Brighton & Hove Albion', away: 'Aston Villa', hs: '4', as: '0', state: 'post' },
      { home: 'Manchester City', away: 'AFC Bournemouth', hs: '2', as: '1', state: 'post' },
    ]));
    await page.goto('/demo.html');

    const played = page.locator('#round-played');
    await expect(played).toContainText('Tänään pelatut', { timeout: 10000 });
    await expect(played).toContainText('4 – 0');
    await expect(played).toContainText('2 – 1');
  });

  test('kesken oleva ottelu EI paady pelattuihin', async ({ page }) => {
    await stub(page, scoreboard([{ home: 'Fulham', away: 'Chelsea', hs: '1', as: '0', state: 'in' }]));
    await page.goto('/demo.html');
    const played = page.locator('#round-played');
    await expect(played).toContainText('Ei vielä tämän päivän pelattuja', { timeout: 10000 });
    await expect(played).not.toContainText('1 – 0');
  });

  test('tyhja paiva sanotaan suoraan eika jateta tyhjaksi', async ({ page }) => {
    await stub(page, { events: [] });
    await page.goto('/demo.html');
    await expect(page.locator('#round-played')).toContainText('Ei vielä tämän päivän pelattuja', { timeout: 10000 });
  });

  test('ESPN-virhe ei kaada kierrosnakymaa', async ({ page }) => {
    await page.route('**/site.api.espn.com/**', (route: any) => route.fulfill({ status: 500, body: '' }));
    await page.goto('/demo.html');
    // Kierroskortit renderoityvat normaalisti snapshotista
    await expect(page.locator('#round-games')).not.toBeEmpty({ timeout: 10000 });
  });

  test('osio on piilossa jaakiekkotilassa', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bt_sport', 'hockey'));
    await page.goto('/demo.html');
    await expect(page.locator('#round-played')).toBeHidden();
  });
});
