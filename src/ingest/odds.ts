// Tiketti #5: Odds API -integraatio
// Hakee 1X2-kertoimet The Odds API:sta Liiga-peleille.

import { config } from '../config.js';
import { OddsApiGame } from '../types.js';

const SPORT_KEY = 'icehockey_liiga';

export async function fetchOdds(): Promise<OddsApiGame[]> {
  if (!config.odds.apiKey) {
    console.warn('[Odds] No API key — skipping fetch');
    return [];
  }

  const url = `${config.odds.baseUrl}/sports/${SPORT_KEY}/odds/?apiKey=${config.odds.apiKey}&regions=eu&markets=h2h`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Odds API failed: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface ParsedOdds {
  game_id?: number; // matched later by team names
  home_team: string;
  away_team: string;
  bookmaker: string;
  home_odds: number;
  draw_odds: number;
  away_odds: number;
  fetched_at: string;
}

export function parseOddsResponse(games: OddsApiGame[]): ParsedOdds[] {
  const result: ParsedOdds[] = [];

  for (const game of games) {
    for (const book of game.bookmakers) {
      const h2h = book.markets.find((m) => m.key === 'h2h');
      if (!h2h) continue;

      const home = h2h.outcomes.find((o) => o.name === game.home_team);
      const away = h2h.outcomes.find((o) => o.name === game.away_team);
      const draw = h2h.outcomes.find((o) => o.name === 'Draw');

      if (home && away && draw) {
        result.push({
          home_team: game.home_team,
          away_team: game.away_team,
          bookmaker: book.key,
          home_odds: home.price,
          draw_odds: draw.price,
          away_odds: away.price,
          fetched_at: new Date().toISOString(),
        });
      }
    }
  }

  return result;
}

export async function ingestOdds(): Promise<ParsedOdds[]> {
  console.log('[Odds] Fetching...');
  const raw = await fetchOdds();
  const parsed = parseOddsResponse(raw);
  console.log(`[Odds] Parsed ${parsed.length} odds snapshots`);
  return parsed;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestOdds()
    .then((data) => console.log(JSON.stringify(data, null, 2).slice(0, 1000)))
    .catch(console.error);
}
