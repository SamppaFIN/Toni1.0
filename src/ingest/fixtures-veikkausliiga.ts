// Tiketti #85: Veikkausliigan otteluohjelma Palloliiton tulospalvelusta
//
// ESPN:n `fin.1` palauttaa HTTP 200 ja TYHJÄN listan vaikka Veikkausliigaa
// pelataan (todettu 25.8.2026). Se on ylävirran datapuute, ei bugi meillä,
// mutta seuraus on että seurattu sarja katosi otteluohjelmakalenterista
// (tiketti #74) kokonaan — kalenteri paikkasi sen vain niillä otteluilla
// joille sattui olemaan kertoimet.
//
// LÄHDE ON PALLOLIITON OMA TULOSPALVELU. Se on virallinen ja auktoritatiivinen:
// sama järjestelmä johon seurat itse kirjaavat ottelunsa.
//
//   robots.txt (tarkistettu 25.8.2026): "User-agent: * / Disallow: /person/"
//   — otteluhaku on sallittu, henkilötiedot eivät.
//
// MITEN RAJAPINTA LÖYTYI, jotta seuraava ylläpitäjä ei joudu arvaamaan:
// tulospalvelu.palloliitto.fi on Vue-SPA jonka bundle (`assets/index-*.js`)
// paljastaa alustan (Torneopal), tukiaseman ja julkisen avaimen. Kutsu vaatii
// KOLME asiaa, joista jokainen on pakollinen:
//
//   1. `accept: json/<avain>`     — avain on bundlessa selkokielisenä
//   2. kyselytunniste polun perässä — bundle lisää sen jokaiseen pyyntöön
//   3. `Origin`/`Referer`          — ilman näitä vastaus on 403
//
// Tämä on sivuston OMA julkinen rajapinta, ei salainen: avain on jokaisen
// kävijän selaimessa. Se voi silti vaihtua ilman varoitusta, joten haun
// pettäminen EI saa kaataa kalenteria — se degradoituu tyhjään listaan ja
// sanoo syyn lokiin.

import { cached } from './cache.js';

const BASE = 'https://spl.torneopal.fi/taso/rest';

/** Bundlesta luettu julkinen avain (accept-otsake) */
const API_KEY = 'df8e84j9xtdz269euy3h';
/** Bundlesta luettu kyselytunniste, lisätään polun perään */
const QUERY_TOKEN = 'ysnyp4h6e9egetkc3s3v';
/** Ilman näitä rajapinta vastaa 403 */
const ORIGIN = 'https://tulospalvelu.palloliitto.fi';

/** Veikkausliigan sarjatunniste tulospalvelussa */
export const CATEGORY_ID = 'VL';

/**
 * Kilpailutunniste vuodesta: 2026 -> "spljp26".
 *
 * Johdetaan eikä kovakoodata, jottei kausi vaihtuessaan jää menneeseen.
 * Todennettu: spljp23/24/25 ovat arkistoituja, spljp26 on "published".
 */
export function competitionId(year: number): string {
  return `spljp${String(year).slice(2)}`;
}

interface TorneopalMatch {
  match_id?: string;
  date?: string;
  time?: string;
  time_zone?: string;
  status?: string;
  team_A_name?: string;
  team_B_name?: string;
  fs_A?: string;
  fs_B?: string;
  venue_name?: string;
  group_name?: string;
}

export interface VeikkausliigaFixture {
  match_id: string;
  /** Ottelupäivä paikallisittain, YYYY-MM-DD */
  date: string;
  /** Aloituspotku UTC:na */
  kickoff: string;
  home: string;
  away: string;
  status: 'upcoming' | 'finished';
  home_score: number | null;
  away_score: number | null;
  venue: string | null;
}

/**
 * Suomen aika UTC:ksi.
 *
 * Tulospalvelu antaa paikallisen ajan ja aikavyöhykkeen erikseen. Suomi on
 * UTC+3 kesäaikaa ja UTC+2 talviaikaa; Veikkausliigaa pelataan huhti–marras,
 * joten molemmat osuvat kauteen ja siirtymä on laskettava eikä arvattava.
 *
 * Tehdään `Intl`:llä eikä kiinteällä siirtymällä: kesäajan vaihtopäivä
 * siirtyy vuosittain, ja väärä tunti siirtäisi illan ottelut väärälle
 * kalenteripäivälle.
 */
export function helsinkiToUtc(date: string, time: string): string | null {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time || '00:00:00').split(':').map(Number);
  if (!y || !m || !d || !Number.isFinite(hh) || !Number.isFinite(mm)) return null;

  // Oletetaan ensin UTC ja mitataan Helsingin siirtymä sinä hetkenä.
  //
  // MOLEMMAT renderöinnit jäsennetään samalla tavalla, jotta ajokoneen oma
  // aikavyöhyke kumoutuu. Pelkkä Helsinki-renderöinnin vertaaminen raakaan
  // UTC-lukuun toimii VAIN jos ajokone sattuu olemaan UTC:ssä — Suomessa
  // ajettuna siirtymäksi mitattiin nolla ja illan ottelut jäivät väärään
  // tuntiin.
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const asHelsinki = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'Europe/Helsinki' }));
  const asUtc = new Date(new Date(guess).toLocaleString('en-US', { timeZone: 'UTC' }));
  const offsetMs = asHelsinki.getTime() - asUtc.getTime();

  const utc = new Date(guess - offsetMs);
  return Number.isNaN(utc.getTime()) ? null : utc.toISOString();
}

export function parseMatches(matches: TorneopalMatch[]): VeikkausliigaFixture[] {
  const out: VeikkausliigaFixture[] = [];

  for (const m of matches) {
    const home = m.team_A_name?.trim();
    const away = m.team_B_name?.trim();
    // Ilman nimiä tai päivää rivi ei ole ottelu. Pudotetaan hiljaa —
    // tulospalvelussa on myös paikanvaraajia joilta joukkue puuttuu.
    if (!m.match_id || !m.date || !home || !away) continue;

    const kickoff = helsinkiToUtc(m.date, m.time ?? '00:00:00');
    if (!kickoff) continue;

    const played = m.status === 'Played';
    const hs = Number(m.fs_A);
    const as = Number(m.fs_B);

    out.push({
      match_id: String(m.match_id),
      date: m.date,
      kickoff,
      home,
      away,
      status: played ? 'finished' : 'upcoming',
      home_score: played && Number.isFinite(hs) ? hs : null,
      away_score: played && Number.isFinite(as) ? as : null,
      venue: m.venue_name?.trim() || null,
    });
  }

  return out.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
}

async function fetchRaw(competition: string): Promise<TorneopalMatch[]> {
  const url = `${BASE}/getMatches?${QUERY_TOKEN}&competition_id=${competition}&category_id=${CATEGORY_ID}`;
  const res = await fetch(url, {
    headers: {
      accept: `json/${API_KEY}`,
      Origin: ORIGIN,
      Referer: `${ORIGIN}/`,
      'User-Agent': 'BetTracker/1.0 (harrastusprojekti)',
    },
  });
  if (!res.ok) throw new Error(`Tulospalvelu ${competition}: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { matches?: TorneopalMatch[] };
  return data.matches ?? [];
}

/**
 * Kauden otteluohjelma. Välimuisti 6 h: otteluohjelma muuttuu harvoin, ja
 * tuloksia varten on oma lähteensä.
 *
 * Palauttaa tyhjän listan jos haku pettää — kalenteri toimii ilman tätäkin,
 * eikä yhden sarjan puuttuminen saa kaataa muita.
 */
export async function fetchVeikkausliigaFixtures(now = new Date()): Promise<VeikkausliigaFixture[]> {
  const competition = competitionId(now.getUTCFullYear());
  try {
    const raw = await cached(`veikkausliiga-fixtures-${competition}`, () => fetchRaw(competition), 6 * 3600_000);
    const parsed = parseMatches(raw);

    // Rakenteellinen tarkistus: koko kausi on 132 ottelua. Jos vastaus on
    // olennaisesti pienempi, jokin on muuttunut eikä puolikasta ohjelmaa
    // kannata julkaista hiljaa.
    if (parsed.length < 50) {
      console.warn(`[Veikkausliiga] vain ${parsed.length} ottelua — odotettua vähemmän, tarkista rajapinta`);
    }
    return parsed;
  } catch (err) {
    console.warn(`[Veikkausliiga] otteluohjelmaa ei saatu: ${(err as Error).message}`);
    return [];
  }
}
