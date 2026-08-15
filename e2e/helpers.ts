// Tiketti #31: Lajitilan asetus E2E-testeille
//
// Demo käynnistyy jalkapallotilassa (localStorage `bt_sport`). Jääkiekkotestien
// pitää asettaa lippu ENNEN sivun skriptien suoritusta, muuten ne testaavat
// väärää näkymää.
//
// `addInitScript` ajetaan jokaisessa navigoinnissa ennen sivun omia skriptejä —
// tämä on ainoa oikea paikka, koska demo lukee lipun heti latautuessaan.
//
// Testejä ei skipata. Skipatut testit lakastuvat hiljaa, ja se opetus on jo
// kirjattu handoverissa kertaalleen.

import { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Aja testi jääkiekkotilassa (mock-data, simulaatio, Liiga-joukkueet) */
export async function useHockey(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('bt_sport', 'hockey');
  });
}

/** Aja testi jalkapallotilassa (oikeat kertoimet snapshotista) */
export async function useFootball(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('bt_sport', 'football');
  });
}

/**
 * Nollaa demon tila ennen testiä.
 * Kassa, vedot ja historia säilyvät localStoragessa, joten ilman nollausta
 * testit vuotavat toisiinsa rinnakkaisajossa.
 */
export async function resetState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const key of ['bt_bankroll', 'bt_bets', 'bt_history', 'bt_simResults', 'bt_pressure', 'bt_ratings', 'bt_round', 'bt_practice_models']) {
      localStorage.removeItem(key);
    }
  });
}

/**
 * Tarjoile kiinteä snapshot public/data/today.json:n sijaan.
 *
 * today.json on cronin tuottama tiedosto: sen ottelut, kertoimet ja
 * value-liput vaihtuvat kahdesti vuorokaudessa. Testi joka väittää
 * "kortilla näkyy ylikerroin" menisi vihreäksi tai punaiseksi sen mukaan
 * mitä markkinalla sattuu sinä päivänä tapahtumaan — se ei mittaisi koodia
 * vaan päivän kerroinasettelua.
 *
 * Fixtuuri on committoitu ja sisältää tarkoituksella kaikki tapaukset:
 * Elo-luvut, yksi vahva value (💎), yksi kandidaatti (🟡) ja useita
 * parhaita hintoja ilman valueta.
 */
export async function useFixtureSnapshot(page: Page): Promise<void> {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/snapshot-with-elo.json', import.meta.url), 'utf8')
  );
  // Aikaleima nyt-hetkeen, muuten kortti näyttäisi VANHENTUNUT-varoituksen
  fixture.generated_at = new Date().toISOString();
  for (const [i, m] of fixture.matches.entries()) {
    m.kickoff = new Date(Date.now() + (i + 2) * 3600_000).toISOString();
  }

  await page.route('**/data/today.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
  );
}
