// Demo-mockdata: realistista Liiga-dataa simulaatiota varten.
// Käytetään demo-serverin ja Playwright-testien pohjana.

export const mockTeams = [
  { id: 1, name: 'Tappara', ext_id: 'tap' },
  { id: 2, name: 'Ilves', ext_id: 'ilv' },
  { id: 3, name: 'Kärpät', ext_id: 'kar' },
  { id: 4, name: 'HIFK', ext_id: 'hifk' },
  { id: 5, name: 'TPS', ext_id: 'tps' },
  { id: 6, name: 'Lukko', ext_id: 'luk' },
  { id: 7, name: 'KalPa', ext_id: 'kal' },
  { id: 8, name: 'Pelicans', ext_id: 'pel' },
  { id: 9, name: 'HPK', ext_id: 'hpk' },
  { id: 10, name: 'Jukurit', ext_id: 'juk' },
  { id: 11, name: 'Sport', ext_id: 'spo' },
  { id: 12, name: 'Ässät', ext_id: 'ass' },
  { id: 13, name: 'SaiPa', ext_id: 'sai' },
  { id: 14, name: 'JYP', ext_id: 'jyp' },
  { id: 15, name: 'KooKoo', ext_id: 'kok' },
];

export const mockPlayers = [
  { id: 1, team_id: 1, name: 'Jori Lehterä', position: 'C' },
  { id: 2, team_id: 1, name: 'Veli-Matti Savinainen', position: 'LW' },
  { id: 3, team_id: 2, name: 'Eemeli Suomi', position: 'RW' },
  { id: 4, team_id: 3, name: 'Teemu Turunen', position: 'LW' },
  { id: 5, team_id: 4, name: 'Juhani Tyrväinen', position: 'C' },
  { id: 6, team_id: 5, name: 'Markus Nurmi', position: 'RW' },
];

export const mockGames = [
  { id: 1, date: '2026-08-04T16:30:00Z', home_team_id: 1, away_team_id: 2, home_score: null, away_score: null, status: 'upcoming' },
  { id: 2, date: '2026-08-04T16:30:00Z', home_team_id: 4, away_team_id: 3, home_score: null, away_score: null, status: 'upcoming' },
  { id: 3, date: '2026-08-02T16:30:00Z', home_team_id: 1, away_team_id: 3, home_score: 4, away_score: 2, status: 'finished' },
  { id: 4, date: '2026-08-02T16:30:00Z', home_team_id: 2, away_team_id: 4, home_score: 1, away_score: 3, status: 'finished' },
  { id: 5, date: '2026-07-31T16:30:00Z', home_team_id: 5, away_team_id: 6, home_score: 2, away_score: 1, status: 'finished' },
  { id: 6, date: '2026-08-01T16:30:00Z', home_team_id: 7, away_team_id: 8, home_score: 3, away_score: 3, status: 'finished' },
];

export const mockValueFlags = [
  {
    id: 1, game_id: 1, market: '1X2',
    model_prob: 0.42, implied_prob: 0.32,
    edge: 0.065, triggering_news_event_id: null,
    created_at: '2026-08-03T10:00:00Z',
  },
  {
    id: 2, game_id: 1, market: '1X2',
    model_prob: 0.38, implied_prob: 0.34,
    edge: 0.038, triggering_news_event_id: null,
    created_at: '2026-08-03T09:30:00Z',
  },
  {
    id: 3, game_id: 2, market: '1X2',
    model_prob: 0.30, implied_prob: 0.22,
    edge: 0.072, triggering_news_event_id: 1,
    created_at: '2026-08-03T08:00:00Z',
  },
];

export const mockPredictions = [
  {
    id: 1, game_id: 1,
    home_win_prob: 0.45, draw_prob: 0.25, away_win_prob: 0.30,
    predicted_winner: 'home', predicted_at: '2026-08-03T12:00:00Z',
    actual_winner: null, was_correct: null, notes: null,
  },
  {
    id: 2, game_id: 2,
    home_win_prob: 0.35, draw_prob: 0.28, away_win_prob: 0.37,
    predicted_winner: 'away', predicted_at: '2026-08-03T12:00:00Z',
    actual_winner: null, was_correct: null, notes: null,
  },
  {
    id: 3, game_id: 3,
    home_win_prob: 0.48, draw_prob: 0.24, away_win_prob: 0.28,
    predicted_winner: 'home', predicted_at: '2026-08-02T10:00:00Z',
    actual_winner: 'home', was_correct: true, notes: null,
  },
  {
    id: 4, game_id: 4,
    home_win_prob: 0.38, draw_prob: 0.26, away_win_prob: 0.36,
    predicted_winner: 'draw', predicted_at: '2026-08-02T10:00:00Z',
    actual_winner: 'away', was_correct: false, notes: null,
  },
  {
    id: 5, game_id: 5,
    home_win_prob: 0.40, draw_prob: 0.27, away_win_prob: 0.33,
    predicted_winner: 'home', predicted_at: '2026-07-31T10:00:00Z',
    actual_winner: 'home', was_correct: true, notes: null,
  },
  {
    id: 6, game_id: 6,
    home_win_prob: 0.36, draw_prob: 0.28, away_win_prob: 0.36,
    predicted_winner: 'away', predicted_at: '2026-08-01T10:00:00Z',
    actual_winner: 'draw', was_correct: false, notes: null,
  },
];

export const mockTeamRatings = [
  { team_id: 1, date: '2026-08-03', elo: 1580, pdo: 101.5, notes: null },
  { team_id: 2, date: '2026-08-03', elo: 1540, pdo: 99.2, notes: null },
  { team_id: 3, date: '2026-08-03', elo: 1520, pdo: 103.1, notes: null },
  { team_id: 4, date: '2026-08-03', elo: 1510, pdo: 98.5, notes: null },
  { team_id: 5, date: '2026-08-03', elo: 1490, pdo: 100.8, notes: null },
  { team_id: 6, date: '2026-08-03', elo: 1480, pdo: 97.0, notes: null },
  { team_id: 7, date: '2026-08-03', elo: 1470, pdo: 102.2, notes: null },
  { team_id: 8, date: '2026-08-03', elo: 1450, pdo: 100.0, notes: null },
];

export const mockNewsEvents = [
  {
    id: 1, source_url: 'https://example.com/news1',
    published_at: '2026-08-03T07:30:00Z',
    event_type: 'injury', team_id: 2, player_id: 3,
    confidence: 0.9, raw_text: 'Eemeli Suomi loukkaantui harjoituksissa...',
    extracted_json: { event_type: 'injury', team: 'Ilves', player: 'Eemeli Suomi', confidence: 0.9 },
  },
];

export const mockOddsSnapshots = [
  { id: 1, game_id: 1, bookmaker: 'Veikkaus', market: '1X2', home_odds: 2.10, draw_odds: 3.50, away_odds: 3.20, fetched_at: '2026-08-03T11:00:00Z' },
  { id: 2, game_id: 2, bookmaker: 'Veikkaus', market: '1X2', home_odds: 2.80, draw_odds: 3.30, away_odds: 2.45, fetched_at: '2026-08-03T11:00:00Z' },
  { id: 3, game_id: 3, bookmaker: 'Veikkaus', market: '1X2', home_odds: 1.95, draw_odds: 3.60, away_odds: 3.50, fetched_at: '2026-08-02T09:00:00Z' },
  { id: 4, game_id: 4, bookmaker: 'Veikkaus', market: '1X2', home_odds: 3.10, draw_odds: 3.40, away_odds: 2.20, fetched_at: '2026-08-02T09:00:00Z' },
  { id: 5, game_id: 5, bookmaker: 'Veikkaus', market: '1X2', home_odds: 2.40, draw_odds: 3.20, away_odds: 2.90, fetched_at: '2026-07-31T09:00:00Z' },
  { id: 6, game_id: 6, bookmaker: 'Veikkaus', market: '1X2', home_odds: 2.50, draw_odds: 3.30, away_odds: 2.70, fetched_at: '2026-08-01T09:00:00Z' },
];
