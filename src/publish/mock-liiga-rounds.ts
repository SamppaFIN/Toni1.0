import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GamePrediction, OddsSnapshot, Team, TeamRating, ValueFlag } from '../types.js';

const RAW_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../demo/liiga-2025-12.txt');
const OUTPUT_FILE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/data/liiga-rounds.json');
const HOME_ADVANTAGE = 40;
const STARTING_ELO = 1500;
const ELO_K = 24;

const TEAMS: Team[] = [
  { id: 1, name: 'Tappara', ext_id: null },
  { id: 2, name: 'Ilves', ext_id: null },
  { id: 3, name: 'Kärpät', ext_id: null },
  { id: 4, name: 'HIFK', ext_id: null },
  { id: 5, name: 'TPS', ext_id: null },
  { id: 6, name: 'Lukko', ext_id: null },
  { id: 7, name: 'KalPa', ext_id: null },
  { id: 8, name: 'Pelicans', ext_id: null },
  { id: 9, name: 'HPK', ext_id: null },
  { id: 10, name: 'Jukurit', ext_id: null },
  { id: 11, name: 'Sport', ext_id: null },
  { id: 12, name: 'Ässät', ext_id: null },
  { id: 13, name: 'SaiPa', ext_id: null },
  { id: 14, name: 'JYP', ext_id: null },
  { id: 15, name: 'KooKoo', ext_id: null },
  { id: 16, name: 'K-Espoo', ext_id: null },
];

/**
 * Kauden 2024–25 runkosarjan lopputaulukko (Wikipedia, "2024–25 Liiga season"),
 * pisteinä. Käytetään lähtö-Elon siemenenä — ilman tätä kaikki 16 joukkuetta
 * käynnistyisivät identtisestä 1500:sta, jolloin esim. Elo-ero-tekijäpilleri
 * ei koskaan näyttäisi mitään ensimmäisillä kierroksilla.
 *
 * "Kiekko-Espoo" Wikipedian nimellä = "K-Espoo" tässä koodissa (ks. TEAMS).
 */
const PREVIOUS_SEASON_POINTS: Record<string, number> = {
  Lukko: 112,
  Ilves: 111,
  KalPa: 107,
  HIFK: 107,
  SaiPa: 106,
  KooKoo: 99,
  Ässät: 95,
  'K-Espoo': 91,
  Tappara: 90,
  HPK: 83,
  Sport: 83,
  TPS: 79,
  Kärpät: 77,
  JYP: 76,
  Pelicans: 75,
  Jukurit: 49,
};
const PREVIOUS_SEASON_MEAN_POINTS = 90.0;
/**
 * Pistettä → Elo-pistettä. Kerroin 6 valittu niin että jänneväli (Lukko 1632,
 * Jukurit 1254 — ero 378) on samaa suuruusluokkaa kuin oikeasta datasta
 * laskettu Veikkausliigan Elo-jänneväli (1349–1604, ks. analyze/season-elo.ts).
 * Yhden kauden sijoitus ei saa antaa liikaa itsevarmuutta, muttei myöskään
 * litteä 1500 kaikille — sama periaate kuin analyze/strength.ts:n
 * kauden alun prioriblendaus.
 */
const PREVIOUS_SEASON_ELO_SCALE = 6;

/** Joukkueen lähtö-Elo edellisen kauden sijoituksesta. Tuntematon nimi → 1500. */
function startingEloFor(teamName: string): number {
  const points = PREVIOUS_SEASON_POINTS[teamName];
  if (points === undefined) return STARTING_ELO;
  return Math.round(STARTING_ELO + (points - PREVIOUS_SEASON_MEAN_POINTS) * PREVIOUS_SEASON_ELO_SCALE);
}

const TEAM_BY_NAME = new Map(TEAMS.map((team) => [team.name, team]));
const TEAM_PATTERN = [...TEAMS.map((team) => team.name)]
  .sort((a, b) => b.length - a.length)
  .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
const DATE_PATTERN = /(ma|ti|ke|to|pe|la|su) \d{1,2}\.\d{1,2}\.\d{4}/g;
const GAME_PATTERN = new RegExp(`(${TEAM_PATTERN})(\\d+)–(\\d+)(JA|VL)?(${TEAM_PATTERN})`, 'g');

export interface HistoricalGame {
  date: string;
  dateLabel: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  resultType: 'RT' | 'JA' | 'VL';
}

export interface HockeyRoundState {
  round: number;
  label: string;
  date: string;
  games: Array<{
    id: number;
    date: string;
    home_team_id: number;
    away_team_id: number;
    home_score: null;
    away_score: null;
    status: 'upcoming';
    actual_home_score: number;
    actual_away_score: number;
    result_type: 'RT' | 'JA' | 'VL';
  }>;
  predictions: GamePrediction[];
  valueFlags: ValueFlag[];
  oddsSnapshots: OddsSnapshot[];
  ratings: TeamRating[];
}

export interface HockeyRoundsFile {
  schema_version: 1;
  generated_at: string;
  season: string;
  source: string;
  teams: Team[];
  rounds: HockeyRoundState[];
}

interface TeamAccumulator {
  team_id: number;
  elo: number;
  played: number;
  wins: number;
  otWins: number;
  otLosses: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

function isoDateFromLabel(label: string): string {
  const parts = label.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!parts) throw new Error(`Virheellinen paivamaara: ${label}`);
  const [, day, month, year] = parts;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function normalizeRaw(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/Tilastot\|Seuranta\|Kokoonpanot/g, '\n')
    .replace(/Lokakuu 2025|Marraskuu 2025|Joulukuu 2025/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\r/g, '')
    .trim();
}

export function parseLiigaScheduleText(text: string): HistoricalGame[] {
  const cleaned = normalizeRaw(text);
  const headings = [...cleaned.matchAll(DATE_PATTERN)].map((match) => ({ label: match[0], index: match.index ?? 0 }));
  const segments = [
    { label: 'ti 9.9.2025', start: 0, end: headings[0]?.index ?? cleaned.length },
    ...headings.map((heading, index) => ({
      label: heading.label,
      start: heading.index + heading.label.length,
      end: headings[index + 1]?.index ?? cleaned.length,
    })),
  ];

  const games: HistoricalGame[] = [];

  for (const segment of segments) {
    const date = isoDateFromLabel(segment.label);
    const chunk = cleaned.slice(segment.start, segment.end);
    for (const match of chunk.matchAll(GAME_PATTERN)) {
      const home = match[1];
      const away = match[5];
      if (!TEAM_BY_NAME.has(home) || !TEAM_BY_NAME.has(away)) continue;
      games.push({
        date,
        dateLabel: segment.label,
        home,
        away,
        homeScore: Number(match[2]),
        awayScore: Number(match[3]),
        resultType: (match[4] as 'JA' | 'VL' | undefined) ?? 'RT',
      });
    }
  }

  if (games.length < 100) {
    throw new Error(`Liiga-raakadatan parsinta epaonnistui: vain ${games.length} ottelua loytyi`);
  }

  return games;
}

function roundState(seed: number): number {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function expectedScore(homeElo: number, awayElo: number): number {
  return 1 / (1 + 10 ** ((awayElo - homeElo) / 400));
}

function outcomeScore(game: HistoricalGame): number {
  if (game.homeScore === game.awayScore) return 0.5;
  if (game.resultType === 'RT') return game.homeScore > game.awayScore ? 1 : 0;
  return game.homeScore > game.awayScore ? 0.6 : 0.4;
}

function makeEmptyAccumulators(): Map<number, TeamAccumulator> {
  return new Map(
    TEAMS.map((team) => [team.id, { team_id: team.id, elo: startingEloFor(team.name), played: 0, wins: 0, otWins: 0, otLosses: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 }])
  );
}

function buildRatings(games: HistoricalGame[]): TeamRating[] {
  const acc = makeEmptyAccumulators();

  for (const game of games) {
    const homeId = TEAM_BY_NAME.get(game.home)?.id;
    const awayId = TEAM_BY_NAME.get(game.away)?.id;
    if (!homeId || !awayId) continue;

    const home = acc.get(homeId)!;
    const away = acc.get(awayId)!;
    const expectedHome = expectedScore(home.elo + HOME_ADVANTAGE, away.elo);
    const actualHome = outcomeScore(game);
    const goalDiff = Math.abs(game.homeScore - game.awayScore);
    const multiplier = goalDiff <= 1 ? 1 : goalDiff === 2 ? 1.25 : 1.5;
    const delta = ELO_K * multiplier * (actualHome - expectedHome);

    home.elo += delta;
    away.elo -= delta;

    home.played += 1;
    away.played += 1;
    home.goalsFor += game.homeScore;
    home.goalsAgainst += game.awayScore;
    away.goalsFor += game.awayScore;
    away.goalsAgainst += game.homeScore;

    const homeWon = game.homeScore > game.awayScore;
    if (game.resultType === 'RT') {
      if (homeWon) {
        home.wins += 1;
        away.losses += 1;
      } else {
        away.wins += 1;
        home.losses += 1;
      }
    } else if (homeWon) {
      home.otWins += 1;
      away.otLosses += 1;
    } else {
      away.otWins += 1;
      home.otLosses += 1;
    }
  }

  return TEAMS.map((team) => {
    const item = acc.get(team.id)!;
    const goalShare = item.goalsFor + item.goalsAgainst > 0 ? item.goalsFor / (item.goalsFor + item.goalsAgainst) : 0.5;
    const pdo = 100 + (goalShare - 0.5) * 30;
    return {
      team_id: team.id,
      date: games[games.length - 1]?.date ?? '2025-09-09',
      elo: Math.round(item.elo * 10) / 10,
      pdo: Math.round(Math.max(94, Math.min(106, pdo)) * 10) / 10,
      notes: `${item.played} ottelua · ${item.wins + item.otWins}-${item.otLosses}-${item.losses} · maalit ${item.goalsFor}-${item.goalsAgainst}`,
      elo_delta: 0,
      pdo_delta: 0,
      played: item.played,
      wins: item.wins,
      ot_wins: item.otWins,
      ot_losses: item.otLosses,
      losses: item.losses,
      goals_for: item.goalsFor,
      goals_against: item.goalsAgainst,
      shots_for: null,
      shots_against: null,
    };
  });
}

function probabilityTriple(homeElo: number, awayElo: number) {
  const homeWinRaw = expectedScore(homeElo + HOME_ADVANTAGE, awayElo);
  const draw = Math.max(0.12, 0.22 - Math.abs(homeElo + HOME_ADVANTAGE - awayElo) / 1800);
  const home = homeWinRaw * (1 - draw);
  const away = (1 - homeWinRaw) * (1 - draw);
  const total = home + draw + away;
  return {
    home: home / total,
    draw: draw / total,
    away: away / total,
  };
}

function jitter(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return ((x - Math.floor(x)) - 0.5) * 2 * spread;
}

function bookmakerProfile(name: string) {
  const key = name.toLowerCase();
  if (key.includes('pinnacle')) return { margin: 0.035, vol: 0.002, favoriteTax: 0.003, longshotTax: 0.003, drawTax: 0.001 };
  if (key.includes('veikkaus')) return { margin: 0.082, vol: 0.0015, favoriteTax: 0.015, longshotTax: 0.012, drawTax: 0.005 };
  if (key.includes('bet365')) return { margin: 0.05, vol: 0.003, favoriteTax: 0.006, longshotTax: 0.006, drawTax: 0.002 };
  if (key.includes('unibet')) return { margin: 0.058, vol: 0.0035, favoriteTax: 0.007, longshotTax: 0.007, drawTax: 0.003 };
  if (key.includes('betsson')) return { margin: 0.06, vol: 0.0035, favoriteTax: 0.008, longshotTax: 0.008, drawTax: 0.003 };
  if (key.includes('nordic')) return { margin: 0.059, vol: 0.0035, favoriteTax: 0.007, longshotTax: 0.007, drawTax: 0.003 };
  return { margin: 0.058, vol: 0.0035, favoriteTax: 0.007, longshotTax: 0.007, drawTax: 0.003 };
}

function oddsFor(roundIndex: number, gameIndex: number, probs: { home: number; draw: number; away: number }): OddsSnapshot[] {
  const bookmakers = ['bet365', 'Pinnacle', 'Unibet', 'Betsson', 'NordicBet', 'Veikkaus'];
  return bookmakers.map((bookmaker, bookIndex) => {
    const seedBase = roundIndex * 100 + gameIndex * 10 + bookIndex;
    const profile = bookmakerProfile(bookmaker);
    const line = [probs.home, probs.draw, probs.away];
    const favorite = line.indexOf(Math.max(...line));
    const adjusted = line.map((prob, sideIndex) => {
      const noise = jitter(seedBase * 17 + sideIndex, profile.vol);
      const favoriteTax = sideIndex === favorite ? profile.favoriteTax : 0;
      const drawTax = sideIndex === 1 ? profile.drawTax : 0;
      const longshotTax = prob < 0.22 ? profile.longshotTax : 0;
      return prob * (1 + noise + favoriteTax + drawTax + longshotTax);
    });
    const scale = (1 + profile.margin) / adjusted.reduce((sum, value) => sum + value, 0);
    const priced = adjusted.map((value) => value * scale);

    return {
      id: roundIndex * 10_000 + gameIndex * 100 + bookIndex + 1,
      game_id: roundIndex * 100 + gameIndex + 1,
      bookmaker,
      market: '1X2',
      home_odds: Math.max(1.05, Math.round((1 / priced[0]) * 100) / 100),
      draw_odds: Math.max(1.05, Math.round((1 / priced[1]) * 100) / 100),
      away_odds: Math.max(1.05, Math.round((1 / priced[2]) * 100) / 100),
      fetched_at: new Date(Date.UTC(2025, 8, 1 + roundIndex)).toISOString(),
    };
  });
}

function buildRound(roundGames: HistoricalGame[], roundIndex: number, priorGames: HistoricalGame[]): HockeyRoundState {
  const ratings = buildRatings(priorGames);
  const ratingById = new Map(ratings.map((rating) => [rating.team_id, rating]));

  const games = roundGames.map((game, gameIndex) => ({
    id: roundIndex * 100 + gameIndex + 1,
    date: `${game.date}T16:30:00.000Z`,
    home_team_id: TEAM_BY_NAME.get(game.home)!.id,
    away_team_id: TEAM_BY_NAME.get(game.away)!.id,
    home_score: null,
    away_score: null,
    status: 'upcoming' as const,
    actual_home_score: game.homeScore,
    actual_away_score: game.awayScore,
    result_type: game.resultType,
  }));

  const predictions: GamePrediction[] = [];
  const valueFlags: ValueFlag[] = [];
  const oddsSnapshots: OddsSnapshot[] = [];

  games.forEach((game, gameIndex) => {
    const homeElo = ratingById.get(game.home_team_id)?.elo ?? STARTING_ELO;
    const awayElo = ratingById.get(game.away_team_id)?.elo ?? STARTING_ELO;
    const probs = probabilityTriple(homeElo, awayElo);
    const odds = oddsFor(roundIndex, gameIndex, probs);
    oddsSnapshots.push(...odds);

    const predicted_winner = probs.home > probs.away && probs.home > probs.draw ? 'home' : probs.away > probs.draw ? 'away' : 'draw';
    predictions.push({
      id: roundIndex * 100 + gameIndex + 1,
      game_id: game.id,
      predicted_home_score: null,
      predicted_away_score: null,
      home_win_prob: Math.round(probs.home * 10000) / 10000,
      draw_prob: Math.round(probs.draw * 10000) / 10000,
      away_win_prob: Math.round(probs.away * 10000) / 10000,
      predicted_winner,
      predicted_at: new Date(Date.UTC(2025, 8, 1 + roundIndex)).toISOString(),
      actual_winner: null,
      was_correct: null,
      notes: `Mallinnettu ennen kierrosta ${roundGames[0].dateLabel}`,
    });

    const best = {
      home: Math.max(...odds.map((row) => row.home_odds)),
      draw: Math.max(...odds.map((row) => row.draw_odds)),
      away: Math.max(...odds.map((row) => row.away_odds)),
    };
    const impliedDenominator = 1 / best.home + 1 / best.draw + 1 / best.away;
    const edges = [
      { side: 'home', odds: best.home, model_prob: probs.home, implied_prob: (1 / best.home) / impliedDenominator },
      { side: 'draw', odds: best.draw, model_prob: probs.draw, implied_prob: (1 / best.draw) / impliedDenominator },
      { side: 'away', odds: best.away, model_prob: probs.away, implied_prob: (1 / best.away) / impliedDenominator },
    ].map((edge) => ({ ...edge, edge: edge.model_prob * edge.odds - 1 }));

    const bestEdge = [...edges].sort((a, b) => b.edge - a.edge)[0];
    if (bestEdge.edge > 0.03) {
      valueFlags.push({
        id: roundIndex * 100 + gameIndex + 1,
        game_id: game.id,
        market: '1X2',
        model_prob: Math.round(bestEdge.model_prob * 10000) / 10000,
        implied_prob: Math.round(bestEdge.implied_prob * 10000) / 10000,
        edge: Math.round(bestEdge.edge * 10000) / 10000,
        triggering_news_event_id: null,
        created_at: new Date(Date.UTC(2025, 8, 1 + roundIndex)).toISOString(),
      });
    }
  });

  return {
    round: roundIndex + 1,
    label: roundGames[0].dateLabel,
    date: roundGames[0].date,
    games,
    predictions,
    valueFlags,
    oddsSnapshots,
    ratings,
  };
}

export function buildLiigaRoundsFile(text: string): HockeyRoundsFile {
  const games = parseLiigaScheduleText(text).sort((a, b) => a.date.localeCompare(b.date));
  const grouped = new Map<string, HistoricalGame[]>();
  for (const game of games) {
    const list = grouped.get(game.date) ?? [];
    list.push(game);
    grouped.set(game.date, list);
  }

  const orderedGroups = [...grouped.values()].sort((a, b) => a[0].date.localeCompare(b[0].date));
  const rounds: HockeyRoundState[] = [];
  let priorGames: HistoricalGame[] = [];

  orderedGroups.forEach((group, index) => {
    rounds.push(buildRound(group, index, priorGames));
    priorGames = priorGames.concat(group);
  });

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    season: '2025-2026',
    source: 'liiga.fi ohjelmasivu, kayttajan kopioima runkosarja joulukuuhun asti',
    teams: TEAMS,
    rounds,
  };
}

export function writeLiigaRounds(file: HockeyRoundsFile): string {
  const dir = path.dirname(OUTPUT_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(OUTPUT_FILE, JSON.stringify(file, null, 2), 'utf8');
  return OUTPUT_FILE;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const raw = readFileSync(RAW_FILE, 'utf8');
  const file = buildLiigaRoundsFile(raw);
  const target = writeLiigaRounds(file);
  console.log(`✓ ${file.rounds.length} Liiga-kierrosta kirjoitettu`);
  console.log(`  ${target}`);
  console.log(`  Joukkueita: ${file.teams.length} · kierros 1: ${file.rounds[0]?.games.length ?? 0} ottelua`);
}
