// Tiketti #24 (vaihtoehto B): Sarjataulukko Wikipediasta
//
// Miksi Wikipedia eikä veikkausliiga.com:
//   1. veikkausliiga.com ei tarjoa välisertifikaattia → Node fetch kaatuu
//      virheeseen UNABLE_TO_VERIFY_LEAF_SIGNATURE. Selain ja curl selviävät
//      hakemalla puuttuvan sertin AIA-kentän kautta, Node ei tee sitä.
//      Kierto olisi ollut TLS-tarkistuksen ohitus — sitä ei tehdä.
//   2. Wikipedian sarjataulukot ovat vakiomuotoisia (Pos/Team/Pld/W/D/L/GF/GA/Pts)
//      kaikissa sarjoissa, joten sama parsija kattaa minkä tahansa sarjan.
//   3. MediaWiki-API on julkinen ja nimenomaan uudelleenkäyttöä varten.
//
// Luvut tarkistettu veikkausliiga.comia vasten 14.8.2026: identtiset.
//
// ⚠️ Silti hauras: sivun taulukkojärjestys voi muuttua. Parsinta validoi
// tuloksen ja heittää selkeän virheen, ja kutsuja putoaa market-only-tilaan.

import { pathToFileURL } from 'node:url';
import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';
import { cached } from './cache.js';

const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'BetTracker/0.1 (henkilökohtainen analyysityökalu)';

/**
 * Kotietujakauma kun mitattuja splittejä ei ole.
 * Jalkapallossa kotijoukkueet tekevät tyypillisesti ~55 % maaleista.
 * Merkitään snapshotiin (splitsEstimated), jotta luku ei esiinny mitattuna.
 */
const HOME_GOAL_SHARE = 0.55;

async function fetchPageHtml(page: string): Promise<string> {
  const url = `${API}?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Wikipedia: ${res.status} ${res.statusText}`);

  const json = (await res.json()) as { parse?: { text?: string }; error?: { info?: string } };
  if (json.error) throw new Error(`Wikipedia: ${json.error.info ?? 'tuntematon virhe'}`);

  const html = json.parse?.text;
  if (!html) throw new Error(`Wikipedia: sivua "${page}" ei löytynyt`);
  return html;
}

function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '–')
    .trim();
}

/** "KuPS (Q)" → "KuPS", "Arsenal[a]" → "Arsenal" */
function cleanTeamName(raw: string): string {
  return raw
    .replace(/\([A-Z]+\)/g, '') // (Q), (C), (R) — karsinta-/mestaruusmerkinnät
    .replace(/\[[^\]]*\]/g, '') // alaviitteet
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Etsi sarjataulukko sivun wikitable-taulukoista.
 * Tunnistetaan otsikoista: sarjataulukossa on aina Pld, GF ja GA.
 */
export function parseWikipediaStandings(html: string, league: string, season: string): LeagueSeasonStats {
  const tables = html.match(/<table[^>]*class="[^"]*wikitable[^"]*"[\s\S]*?<\/table>/g) ?? [];

  for (const table of tables) {
    const heads = [...table.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => cellText(m[1]));
    const idx = {
      pos: heads.findIndex((h) => h === 'Pos'),
      team: heads.findIndex((h) => h === 'Team'),
      pld: heads.findIndex((h) => h === 'Pld'),
      w: heads.findIndex((h) => h === 'W'),
      d: heads.findIndex((h) => h === 'D'),
      l: heads.findIndex((h) => h === 'L'),
      gf: heads.findIndex((h) => h === 'GF'),
      ga: heads.findIndex((h) => h === 'GA'),
      pts: heads.findIndex((h) => h === 'Pts'),
    };
    if (idx.pld < 0 || idx.gf < 0 || idx.ga < 0 || idx.pts < 0) continue;

    const teams: TeamSeasonStats[] = [];
    for (const rowMatch of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => cellText(m[1]));
      if (cells.length <= idx.pts) continue;
      if (!/^\d+$/.test(cells[idx.pos] ?? '')) continue; // otsikko- ja selitysrivit ohi

      const name = cleanTeamName(cells[idx.team] ?? '');
      const nums = {
        played: Number(cells[idx.pld]),
        won: Number(cells[idx.w]),
        draw: Number(cells[idx.d]),
        lost: Number(cells[idx.l]),
        gf: Number(cells[idx.gf]),
        ga: Number(cells[idx.ga]),
        points: Number(cells[idx.pts]),
      };
      if (!name || Object.values(nums).some((n) => !Number.isFinite(n))) continue;

      teams.push({
        name,
        aliases: [],
        rank: Number(cells[idx.pos]),
        ...nums,
        // Sarjataulukko ei erittele koti- ja vieraspelejä
        home_played: null,
        home_gf: null,
        home_ga: null,
        away_played: null,
        away_gf: null,
        away_ga: null,
        form: null,
      });
    }

    if (teams.length >= 8) return finalize(teams, league, season);
  }

  throw new Error(
    `Wikipedia: sarjataulukkoa ei löytynyt (${tables.length} wikitable-taulukkoa tutkittu) — sivun rakenne on muuttunut`
  );
}

/**
 * Sarjataulukon rakenteellinen tarkistus.
 *
 * Sarjataulukossa pätee aina: jokainen maali on jonkun tekemä ja jonkun
 * päästämä (ΣTM = ΣPM), ja jokainen voitto on jonkun häviö (ΣV = ΣH).
 * Jos nämä eivät täsmää, sarakkeet on luettu väärin — sivun rakenne on
 * muuttunut. Ilman tätä tarkistusta väärin luettu taulukko menisi läpi
 * hiljaa ja koko analyysi laskettaisiin vääristä luvuista.
 */
function assertTableBalances(teams: TeamSeasonStats[]): void {
  const sum = (f: (t: TeamSeasonStats) => number) => teams.reduce((a, t) => a + f(t), 0);

  const gf = sum((t) => t.gf);
  const ga = sum((t) => t.ga);
  if (gf !== ga) {
    throw new Error(`Sarjataulukko ei täsmää: tehdyt maalit ${gf} ≠ päästetyt ${ga} — sarakkeet luettu väärin`);
  }

  const won = sum((t) => t.won);
  const lost = sum((t) => t.lost);
  if (won !== lost) {
    throw new Error(`Sarjataulukko ei täsmää: voitot ${won} ≠ häviöt ${lost} — sarakkeet luettu väärin`);
  }

  const mismatched = teams.filter((t) => t.won + t.draw + t.lost !== t.played);
  if (mismatched.length) {
    throw new Error(
      `Sarjataulukko ei täsmää: ${mismatched[0].name} — V+T+H (${mismatched[0].won}+${mismatched[0].draw}+${mismatched[0].lost}) ≠ pelatut (${mismatched[0].played})`
    );
  }
}

function finalize(teams: TeamSeasonStats[], league: string, season: string): LeagueSeasonStats {
  assertTableBalances(teams);

  // Jokainen ottelu esiintyy taulukossa kahdesti (koti + vieras),
  // joten otteluiden määrä on pelattujen summa jaettuna kahdella.
  const totalGoals = teams.reduce((s, t) => s + t.gf, 0);
  const totalMatches = teams.reduce((s, t) => s + t.played, 0) / 2;
  const goalsPerMatch = totalMatches > 0 ? totalGoals / totalMatches : 2.7;

  return {
    league,
    season,
    teams,
    homeGoalsAvg: goalsPerMatch * HOME_GOAL_SHARE,
    awayGoalsAvg: goalsPerMatch * (1 - HOME_GOAL_SHARE),
    source: 'Wikipedia (sarjataulukko)',
    splitsEstimated: true,
  };
}

/** Hae sarjataulukko Wikipedian sivulta */
export async function fetchWikipediaStats(page: string, league: string, season: string): Promise<LeagueSeasonStats> {
  const html = await cached(`wikipedia-${page}`, () => fetchPageHtml(page));
  return parseWikipediaStandings(html, league, season);
}

/** Veikkausliiga: kalenterikausi, sivun nimi muotoa "2026 Veikkausliiga" */
export function fetchVeikkausliigaStats(year: number): Promise<LeagueSeasonStats> {
  return fetchWikipediaStats(`${year} Veikkausliiga`, 'Veikkausliiga', String(year));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const year = Number(process.argv[2]) || new Date().getFullYear();

  fetchVeikkausliigaStats(year)
    .then((s) => {
      console.log(`${s.league} — kausi ${s.season} (${s.source})`);
      console.log(
        `Sarjan maalikeskiarvot: koti ${s.homeGoalsAvg.toFixed(2)}, vieras ${s.awayGoalsAvg.toFixed(2)} (estimoitu ${(HOME_GOAL_SHARE * 100).toFixed(0)} %:n kotiosuudella)\n`
      );
      console.log('  # joukkue              pel   TM/p  PM/p  pist');
      for (const t of s.teams) {
        console.log(
          `  ${String(t.rank).padStart(2)} ${t.name.padEnd(22)} ${String(t.played).padStart(3)}  ${(t.gf / t.played).toFixed(2).padStart(5)} ${(t.ga / t.played).toFixed(2).padStart(5)}  ${String(t.points).padStart(4)}`
        );
      }
    })
    .catch((err) => {
      console.error('Haku epäonnistui:', err.message);
      process.exit(1);
    });
}
