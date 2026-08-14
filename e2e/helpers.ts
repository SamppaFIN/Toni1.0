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
