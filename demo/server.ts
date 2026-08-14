// Demo-serveri: tarjoaa mock-API:n web-käyttöliittymälle ilman oikeaa Supabasea.
// Käynnistys: npm run demo → http://localhost:3333

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockValueFlags, mockPredictions, mockTeamRatings, mockGames, mockTeams, mockNewsEvents, mockOddsSnapshots } from './mock-data.js';

const app = express();
const PORT = 3333;
const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

// CORS kaikille (demo-käyttö)
app.use((_req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});

// Staattiset tiedostot (web UI)
app.use(express.static(publicDir));

// Mock API — matkii Supabase REST-rajapintaa
app.get('/rest/v1/value_flags', (_req, res) => {
  res.json(mockValueFlags);
});

app.get('/rest/v1/game_predictions', (_req, res) => {
  res.json(mockPredictions);
});

app.get('/rest/v1/team_ratings', (_req, res) => {
  res.json(mockTeamRatings);
});

app.get('/rest/v1/games', (_req, res) => {
  res.json(mockGames);
});

app.get('/rest/v1/teams', (_req, res) => {
  res.json(mockTeams);
});

app.get('/rest/v1/news_events', (_req, res) => {
  res.json(mockNewsEvents);
});

app.get('/rest/v1/odds_snapshots', (_req, res) => {
  res.json(mockOddsSnapshots);
});

// Juurireitti: ohjaa demo-sivulle
app.get('/', (_req, res) => {
  res.redirect('/demo.html');
});

app.listen(PORT, () => {
  console.log(`\n🔆 BetTracker Demo Server`);
  console.log(`   Avaa: http://localhost:${PORT}/demo.html`);
  console.log(`   Mock API: http://localhost:${PORT}/rest/v1/\n`);
});
