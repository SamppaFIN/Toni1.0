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
 * Tarjoile snapshot jossa ENSIMMAISELLA ottelulla on kasin syotetty
 * ottelukonteksti (tiketti #105).
 *
 * Konteksti injektoidaan `snapshot-with-elo.json`:iin eika omaan
 * fikstuuritiedostoon, koska mitattava asia on nimenomaan LISAYS olemassa
 * olevaan korttiin: pillerit, Ennakko-osio ja kerroinlaskurin kytkimet
 * ilmestyvat kortille jolla on jo malli, kertoimet ja Elo. Erillinen
 * fikstuuri eriytyisi siita hiljaa.
 *
 * `lambda_base` asetetaan mallin lambdan yli, jotta kytkentojen vaikutus on
 * ISO ja siten mitattava: pilleri pois -> luku palaa selvasti eri arvoon.
 */
export async function useContextFixture(page: Page): Promise<void> {
  const fixture = fixtureSnapshot() as any;
  fixture.generated_at = new Date().toISOString();
  for (const [i, m] of fixture.matches.entries()) {
    m.kickoff = new Date(Date.now() + (i + 2) * 3600_000).toISOString();
  }

  const target = fixture.matches.find((m: any) => m.model.lambda_home !== null);
  if (!target) throw new Error('Fikstuurissa ei ole yhtaan Poisson-mallin ottelua');

  target.context = {
    source: {
      name: 'Kierrosennakot ja uutiset — luettu kasin',
      entered_at: new Date().toISOString(),
      note: null,
    },
    factors: [
      {
        id: 'testi-voittoputki',
        team: 'home',
        type: 'win_streak',
        label: 'Neljä voittoa putkeen',
        detail: 'Muoto WWWW kaikissa kilpailuissa.',
        delta_home: 0.2,
        delta_away: 0,
        confidence: 0.9,
        sources: [{ name: 'Testilahde', url: 'https://example.test/putki' }],
      },
      {
        id: 'testi-hankinta',
        team: 'away',
        type: 'signing',
        label: 'Uusi hankinta debytoi',
        detail: 'Seuraennatyksella hankittu hyokkaaja aloittaa ensimmaista kertaa.',
        delta_home: 0,
        delta_away: 0.15,
        confidence: 0.7,
        sources: [{ name: 'Testilahde', url: 'https://example.test/hankinta' }],
      },
      {
        id: 'testi-h2h',
        team: null,
        type: 'h2h',
        label: 'Kuusi tasapelia perakkain',
        detail: 'Taustatieto ilman lambda-vaikutusta.',
        delta_home: 0,
        delta_away: 0,
        confidence: 0.8,
        sources: [{ name: 'Testilahde', url: 'https://example.test/h2h' }],
      },
    ],
    lambda_base: { home: target.model.lambda_home, away: target.model.lambda_away },
  };

  // HUOM: `bt_football_context_off` EI nollata tassa. addInitScript ajetaan
  // jokaisessa navigoinnissa, joten nollaus pyyhkisi kayttajan valinnan
  // sivun paivityksessa — ja juuri sen sailymista yksi testi mittaa.
  // Jokainen testi saa oman selainkontekstin, joten tila on valmiiksi tyhja.
  await page.addInitScript(() => localStorage.setItem('bt_football_day_filter', 'all'));

  await page.route('**/data/today.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(fixture) })
  );
}

/**
 * Tarjoile Liigan avauskierros fikstuurina (tiketti #103).
 *
 * Miksi oma fikstuuri eikä `snapshot-with-elo.json`: se on jalkapalloa,
 * eikä siinä ole kausiennakkoa, lähtö-Eloa eikä käsin syötettyjä kertoimia
 * — eli ei mitään siitä mitä nämä testit mittaavat.
 *
 * LAJITILA ASETETAAN TÄSSÄ: Liiga on `icehockey_liiga`, ja jalkapallotila
 * suodattaa jääkiekkokortit pois (`visibleBySport`). Ilman tätä testi
 * katsoisi tyhjää listaa eikä kertoisi mitään kortin sisällöstä.
 */
export async function useLiigaFixture(page: Page): Promise<void> {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/snapshot-liiga-preview.json', import.meta.url), 'utf8')
  );
  fixture.generated_at = new Date().toISOString();
  for (const [i, m] of (fixture.matches as Array<{ kickoff: string }>).entries()) {
    m.kickoff = new Date(Date.now() + (i + 2) * 3600_000).toISOString();
  }

  await page.addInitScript(() => {
    localStorage.setItem('bt_sport', 'both');
    localStorage.setItem('bt_football_day_filter', 'all');
  });

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

/**
 * Tarjoile hallittu otteluohjelmakalenteri fixtures.json:n sijaan.
 *
 * Aikajana (tiketti #79) lukee kalenterin ja nayttaa vain paivat joilla on
 * otteluita. Testi joka klikkaa tiettya paivaa ei voi luottaa siihen mita
 * cron on sattunut hakemaan -- sama peruste kuin useFixtureSnapshotissa.
 *
 * `offsets` on paivasiirtymia tasta paivasta. Jokaiselle syntyy yksi ottelu
 * ILMAN kertoimia, mika on juuri se tilanne jossa ennakkohakunappi tarvitaan.
 */
export async function useCalendarDays(page: Page, offsets: number[]): Promise<void> {
  const key = (o: number) => {
    const d = new Date();
    d.setDate(d.getDate() + o);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const kickoff = (o: number) => {
    const d = new Date();
    d.setDate(d.getDate() + o);
    d.setHours(18, 0, 0, 0);
    return d.toISOString();
  };

  const calendar = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    range: { from: key(Math.min(...offsets)), to: key(Math.max(...offsets)) },
    days: offsets.map((o) => ({ date: key(o), matches: 1, with_odds: 0, leagues: ['Valioliiga'] })),
    matches: offsets.map((o) => ({
      espn_id: `e${o}`,
      match_id: null,
      date: key(o),
      kickoff: kickoff(o),
      sport_key: 'soccer_epl',
      league: 'Valioliiga',
      home: `Koti ${o}`,
      away: `Vieras ${o}`,
      status: o < 0 ? 'finished' : 'upcoming',
      home_score: null,
      away_score: null,
      has_odds: false,
    })),
  };

  await page.route('**/data/fixtures.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(calendar) })
  );
}

/**
 * Neutralisoi kalenteri ja palvelinarkisto (tiketit #74, #83).
 *
 * Kierrosnakymalla on KOLME datalahdetta: today.json, fixtures.json ja
 * odds-history.json. Testi joka ohjaa vain ensimmaista saa nakymaan silti
 * cronin hakemat ottelut, ja mittaa silloin jotain muuta kuin vaittaa.
 *
 * Tama kytkee kaksi jalkimmaista pois. Kutsu ENNEN goto:a.
 */
export async function useIsolatedArchives(page: Page): Promise<void> {
  await page.route('**/data/fixtures.json', (route) => route.fulfill({ status: 404 }));
  await page.route('**/data/odds-history.json', (route) => route.fulfill({ status: 404 }));
  await page.addInitScript(() => {
    for (const key of ['bt_timeline_day', 'bt_odds_archive', 'bt_football_day_filter']) {
      localStorage.removeItem(key);
    }
  });
}
