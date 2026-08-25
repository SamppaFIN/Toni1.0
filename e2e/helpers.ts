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
/**
 * Fikstuurin sisalto sellaisena kuin sivu sen saa.
 *
 * Testi joka vertaa ruudun sisaltoa snapshottiin EI saa hakea sita
 * `request.get('/data/today.json')`:lla: request-konteksti ei kulje
 * `page.route`n lapi, joten se lukisi elavan tiedoston samalla kun sivu
 * nayttaa fikstuuria. Silloin testi vertaa kahta eri lahdetta ja kaatuu
 * syysta jolla ei ole tekemista koodin kanssa.
 */
export function fixtureSnapshot(): { matches: Array<{ odds: Array<{ bookmaker: string }> }> } {
  return JSON.parse(
    readFileSync(new URL('./fixtures/snapshot-with-elo.json', import.meta.url), 'utf8')
  );
}

export async function useFixtureSnapshot(page: Page): Promise<void> {
  const fixture = fixtureSnapshot() as any;
  // Aikaleima nyt-hetkeen, muuten kortti näyttäisi VANHENTUNUT-varoituksen
  fixture.generated_at = new Date().toISOString();
  for (const [i, m] of fixture.matches.entries()) {
    m.kickoff = new Date(Date.now() + (i + 2) * 3600_000).toISOString();
  }

  // Päiväsuodatin (tiketti #46) pois päältä fikstuuritesteille. Kickoffit
  // asetetaan nyt-hetkestä eteenpäin tunnin välein, jolloin osa niistä valuu
  // paikallisesti seuraavalle kalenteripäivälle riippuen siitä mihin aikaan
  // testi ajetaan — ja suodatin piilottaisi ne. Nämä testit koskevat kortin
  // SISÄLTÖÄ, eivät suodatinta, joten niiden ei pidä riippua kellonajasta.
  await page.addInitScript(() => localStorage.setItem('bt_football_day_filter', 'all'));

  await page.route('**/data/today.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
  );
}

/**
 * Kytke harjoitussimulaatio päälle (tiketti #78).
 *
 * Simulaationapit ovat oletuksena piilossa: ohjelma käyttää oikeaa dataa, ja
 * simuloitu tulos näyttää kortilla samalta kuin pelattu. Testit jotka
 * nimenomaan mittaavat simulaatiota kytkevät sen itse päälle — sama toggle
 * jonka käyttäjä löytää Admin-välilehdeltä.
 */
export async function useSimulation(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = 'bt_display_prefs';
    let prefs: Record<string, boolean> = {};
    try {
      prefs = JSON.parse(localStorage.getItem(key) || '{}');
    } catch {
      /* vioittunut tallennus ei estä testiä */
    }
    localStorage.setItem(key, JSON.stringify({ ...prefs, sim: true }));
  });
}
