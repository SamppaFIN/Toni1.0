// Tiketti #36: Veikkausliigan kauden ottelutulokset
//
// The Odds APIn /scores kattaa vain kolme päivää taaksepäin, joten koko kauden
// tuloshistoriaa siitä ei saa. Kausi-Elo (analyze/season-elo.ts) tarvitsee
// jokaisen pelatun ottelun järjestyksessä, ja veikkausliigapelit.fi julkaisee
// ne yhdellä sivulla.
//
// robots.txt: "User-agent: * / Allow: /" — tarkistettu 15.8.2026.
//
// ⚠️ HAURAS, kuten Wikipedia-adapterikin. Sivun HTML voi muuttua. Siksi
// parsinta validoi tuloksen ja heittää selkeän virheen; kutsuja päättää
// putoaako ilman kausi-Eloa.

import { pathToFileURL } from 'node:url';
import { MarketSide } from '../types-football.js';
import { cached } from './cache.js';

const URL_2026 = 'https://veikkausliigapelit.fi/';
const USER_AGENT = 'BetTracker/0.1 (henkilökohtainen analyysityökalu)';

export interface SeasonMatch {
  date: string; // ISO, esim. "2026-08-14"
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  outcome: MarketSide;
}

/**
 * Sivun joukkuenimet poikkeavat kerroinlähteen nimistä (ruotsinkielisiä ja
 * pitkiä muotoja). Kartta on eksplisiittinen, koska hiljainen täsmäytysvirhe
 * antaisi joukkueelle väärän Elo-luvun — pahempaa kuin puuttuva luku.
 */
export const TEAM_NAME_MAP: Record<string, string> = {
  'HJK Helsingfors': 'HJK Helsinki',
  'Turun Palloseura': 'TPS Turku',
  'Tampereen Ilves': 'Ilves Tampere',
  'Seinajoen JK': 'SJK Seinäjoki',
  'Seinäjoen JK': 'SJK Seinäjoki',
  Gnistan: 'IF Gnistan',
  'FC Inter': 'FC Inter Turku',
  KuPS: 'KuPS Kuopio',
  VPS: 'VPS Vaasa',
  'FC Lahti': 'FC Lahti',
  'AC Oulu': 'AC Oulu',
  'FF Jaro': 'Jaro',
  'IFK Mariehamn': 'IFK Mariehamn',
};

export function normalizeTeam(name: string): string {
  return TEAM_NAME_MAP[name] ?? name;
}

function outcomeOf(home: number, away: number): MarketSide {
  if (home > away) return 'home';
  if (home < away) return 'away';
  return 'draw';
}

/**
 * Parsi ottelutulokset sivun HTML:stä.
 *
 * Tokenipohjainen eikä yksi iso regex: sivu erottelee kentät sisäkkäisillä
 * elementeillä, joten tagien poiston jälkeen rivi on muotoa
 *   ISO-päivä | näyttöpäivä | koti | tulos-tai-kellonaika | vieras | stadion
 * Kellonaika tarkoittaa tulevaa ottelua, "X-Y" pelattua.
 */
export function parseSeasonResults(html: string): SeasonMatch[] {
  const anchor = html.indexOf('id="matchschema"');
  if (anchor < 0) {
    throw new Error('veikkausliigapelit.fi: ottelutaulua (id="matchschema") ei löytynyt — sivun rakenne on muuttunut');
  }

  const tokens = html
    .slice(anchor)
    .replace(/<[^>]+>/g, '|')
    .replace(/[ \t\r\n]+/g, ' ')
    .split('|')
    .map((t) => t.trim())
    .filter(Boolean);

  const matches: SeasonMatch[] = [];

  for (let i = 0; i + 4 < tokens.length; i++) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tokens[i])) continue;

    const [date, , home, middle, away] = tokens.slice(i, i + 5);
    const score = middle.match(/^(\d+)-(\d+)$/);
    if (!score) continue; // kellonaika = tuleva ottelu, ohitetaan

    matches.push({
      date,
      home: normalizeTeam(home),
      away: normalizeTeam(away),
      homeScore: Number(score[1]),
      awayScore: Number(score[2]),
      outcome: outcomeOf(Number(score[1]), Number(score[2])),
    });
    i += 4;
  }

  if (matches.length < 20) {
    throw new Error(`veikkausliigapelit.fi: vain ${matches.length} tulosta jäsentyi — parsinta on rikki`);
  }

  // Rakenteellinen tarkistus, sama periaate kuin sarjataulukolla: jokaisella
  // ottelulla on kaksi joukkuetta eikä joukkue pelaa itseään vastaan.
  const broken = matches.filter((m) => !m.home || !m.away || m.home === m.away);
  if (broken.length) {
    throw new Error(`veikkausliigapelit.fi: ${broken.length} ottelua jäsentyi virheellisesti — kenttäjärjestys on muuttunut`);
  }

  // Vanhin ensin — Elo-laskenta vaatii kronologisen järjestyksen
  return matches.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchSeasonHtml(): Promise<string> {
  const res = await fetch(URL_2026, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`veikkausliigapelit.fi: ${res.status} ${res.statusText}`);
  return res.text();
}

export async function fetchSeasonResults(): Promise<SeasonMatch[]> {
  const html = await cached('veikkausliigapelit-2026', fetchSeasonHtml, 6 * 3600_000);
  return parseSeasonResults(html);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const matches = await fetchSeasonResults();
  console.log(`${matches.length} pelattua ottelua, ${matches[0].date} → ${matches[matches.length - 1].date}\n`);
  for (const m of matches.slice(-8)) {
    console.log(`  ${m.date}  ${m.home.padEnd(16)} ${m.homeScore}–${m.awayScore}  ${m.away}`);
  }
}
