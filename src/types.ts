// === Shared types for BetTracker ===

export interface Team {
  id: number;
  name: string;
  ext_id: string | null;
}

export interface Player {
  id: number;
  team_id: number;
  name: string;
  position: string | null;
  ext_id: string | null;
}

export type GameStatus = 'upcoming' | 'live' | 'finished';

export interface Game {
  id: number;
  date: string;
  home_team_id: number;
  away_team_id: number;
  home_score: number | null;
  away_score: number | null;
  status: GameStatus;
}

export type EventType = 'lineup_change' | 'injury' | 'transfer' | 'hot_streak' | 'bench' | 'other';

export interface NewsEvent {
  id: number;
  source_url: string;
  published_at: string;
  event_type: EventType | null;
  team_id: number | null;
  player_id: number | null;
  confidence: number | null;
  raw_text: string;
  extracted_json: Record<string, unknown> | null;
}

export interface OddsSnapshot {
  id: number;
  game_id: number;
  bookmaker: string;
  market: string;
  home_odds: number;
  draw_odds: number;
  away_odds: number;
  fetched_at: string;
}

export interface TeamRating {
  team_id: number;
  date: string;
  elo: number;
  pdo: number | null;
  notes: string | null;
}

export interface PlayerForm {
  player_id: number;
  date: string;
  rolling_ppg: number | null;
  z_score: number | null;
}

export interface ValueFlag {
  id: number;
  game_id: number;
  market: string;
  model_prob: number;
  implied_prob: number;
  edge: number;
  triggering_news_event_id: number | null;
  created_at: string;
}

export type Winner = 'home' | 'draw' | 'away';

export interface GamePrediction {
  id: number;
  game_id: number;
  predicted_home_score: number | null;
  predicted_away_score: number | null;
  home_win_prob: number;
  draw_prob: number;
  away_win_prob: number;
  predicted_winner: Winner | null;
  predicted_at: string;
  actual_winner: Winner | null;
  was_correct: boolean | null;
  notes: string | null;
}

// Liiga API raw shapes
export interface LiigaPlayerStats {
  playerId: string;
  firstName: string;
  lastName: string;
  teamName: string;
  position: string;
  gamesPlayed: number;
  goals: number;
  assists: number;
  points: number;
  plusMinus: number;
  penaltyMinutes: number;
}

export interface LiigaGame {
  gameId: string;
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: string;
}

// Odds API raw shape
export interface OddsApiGame {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: Array<{
    key: string;
    markets: Array<{
      key: string;
      outcomes: Array<{ name: string; price: number }>;
    }>;
  }>;
}
