-- BetTracker: Supabase-skeema (9 taulua)
-- Ajo: kopioi Supabase SQL Editoriin tai käytä supabase db push

-- 1. Joukkueet
CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  ext_id TEXT UNIQUE
);

-- 2. Pelaajat
CREATE TABLE players (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES teams(id),
  name TEXT NOT NULL,
  position TEXT,
  ext_id TEXT UNIQUE
);

-- 3. Ottelut
CREATE TABLE games (
  id SERIAL PRIMARY KEY,
  date TIMESTAMPTZ NOT NULL,
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  home_score INTEGER,
  away_score INTEGER,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'finished'))
);

-- 4. Uutistapahtumat
CREATE TABLE news_events (
  id SERIAL PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_type TEXT CHECK (event_type IN ('lineup_change', 'injury', 'transfer', 'hot_streak', 'bench', 'other')),
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id),
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),
  raw_text TEXT NOT NULL,
  extracted_json JSONB
);

-- 5. Kerroinsnapshots
CREATE TABLE odds_snapshots (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES games(id),
  bookmaker TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT '1X2',
  home_odds REAL NOT NULL,
  draw_odds REAL NOT NULL,
  away_odds REAL NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Joukkueiden voimaluvut
CREATE TABLE team_ratings (
  team_id INTEGER REFERENCES teams(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  elo REAL NOT NULL DEFAULT 1500,
  pdo REAL,
  notes TEXT,
  PRIMARY KEY (team_id, date)
);

-- 7. Pelaajien form
CREATE TABLE player_form (
  player_id INTEGER REFERENCES players(id),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  rolling_ppg REAL,
  z_score REAL,
  PRIMARY KEY (player_id, date)
);

-- 8. Value-flagit (ylikertoimet)
CREATE TABLE value_flags (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES games(id),
  market TEXT NOT NULL DEFAULT '1X2',
  model_prob REAL NOT NULL,
  implied_prob REAL NOT NULL,
  edge REAL NOT NULL,
  triggering_news_event_id INTEGER REFERENCES news_events(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 9. Otteluennusteet
CREATE TABLE game_predictions (
  id SERIAL PRIMARY KEY,
  game_id INTEGER REFERENCES games(id) UNIQUE,
  predicted_home_score INTEGER,
  predicted_away_score INTEGER,
  home_win_prob REAL NOT NULL,
  draw_prob REAL NOT NULL,
  away_win_prob REAL NOT NULL,
  predicted_winner TEXT CHECK (predicted_winner IN ('home', 'draw', 'away')),
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  actual_winner TEXT CHECK (actual_winner IN ('home', 'draw', 'away')),
  was_correct BOOLEAN,
  notes TEXT
);

-- RLS: anon_key sallii SELECT vain arvosanatauluista
ALTER TABLE value_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_form ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_select_value_flags" ON value_flags FOR SELECT USING (true);
CREATE POLICY "anon_select_team_ratings" ON team_ratings FOR SELECT USING (true);
CREATE POLICY "anon_select_player_form" ON player_form FOR SELECT USING (true);
CREATE POLICY "anon_select_game_predictions" ON game_predictions FOR SELECT USING (true);
