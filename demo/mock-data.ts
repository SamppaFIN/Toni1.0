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
  { id: 3, team_id: 1, name: 'Kristian Tanus', position: 'C' },
  { id: 4, team_id: 1, name: 'Oiva Keskinen', position: 'RW' },
  { id: 5, team_id: 2, name: 'Eemeli Suomi', position: 'RW' },
  { id: 6, team_id: 2, name: 'Joona Ikonen', position: 'LW' },
  { id: 7, team_id: 2, name: 'Samu Bau', position: 'C' },
  { id: 8, team_id: 3, name: 'Teemu Turunen', position: 'LW' },
  { id: 9, team_id: 3, name: 'Michal Kovařčík', position: 'C' },
  { id: 10, team_id: 3, name: 'Aleksi Antti-Roiko', position: 'RW' },
  { id: 11, team_id: 4, name: 'Juhani Tyrväinen', position: 'C' },
  { id: 12, team_id: 4, name: 'Iiro Pakarinen', position: 'RW' },
  { id: 13, team_id: 4, name: 'Vincent Marleau', position: 'LW' },
  { id: 14, team_id: 5, name: 'Markus Nurmi', position: 'RW' },
  { id: 15, team_id: 5, name: 'Petrus Palmu', position: 'LW' },
  { id: 16, team_id: 6, name: 'Sebastian Repo', position: 'C' },
  { id: 17, team_id: 6, name: 'Jami Krannila', position: 'LW' },
  { id: 18, team_id: 7, name: 'Matyas Kantner', position: 'RW' },
  { id: 19, team_id: 7, name: 'Jaakko Rissanen', position: 'C' },
  { id: 20, team_id: 8, name: 'Lars Bryggman', position: 'LW' },
  { id: 21, team_id: 8, name: 'Jesse Kiiskinen', position: 'RW' },
  { id: 22, team_id: 9, name: 'Eetu Päkkilä', position: 'LW' },
  { id: 23, team_id: 10, name: 'Pekka Jormakka', position: 'RW' },
  { id: 24, team_id: 11, name: 'Axel Holmström', position: 'C' },
  { id: 25, team_id: 12, name: 'Lenni Killinen', position: 'RW' },
  { id: 26, team_id: 13, name: 'Ville Petman', position: 'C' },
  { id: 27, team_id: 14, name: 'Jerry Turkulainen', position: 'LW' },
  { id: 28, team_id: 15, name: 'Olli Korhonen', position: 'C' },
];

export const mockGames = [
  // Upcoming — kierros 1, kausi 2025–26
  { id: 1, date: '2025-09-10T16:30:00Z', home_team_id: 1, away_team_id: 2, home_score: null, away_score: null, status: 'upcoming' },
  { id: 2, date: '2025-09-10T16:30:00Z', home_team_id: 4, away_team_id: 3, home_score: null, away_score: null, status: 'upcoming' },
  { id: 3, date: '2025-09-10T16:30:00Z', home_team_id: 5, away_team_id: 6, home_score: null, away_score: null, status: 'upcoming' },
  { id: 4, date: '2025-09-10T16:30:00Z', home_team_id: 7, away_team_id: 8, home_score: null, away_score: null, status: 'upcoming' },
  { id: 5, date: '2025-09-10T16:30:00Z', home_team_id: 9, away_team_id: 10, home_score: null, away_score: null, status: 'upcoming' },
  // Finished — harjoitusottelut / viime kausi
  { id: 10, date: '2025-03-20T16:30:00Z', home_team_id: 1, away_team_id: 4, home_score: 3, away_score: 2, status: 'finished' },
  { id: 11, date: '2025-03-20T16:30:00Z', home_team_id: 2, away_team_id: 5, home_score: 1, away_score: 4, status: 'finished' },
  { id: 12, date: '2025-03-19T16:30:00Z', home_team_id: 3, away_team_id: 6, home_score: 2, away_score: 1, status: 'finished' },
  { id: 13, date: '2025-03-19T16:30:00Z', home_team_id: 8, away_team_id: 11, home_score: 5, away_score: 2, status: 'finished' },
  { id: 14, date: '2025-03-18T16:30:00Z', home_team_id: 12, away_team_id: 13, home_score: 3, away_score: 4, status: 'finished' },
  { id: 15, date: '2025-03-18T16:30:00Z', home_team_id: 14, away_team_id: 15, home_score: 2, away_score: 3, status: 'finished' },
  { id: 16, date: '2025-03-17T16:30:00Z', home_team_id: 7, away_team_id: 9, home_score: 4, away_score: 1, status: 'finished' },
  { id: 17, date: '2025-03-17T16:30:00Z', home_team_id: 10, away_team_id: 12, home_score: 2, away_score: 2, status: 'finished' },
];

export const mockTeamRatings = [
  { team_id: 1, date: '2025-09-01', elo: 1605, pdo: 102.1, notes: 'Mestari 2024' },
  { team_id: 2, date: '2025-09-01', elo: 1570, pdo: 100.5, notes: null },
  { team_id: 3, date: '2025-09-01', elo: 1545, pdo: 103.8, notes: null },
  { team_id: 4, date: '2025-09-01', elo: 1530, pdo: 99.0, notes: null },
  { team_id: 5, date: '2025-09-01', elo: 1510, pdo: 101.2, notes: null },
  { team_id: 6, date: '2025-09-01', elo: 1500, pdo: 97.5, notes: null },
  { team_id: 7, date: '2025-09-01', elo: 1485, pdo: 104.0, notes: 'Ylisuorittaa' },
  { team_id: 8, date: '2025-09-01', elo: 1470, pdo: 100.8, notes: null },
  { team_id: 9, date: '2025-09-01', elo: 1450, pdo: 96.2, notes: null },
  { team_id: 10, date: '2025-09-01', elo: 1440, pdo: 99.5, notes: null },
  { team_id: 11, date: '2025-09-01', elo: 1420, pdo: 98.0, notes: null },
  { team_id: 12, date: '2025-09-01', elo: 1410, pdo: 101.0, notes: null },
  { team_id: 13, date: '2025-09-01', elo: 1390, pdo: 95.0, notes: 'Alisuorittaa' },
  { team_id: 14, date: '2025-09-01', elo: 1380, pdo: 100.0, notes: null },
  { team_id: 15, date: '2025-09-01', elo: 1370, pdo: 99.8, notes: null },
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
];

export const mockNewsEvents = [
  { id: 1, source_url: 'https://example.com/news1', published_at: '2025-09-10T07:30Z', event_type: 'injury', team_id: 2, player_id: 3, confidence: 0.92, raw_text: 'Ilveksen Eemeli Suomi loukkaantui harjoituksissa — poissa avauskierrokselta', extracted_json: { event_type: 'injury', team: 'Ilves', player: 'Eemeli Suomi', confidence: 0.92 } },
  { id: 2, source_url: 'https://example.com/news2', published_at: '2025-09-10T06:00Z', event_type: 'hot_streak', team_id: 4, player_id: 11, confidence: 0.85, raw_text: 'HIFK:n Juhani Tyrväinen hurjassa vireessä — 7 pistettä harjoituspeleissä', extracted_json: { event_type: 'hot_streak', team: 'HIFK', player: 'Juhani Tyrväinen', confidence: 0.85 } },
  { id: 3, source_url: 'https://example.com/news3', published_at: '2025-09-09T18:00Z', event_type: 'lineup_change', team_id: 7, player_id: null, confidence: 0.78, raw_text: 'KalPan ykkösketju uusiksi — Kantner nostettu ylös', extracted_json: { event_type: 'lineup_change', team: 'KalPa', confidence: 0.78 } },
  { id: 4, source_url: 'https://example.com/news4', published_at: '2025-09-10T05:00Z', event_type: 'bench', team_id: 9, player_id: null, confidence: 0.65, raw_text: 'HPK:n päävalmentaja tyytymätön harjoitusotteluiden esitykseen', extracted_json: { event_type: 'bench', team: 'HPK', confidence: 0.65 } },
];

export const mockOddsSnapshots = [
  { id: 1, game_id: 1, bookmaker: 'Veikkaus', market: '1X2', home_odds: 2.35, draw_odds: 3.60, away_odds: 2.90, fetched_at: '2025-09-10T07:00Z' },
  { id: 2, game_id: 2, bookmaker: 'Veikkaus', market: '1X2', home_odds: 2.80, draw_odds: 3.30, away_odds: 2.45, fetched_at: '2026-08-03T11:00:00Z' },
  { id: 3, game_id: 3, bookmaker: 'Veikkaus', market: '1X2', home_odds: 1.95, draw_odds: 3.60, away_odds: 3.50, fetched_at: '2026-08-02T09:00:00Z' },
  { id: 4, game_id: 4, bookmaker: 'Veikkaus', market: '1X2', home_odds: 3.10, draw_odds: 3.40, away_odds: 2.20, fetched_at: '2026-08-02T09:00:00Z' },
  { id: 5, game_id: 5, bookmaker: 'Veikkaus', market: '1X2', home_odds: 2.40, draw_odds: 3.20, away_odds: 2.90, fetched_at: '2026-07-31T09:00:00Z' },
];
