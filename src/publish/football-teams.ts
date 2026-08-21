// Tiketti #45: Valioliigan joukkue- ja voimataulukko
//
// Jääkiekkopuolella on "Joukkueet"-välilehti joka listaa kaikki joukkueet Elon
// mukaan järjestettynä (ks. demo.html renderTeams()). Jalkapallopuolella ei ole
// vastaavaa — tämä tiedosto julkaisee sen datan.
//
// Ei uutta Elo-järjestelmää: jalkapallon live-putki laskee jo hyökkäys-/
// puolustusvoimat oikeasta datasta (strength.ts, Poisson-malliin). Tässä sama
// voima näytetään KOKO sarjalle taulukkona, ei vain päivän otteluiden joukkueille.
//
// Sarja on kiinnitetty Valioliigaan (soccer_epl) ensimmäisenä oikean datan
// kohteena — Veikkausliiga-koodiin ei kosketa.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { TeamRef } from '../types-football.js';
import { fetchStatsFor, LeagueStatsPair } from '../ingest/stats.js';
import { strengthForTeam, StrengthResult } from '../analyze/strength.js';
import { teamRef } from '../ingest/odds-football.js';

const SPORT_KEY = 'soccer_epl';

export const TEAMS_SCHEMA_VERSION = 1;

export interface FootballTeamRow {
  rank: number | null;
  team: TeamRef;
  played: number;
  won: number;
  draw: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  form: string | null;
  /** 1.0 = sarjan keskitaso. Yli 1 = keskimääräistä parempi hyökkäys/puolustus. */
  attack: number;
  defense: number;
  basis: StrengthResult['basis'];
}

export interface FootballTeamsFile {
  schema_version: number;
  generated_at: string;
  league: string;
  season: string;
  source: string;
  teams: FootballTeamRow[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Puhdas funktio — testattavissa ilman verkkoa */
export function buildTeamsFile(pair: LeagueStatsPair, now = new Date()): FootballTeamsFile {
  const { current, previous } = pair;

  const teams: FootballTeamRow[] = current.teams
    .map((t): FootballTeamRow => {
      const result = strengthForTeam(t.name, current, previous);
      const strength = result?.strength ?? { attack: 1, defense: 1 };
      return {
        rank: t.rank,
        team: teamRef(t.name),
        played: t.played,
        won: t.won,
        draw: t.draw,
        lost: t.lost,
        gf: t.gf,
        ga: t.ga,
        points: t.points,
        form: t.form,
        attack: round2(strength.attack),
        defense: round2(strength.defense),
        basis: result?.basis ?? 'league-average',
      };
    })
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));

  if (!teams.length) throw new Error('Sarjataulukko on tyhjä — ei mitään julkaistavaa');

  return {
    schema_version: TEAMS_SCHEMA_VERSION,
    generated_at: now.toISOString(),
    league: current.league,
    season: current.season,
    source: current.source,
    teams,
  };
}

export function writeTeamsFile(publicDir: string, file: FootballTeamsFile): string {
  const dest = path.join(publicDir, 'data', 'football-teams.json');
  writeFileSync(dest, JSON.stringify(file, null, 2), 'utf8');
  return dest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

  fetchStatsFor(SPORT_KEY)
    .then((pair) => {
      if (!pair) {
        console.error(`[Joukkuetaulukko] ${SPORT_KEY}: tilastolähdettä ei saatu (FOOTBALL_DATA_TOKEN puuttuu tai haku epäonnistui) — ei julkaistu`);
        process.exit(1);
      }
      const file = buildTeamsFile(pair);
      const dest = writeTeamsFile(publicDir, file);
      console.log(`[Joukkuetaulukko] ${file.league} ${file.season}: ${file.teams.length} joukkuetta → ${dest}`);
    })
    .catch((err) => {
      console.error('[Joukkuetaulukko] Haku epäonnistui:', err.message);
      process.exit(1);
    });
}
