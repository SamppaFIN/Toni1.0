// Tiketti #57: Kauden ottelutulokset ESPN:stä — Elo-laskentaa varten
//
// MIKSI ESPN EIKÄ football-data.org:
// Molemmat antaisivat Valioliigan tulokset, mutta ESPN ei vaadi avainta.
// Se tarkoittaa että tämä on ajettavissa ja testattavissa paikallisesti ilman
// salaisuuksia — ja Elo on juuri se luku jonka pitää olla tarkistettavissa
// käsin. football-data.org jää tunnuslukujen (sarjataulukko) lähteeksi.
//
// Sama SeasonMatch-muoto kuin results-veikkausliiga.ts:llä, jotta
// season-elo.ts saa molemmilta identtisen syötteen eikä tiedä eroa.
//
// REHELLINEN VARAUS: ESPN:n rajapinta on dokumentoimaton (ks. myös
// public/app/football-espn.js). Se voi muuttua ilman varoitusta, joten haku on
// virheenkäsittelyn takana ja Elo jää silloin pois — se on lisätieto, ei ehto
// analyysille.

import { pathToFileURL } from 'node:url';
import { SeasonMatch } from './results-veikkausliiga.js';
import { MarketSide } from '../types-football.js';
import { cached } from './cache.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

/** The Odds APIn sarjatunniste → ESPN:n sarjakoodi */
export const ESPN_LEAGUE_CODES: Record<string, string> = {
  soccer_epl: 'eng.1',
  soccer_efl_champ: 'eng.2',
  soccer_spain_la_liga: 'esp.1',
  soccer_italy_serie_a: 'ita.1',
  soccer_germany_bundesliga: 'ger.1',
  soccer_france_ligue_one: 'fra.1',
  soccer_finland_veikkausliiga: 'fin.1',
};

export function hasEspnResults(sportKey: string): boolean {
  return sportKey in ESPN_LEAGUE_CODES;
}

interface EspnCompetitor {
  homeAway?: string;
  score?: string | number | null;
  team?: { displayName?: string };
}

interface EspnEvent {
  date?: string;
  status?: { type?: { state?: string } };
  competitions?: Array<{ competitors?: EspnCompetitor[] }>;
}

/** YYYYMMDD ESPN:n dates-parametrille */
function ymd(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Kauden alkupäivä. Syksy–kevät-sarjoissa kausi alkaa heinäkuussa, joten
 * heinäkuusta eteenpäin ollaan jo uudessa kaudessa — sama sääntö kuin
 * ingest/stats.ts:n seasonYearAutumnSpring.
 */
export function seasonStart(now: Date): Date {
  const year = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return new Date(Date.UTC(year, 6, 1)); // 1.7.
}

/** Puhdas jäsennys — testattavissa ilman verkkoa */
export function parseEspnResults(events: EspnEvent[]): SeasonMatch[] {
  const out: SeasonMatch[] = [];

  for (const e of events ?? []) {
    // Vain päättyneet: kesken oleva ottelu vääristäisi Elon, ja se korjaantuisi
    // vasta seuraavalla ajolla — hiljainen virhe on pahin laji.
    if (e.status?.type?.state !== 'post') continue;

    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find((c) => c.homeAway === 'home');
    const away = comp?.competitors?.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;

    const homeName = home.team?.displayName;
    const awayName = away.team?.displayName;
    if (!homeName || !awayName) continue;

    const hs = Number(home.score);
    const as = Number(away.score);
    if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;

    const outcome: MarketSide = hs > as ? 'home' : as > hs ? 'away' : 'draw';
    out.push({
      date: (e.date ?? '').slice(0, 10),
      home: homeName,
      away: awayName,
      homeScore: hs,
      awayScore: as,
      outcome,
    });
  }

  // Elo on järjestysherkkä: jokainen ottelu käyttää sitä edeltäviä lukuja
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchRange(leagueCode: string, from: Date, to: Date): Promise<EspnEvent[]> {
  const url = `${BASE}/${leagueCode}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=500`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`ESPN ${leagueCode}: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { events?: EspnEvent[] };
  return data.events ?? [];
}

/**
 * Kauden kaikki päättyneet ottelut. Välimuisti 1 h: tulokset muuttuvat vain
 * ottelupäivinä, eikä Elo tarvitse minuutin tarkkuutta.
 */
export async function fetchSeasonResultsEspn(sportKey: string, now = new Date()): Promise<SeasonMatch[]> {
  const code = ESPN_LEAGUE_CODES[sportKey];
  if (!code) throw new Error(`Ei ESPN-sarjakoodia: ${sportKey}`);

  const from = seasonStart(now);
  const key = `espn-results-${code}-${ymd(from)}-${ymd(now)}`;
  const events = await cached(key, () => fetchRange(code, from, now), 3600_000);
  return parseEspnResults(events);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sportKey = process.argv[2] || 'soccer_epl';
  fetchSeasonResultsEspn(sportKey)
    .then((matches) => {
      console.log(`${sportKey}: ${matches.length} pelattua ottelua\n`);
      for (const m of matches) {
        console.log(`  ${m.date}  ${m.home} ${m.homeScore}-${m.awayScore} ${m.away}  (${m.outcome})`);
      }
    })
    .catch((err) => {
      console.error('Haku epäonnistui:', err.message);
      process.exit(1);
    });
}
