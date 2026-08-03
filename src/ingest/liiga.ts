// Tiketti #2: Liiga.fi api/v1 -ingestio
// Hakee pelaajatilastot, ottelut ja joukkuetiedot Liiga.fi:n epävirallisesta API:sta.

import { config } from '../config.js';
import { LiigaPlayerStats, LiigaGame } from '../types.js';

interface LiigaTeam {
  teamId: string;
  name: string;
}

export async function fetchLiigaTeams(): Promise<LiigaTeam[]> {
  const res = await fetch(`${config.liiga.baseUrl}/teams`);
  if (!res.ok) throw new Error(`Liiga teams failed: ${res.status}`);
  return res.json();
}

export async function fetchLiigaPlayers(teamId?: string): Promise<LiigaPlayerStats[]> {
  const url = teamId
    ? `${config.liiga.baseUrl}/players/stats?teamId=${teamId}`
    : `${config.liiga.baseUrl}/players/stats`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Liiga players failed: ${res.status}`);
  return res.json();
}

export async function fetchLiigaGames(season?: string): Promise<LiigaGame[]> {
  const url = season
    ? `${config.liiga.baseUrl}/games?season=${season}`
    : `${config.liiga.baseUrl}/games`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Liiga games failed: ${res.status}`);
  return res.json();
}

// Tämä on se funktio jota pipeline kutsuu — hakee kaiken ja palauttaa strukturoituna
export async function ingestLiigaData() {
  console.log('[Liiga] Fetching teams...');
  const teams = await fetchLiigaTeams();

  console.log('[Liiga] Fetching players...');
  const players = await fetchLiigaPlayers();

  console.log('[Liiga] Fetching games...');
  const games = await fetchLiigaGames();

  console.log(`[Liiga] Done: ${teams.length} teams, ${players.length} players, ${games.length} games`);
  return { teams, players, games };
}

// Jos ajetaan suoraan: npx tsx src/ingest/liiga.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  ingestLiigaData()
    .then((data) => console.log(JSON.stringify(data, null, 2).slice(0, 500) + '...'))
    .catch(console.error);
}
