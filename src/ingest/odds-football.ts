// Tiketti #25: Jalkapallokertoimien haku The Odds API:sta
//
// Erillinen tiedosto jääkiekon odds.ts:stä tarkoituksella: jääkiekkoputki ja sen
// testit toimivat ennallaan eikä niitä tarvitse koskea.
//
// TÄRKEIN OPPI TÄSTÄ TIKETISTÄ: API palauttaa jokaisesta toimistosta sekä
// `key` (kuten "unibet_se") että `title` (kuten "Unibet (SE)"). Vanha
// parseOddsResponse() heitti titlen pois ja tallensi keyn näyttönimeksi.
// demo.html:n kerroinsuodatin vertaa näyttönimiä tarkalla yhtäsuuruudella,
// joten "unibet_se" !== "Unibet" → kaikki rivit olisi pudonnut hiljaa pois.
// Nyt title kulkee näyttönimenä ja key säilyy tunnisteena.

import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { BookmakerOdds, TeamRef } from '../types-football.js';

export interface OddsApiOutcome {
  name: string;
  price: number;
}

export interface OddsApiBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: Array<{ key: string; last_update?: string; outcomes: OddsApiOutcome[] }>;
}

export interface OddsApiEvent {
  id: string;
  sport_key: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: OddsApiBookmaker[];
}

export interface QuotaInfo {
  remaining: number | null;
  used: number | null;
  lastCost: number | null;
}

export interface FetchOddsResult {
  events: OddsApiEvent[];
  quota: QuotaInfo;
}

/**
 * Oletusallowlist: yksi variantti per brändi.
 *
 * API tarjoaa Veikkausliigaan mm. unibet_se, unibet_nl ja unibet_fr, joilla on
 * käytännössä identtiset kertoimet. Jos kaikki päästetään läpi, ottelukortti
 * täyttyy saman toimiston kopioista ja "paras kerroin" -tähti menettää merkityksensä.
 * Pinnacle ja Betfair ovat listalla ensin, koska niitä käytetään sharp-ankkurina.
 */
/**
 * Vedonvälityspörssien komissiot voitosta.
 *
 * Pörssin näyttämä kerroin on aina houkuttelevampi kuin kirjan, koska komissio
 * veloitetaan vasta voitosta. Ilman tätä korjausta pörssi voittaa "paras kerroin"
 * -vertailun lähes aina ja edge on systemaattisesti yliarvioitu — juuri niissä
 * kohteissa jotka näyttävät parhailta löydöiltä.
 *
 * Arvot ovat kunkin pörssin vakiotaso; oikea komissio riippuu käyttäjän
 * palkintopisteistä ja markkinasta, joten nämä ovat konservatiivisia oletuksia.
 */
export const EXCHANGE_COMMISSION: Record<string, number> = {
  betfair_ex_eu: 0.05,
  betfair_ex_uk: 0.05,
  betfair_ex_au: 0.05,
  matchbook: 0.015,
  smarkets: 0.02,
  betdaq: 0.02,
};

export function commissionFor(bookmakerKey: string): number {
  return EXCHANGE_COMMISSION[bookmakerKey.toLowerCase()] ?? 0;
}

export const DEFAULT_FOOTBALL_BOOKMAKERS = [
  'pinnacle',
  'betfair_ex_eu',
  'matchbook',
  'unibet_se',
  'nordicbet',
  'betsson',
  'coolbet',
  'williamhill',
  'marathonbet',
  'onexbet',
];

/** Hae yhden sarjan kertoimet. Palauttaa myös kvoottatiedot vastausotsakkeista. */
export async function fetchFootballOdds(sportKey: string): Promise<FetchOddsResult> {
  if (!config.odds.apiKey) {
    console.warn('[Odds] ODDS_API_KEY puuttuu — ohitetaan haku');
    return { events: [], quota: { remaining: null, used: null, lastCost: null } };
  }

  const params = new URLSearchParams({
    apiKey: config.odds.apiKey,
    regions: config.odds.regions,
    markets: config.odds.markets,
    oddsFormat: 'decimal',
  });
  const url = `${config.odds.baseUrl}/sports/${sportKey}/odds/?${params}`;

  const res = await fetch(url);
  const quota: QuotaInfo = {
    remaining: numOrNull(res.headers.get('x-requests-remaining')),
    used: numOrNull(res.headers.get('x-requests-used')),
    lastCost: numOrNull(res.headers.get('x-requests-last')),
  };

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Odds API ${sportKey} epäonnistui: ${res.status} ${res.statusText} — ${body.slice(0, 200)}`);
  }

  return { events: (await res.json()) as OddsApiEvent[], quota };
}

/**
 * Poimi yhden ottelun 1X2-kertoimet kaikilta toimistoilta.
 * Tasapelin nimi on API:ssa aina "Draw"; koti ja vieras tunnistetaan
 * tapahtuman home_team/away_team-kentistä eikä listan järjestyksestä.
 */
export function parseEventOdds(event: OddsApiEvent): BookmakerOdds[] {
  const rows: BookmakerOdds[] = [];

  for (const book of event.bookmakers) {
    const h2h = book.markets.find((m) => m.key === 'h2h');
    if (!h2h) continue;

    const home = h2h.outcomes.find((o) => o.name === event.home_team);
    const away = h2h.outcomes.find((o) => o.name === event.away_team);
    const draw = h2h.outcomes.find((o) => o.name === 'Draw');
    if (!home || !away || !draw) continue;
    if (!(home.price > 1) || !(draw.price > 1) || !(away.price > 1)) continue;

    rows.push({
      bookmaker: book.title, // näyttönimi — EI key
      key: book.key,
      market: '1X2',
      home: home.price,
      draw: draw.price,
      away: away.price,
      commission: commissionFor(book.key),
      fetched_at: book.last_update || new Date().toISOString(),
    });
  }

  return rows;
}

/** Suodata allowlistan mukaan. Tyhjä allowlist = kaikki läpi. */
export function filterByAllowlist(rows: BookmakerOdds[], allowlist: string[]): BookmakerOdds[] {
  if (!allowlist.length) return rows;
  const allowed = new Set(allowlist.map((b) => b.toLowerCase()));
  return rows.filter((r) => allowed.has(r.key.toLowerCase()));
}

// ─── Joukkueiden nimet ja tunnukset ───────────────────────────────────────

/**
 * Odds API käyttää pitkiä nimiä ("FC Inter Turku", "VPS Vaasa"). Ottelukortti
 * tarvitsee lyhyen tunnuksen ja värin. Tunnetuille seuroille käytetään
 * vakiintunutta lyhennettä; tuntemattomille johdetaan deterministisesti.
 */
const KNOWN_TEAMS: Record<string, { short: string; color: string }> = {
  'HJK Helsinki': { short: 'HJK', color: '#0047AB' },
  'KuPS Kuopio': { short: 'KUP', color: '#FFDD00' },
  'FC Inter Turku': { short: 'INT', color: '#004B93' },
  'SJK Seinäjoki': { short: 'SJK', color: '#000000' },
  'VPS Vaasa': { short: 'VPS', color: '#C8102E' },
  'TPS Turku': { short: 'TPS', color: '#000000' },
  'IFK Mariehamn': { short: 'IFK', color: '#E4002B' },
  'AC Oulu': { short: 'ACO', color: '#00539F' },
  'Ilves Tampere': { short: 'ILV', color: '#00843D' },
  'FF Jaro': { short: 'JAR', color: '#D50032' },
  Jaro: { short: 'JAR', color: '#D50032' },
  'KTP Kotka': { short: 'KTP', color: '#F4C300' },
  'Gnistan Helsinki': { short: 'GNI', color: '#F58220' },
};

/** Vakiovärit tuntemattomille joukkueille — deterministinen valinta nimestä */
const FALLBACK_COLORS = ['#1F6FEB', '#238636', '#DA3633', '#9E6A03', '#8250DF', '#0E7490', '#BF3989', '#57606A'];

export function teamRef(name: string): TeamRef {
  const known = KNOWN_TEAMS[name];
  if (known) return { name, short: known.short, color: known.color };

  // Pudota seuraetuliitteet/loppuliitteet lyhennettä varten
  const words = name
    .replace(/\b(FC|AC|IF|IFK|FF|SC|CF|AFC|United|City)\b/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const base = (words[0] || name).replace(/[^A-Za-zÅÄÖåäö]/g, '');
  const short = (base.slice(0, 3) || name.slice(0, 3)).toUpperCase();

  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 100000;
  return { name, short, color: FALLBACK_COLORS[hash % FALLBACK_COLORS.length] };
}

// ─── Kokoava haku ─────────────────────────────────────────────────────────

export interface FootballOddsEvent {
  eventId: string;
  sportKey: string;
  league: string;
  kickoff: string;
  home: TeamRef;
  away: TeamRef;
  odds: BookmakerOdds[];
}

/** Sarjan tunnisteesta luettava nimi */
export function leagueLabel(sportKey: string): string {
  const labels: Record<string, string> = {
    soccer_finland_veikkausliiga: 'Veikkausliiga',
    soccer_epl: 'Valioliiga',
    soccer_efl_champ: 'Championship',
    soccer_spain_la_liga: 'La Liga',
    soccer_italy_serie_a: 'Serie A',
    soccer_germany_bundesliga: 'Bundesliga',
    soccer_france_ligue_one: 'Ligue 1',
    soccer_uefa_champs_league: 'Mestarien liiga',
  };
  return labels[sportKey] || sportKey.replace(/^soccer_/, '').replace(/_/g, ' ');
}

export interface IngestOptions {
  /** Vain ottelut jotka alkavat tämän ajanhetken jälkeen */
  from?: Date;
  /** Vain ottelut jotka alkavat ennen tätä */
  until?: Date;
  allowlist?: string[];
}

/**
 * Hae kertoimet kaikille konfiguroiduille sarjoille.
 * Kunnioittaa vuorokausibudjettia: lopettaa ennen kuin kvootta palaa loppuun.
 */
export async function ingestFootballOdds(options: IngestOptions = {}): Promise<FootballOddsEvent[]> {
  const allowlist = options.allowlist ?? DEFAULT_FOOTBALL_BOOKMAKERS;
  const sports = config.odds.footballSports;
  const results: FootballOddsEvent[] = [];

  let creditsSpent = 0;
  // Yksi pyyntö kuluttaa markkinat × alueet krediittiä
  const costPerRequest = config.odds.markets.split(',').length * config.odds.regions.split(',').length;

  for (const sportKey of sports) {
    if (creditsSpent + costPerRequest > config.odds.dailyCreditBudget) {
      console.warn(
        `[Odds] Vuorokausibudjetti (${config.odds.dailyCreditBudget} krediittiä) täynnä — ohitetaan ${sports.length - sports.indexOf(sportKey)} sarjaa: ${sports.slice(sports.indexOf(sportKey)).join(', ')}`
      );
      break;
    }

    const { events, quota } = await fetchFootballOdds(sportKey);
    creditsSpent += quota.lastCost ?? costPerRequest;
    console.log(
      `[Odds] ${leagueLabel(sportKey)}: ${events.length} ottelua — kvootta jäljellä ${quota.remaining ?? '?'}, käytetty ${quota.used ?? '?'}`
    );

    for (const event of events) {
      const kickoff = new Date(event.commence_time);
      if (options.from && kickoff < options.from) continue;
      if (options.until && kickoff > options.until) continue;

      const odds = filterByAllowlist(parseEventOdds(event), allowlist);
      if (!odds.length) {
        console.warn(`[Odds] ${event.home_team} vs ${event.away_team}: ei kertoimia allowlistan toimistoilta — ohitetaan`);
        continue;
      }

      results.push({
        eventId: event.id,
        sportKey,
        league: leagueLabel(sportKey),
        kickoff: kickoff.toISOString(),
        home: teamRef(event.home_team),
        away: teamRef(event.away_team),
        odds,
      });
    }
  }

  console.log(`[Odds] Yhteensä ${results.length} ottelua, ${creditsSpent} krediittiä käytetty`);
  return results;
}

function numOrNull(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestFootballOdds()
    .then((events) => {
      for (const e of events) {
        console.log(`\n${e.home.name} (${e.home.short}) vs ${e.away.name} (${e.away.short})  —  ${e.league}, ${e.kickoff}`);
        for (const o of e.odds) {
          console.log(`  ${o.bookmaker.padEnd(20)} ${o.home.toFixed(2)} / ${o.draw.toFixed(2)} / ${o.away.toFixed(2)}`);
        }
      }
    })
    .catch((err) => {
      console.error('[Odds] Haku epäonnistui:', err.message);
      process.exit(1);
    });
}
