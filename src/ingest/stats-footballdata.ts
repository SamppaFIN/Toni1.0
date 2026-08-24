// Tiketti #24 (vaihtoehto A + C): Sarjataulukot football-data.orgista
//
// Ilmaistaso kattaa 13 sarjaa nykyiseltä kaudelta: Valioliiga, Championship,
// La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira, CL, EM, MM,
// Brasileirão, Copa Libertadores. Ei Veikkausliigaa — se tulee omasta
// adapterista (stats-veikkausliiga.ts).
//
// API antaa kolme taulukkoa: TOTAL, HOME ja AWAY. Koti/vierassplitit tulevat
// siis mitattuina eikä estimoituina, mikä on Poisson-mallille arvokasta.

import { pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';
import { shrinkLeagueAverages, LEAGUE_AVG_PRIOR_MATCHES } from '../analyze/poisson.js';
import { cached } from './cache.js';
import { Throttle, withRetry, isRateLimit } from './throttle.js';

interface FdTeam {
  id: number;
  name: string;
  shortName?: string;
  tla?: string;
}

interface FdTableRow {
  position: number;
  team: FdTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  form?: string | null;
}

interface FdStandingsResponse {
  competition: { name: string; code: string };
  season: { startDate: string; endDate: string };
  standings: Array<{ type: 'TOTAL' | 'HOME' | 'AWAY'; table: FdTableRow[] }>;
}

/** Sarjakoodi → luettava nimi. Käytetään kun kertoimet ja tilastot yhdistetään. */
export const COMPETITION_LABELS: Record<string, string> = {
  PL: 'Valioliiga',
  ELC: 'Championship',
  PD: 'La Liga',
  SA: 'Serie A',
  BL1: 'Bundesliga',
  FL1: 'Ligue 1',
  DED: 'Eredivisie',
  PPL: 'Primeira Liga',
  CL: 'Mestarien liiga',
  BSA: 'Brasileirão',
};

/**
 * football-data.orgin ilmaistaso: 10 pyyntoa/min. Kahdeksalla sarjalla
 * pyyntoja on 16 (nykyinen + edellinen kausi kullekin), joten tahdistus on
 * pakollinen. 6.5 s valilla mahtuu ~9 pyyntoa minuutissa eli rajan alle
 * pienella marginaalilla.
 *
 * Jaettu instanssi: kaikki taman moduulin kutsut kulkevat saman jonon lapi.
 */
const fdThrottle = new Throttle(6_500, 'football-data.org');

async function fetchStandingsRaw(code: string, season?: number): Promise<FdStandingsResponse> {
  if (!config.footballData.token) throw new Error('FOOTBALL_DATA_TOKEN puuttuu');

  const url = `${config.footballData.baseUrl}/competitions/${code}/standings${season ? `?season=${season}` : ''}`;
  const label = `${code}${season ? ` (${season})` : ''}`;

  // Tahdistus estaa rajan ylityksen, uudelleenyritys korjaa sen jos raja
  // silti osuu (esim. toinen prosessi kaytti kiintiota samaan aikaan).
  return withRetry(
    () =>
      fdThrottle.run(async () => {
        const res = await fetch(url, { headers: { 'X-Auth-Token': config.footballData.token } });

        if (res.status === 429) {
          throw new Error(`football-data.org ${label}: 429 pyyntoraja ylittyi (10/min)`);
        }
        if (!res.ok) {
          throw new Error(`football-data.org ${label}: ${res.status} ${res.statusText}`);
        }
        return (await res.json()) as FdStandingsResponse;
      }),
    { attempts: 3, shouldRetry: isRateLimit, label }
  );
}
/** Muunna API:n taulukot normalisoituun muotoon */
export function parseStandings(data: FdStandingsResponse): LeagueSeasonStats {
  const total = data.standings.find((s) => s.type === 'TOTAL');
  if (!total) throw new Error('football-data.org: TOTAL-taulukko puuttuu vastauksesta');

  const home = data.standings.find((s) => s.type === 'HOME');
  const away = data.standings.find((s) => s.type === 'AWAY');
  const byId = (rows: FdTableRow[] | undefined, id: number) => rows?.find((r) => r.team.id === id);

  const teams: TeamSeasonStats[] = total.table.map((r) => {
    const h = byId(home?.table, r.team.id);
    const a = byId(away?.table, r.team.id);
    return {
      name: r.team.name,
      aliases: [r.team.shortName, r.team.tla].filter((x): x is string => !!x),
      rank: r.position,
      played: r.playedGames,
      won: r.won,
      draw: r.draw,
      lost: r.lost,
      gf: r.goalsFor,
      ga: r.goalsAgainst,
      home_played: h?.playedGames ?? null,
      home_gf: h?.goalsFor ?? null,
      home_ga: h?.goalsAgainst ?? null,
      away_played: a?.playedGames ?? null,
      away_gf: a?.goalsFor ?? null,
      away_ga: a?.goalsAgainst ?? null,
      // API antaa muodon "W,W,D,L,W" — tiivistetään "WWDLW"
      form: r.form ? r.form.replace(/[^WDL]/g, '') : null,
      points: r.points,
    };
  });

  // Sarjan koti/vieras-maalikeskiarvot mitatuista taulukoista.
  // Kotijoukkueiden yhteenlasketut maalit / kotiotteluiden määrä.
  const homeGoals = sum(teams.map((t) => t.home_gf ?? 0));
  const homeMatches = sum(teams.map((t) => t.home_played ?? 0));
  const awayGoals = sum(teams.map((t) => t.away_gf ?? 0));
  const awayMatches = sum(teams.map((t) => t.away_played ?? 0));

  const hasSplits = homeMatches > 0 && awayMatches > 0;

  // Kutistus prioriin otoskoon mukaan. Pelkkä "> 0" -portti ei riitä: kauden
  // avauskierroksella yksi pelattu ottelu läpäisi sen ja tuotti awayGoalsAvg = 0,
  // josta seurasi λ_vieras = 0 koko sarjaan. Ks. shrinkLeagueAverages().
  const averages = shrinkLeagueAverages(homeGoals, homeMatches, awayGoals, awayMatches);

  return {
    league: COMPETITION_LABELS[data.competition.code] || data.competition.name,
    season: data.season.startDate.slice(0, 4),
    teams,
    homeGoalsAvg: averages.homeGoals,
    awayGoalsAvg: averages.awayGoals,
    source: 'football-data.org',
    // Luku on "estimoitu" myös silloin kun priori yhä dominoi mitattua dataa —
    // käyttäjälle näytetään sama varoitus kuin puuttuvista spliteistä.
    splitsEstimated: !hasSplits || homeMatches + awayMatches < LEAGUE_AVG_PRIOR_MATCHES,
  };
}

/** Hae sarjataulukko. Vastaus kätketään, koska taulukko muuttuu vain ottelupäivinä. */
export async function fetchLeagueStats(code: string, season?: number): Promise<LeagueSeasonStats> {
  const key = `footballdata-${code}${season ? `-${season}` : '-current'}`;
  const raw = await cached(key, () => fetchStandingsRaw(code, season));
  return parseStandings(raw);
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const code = process.argv[2] || 'PL';
  const season = process.argv[3] ? Number(process.argv[3]) : undefined;

  fetchLeagueStats(code, season)
    .then((s) => {
      console.log(`${s.league} — kausi ${s.season} (${s.source})`);
      console.log(`Sarjan maalikeskiarvot: koti ${s.homeGoalsAvg.toFixed(2)}, vieras ${s.awayGoalsAvg.toFixed(2)}${s.splitsEstimated ? ' (ESTIMOITU)' : ''}\n`);
      console.log('  # joukkue              pel   TM/p  PM/p  form');
      for (const t of s.teams) {
        const gfPg = t.played ? (t.gf / t.played).toFixed(2) : '—';
        const gaPg = t.played ? (t.ga / t.played).toFixed(2) : '—';
        console.log(`  ${String(t.rank).padStart(2)} ${t.name.padEnd(22)} ${String(t.played).padStart(3)}  ${gfPg.padStart(5)} ${gaPg.padStart(5)}  ${t.form || '—'}`);
      }
    })
    .catch((err) => {
      console.error('Haku epäonnistui:', err.message);
      process.exit(1);
    });
}
