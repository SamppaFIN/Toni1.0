// BetTracker configuration — inject via env vars, defaults for dev

import { loadEnv } from './env.js';

// Lataa .env ennen kuin config luetaan. Ei vaikutusta CI:ssä (ei .env-tiedostoa).
loadEnv();

export const config = {
  supabase: {
    url: process.env.SUPABASE_URL || 'http://localhost:54321',
    anonKey: process.env.SUPABASE_ANON_KEY || 'anon-key',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  liiga: {
    baseUrl: 'https://liiga.fi/api/v1',
  },
  odds: {
    apiKey: process.env.ODDS_API_KEY || '',
    baseUrl: 'https://api.the-odds-api.com/v4',
    // Sallittujen vedonlyöntitoimistojen lista (pilkulla eroteltuna). Tyhjä = kaikki API:n tarjoamat.
    bookmakers: (process.env.ODDS_BOOKMAKERS || '').split(',').map((b) => b.trim()).filter(Boolean),
    // Jalkapallosarjat joista kertoimet haetaan (The Odds API sport keys).
    // Yksi pyyntö kuluttaa markkinat × alueet krediittiä — ilmaistasolla 500/kk.
    footballSports: (process.env.ODDS_FOOTBALL_SPORTS || 'soccer_finland_veikkausliiga,soccer_epl')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    regions: process.env.ODDS_REGIONS || 'eu',
    markets: process.env.ODDS_MARKETS || 'h2h',
    /** Vuorokausikatto krediiteille — putki keskeytyy ennen kuin kvootta palaa loppuun */
    dailyCreditBudget: Number(process.env.ODDS_DAILY_CREDIT_BUDGET || 16),
  },
  /** API-Football (API-Sports) — tunnusluvut, loukkaantumiset, kokoonpanot. 100 pyyntöä/vrk. */
  apiFootball: {
    apiKey: process.env.API_FOOTBALL_KEY || '',
    baseUrl: 'https://v3.football.api-sports.io',
    dailyRequestBudget: Number(process.env.API_FOOTBALL_DAILY_BUDGET || 80),
  },
  /** football-data.org — varalähde otteluille ja sarjataulukoille. 10 pyyntöä/min, 13 sarjaa. */
  footballData: {
    token: process.env.FOOTBALL_DATA_TOKEN || '',
    baseUrl: 'https://api.football-data.org/v4',
    /** Sarjakoodit, esim. PL = Premier League, ELC = Championship */
    competitions: (process.env.FOOTBALL_DATA_COMPETITIONS || 'PL,ELC')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean),
  },
  /** Mallin viritysparametrit — nämä ovat ne numerot joita kalibroidaan tuloksia vasten */
  model: {
    /** Poissonin paino blendissä markkinaa vasten (0 = seuraa markkinaa, 1 = luota omaan malliin) */
    blendWeight: Number(process.env.MODEL_BLEND_WEIGHT || 0.35),
    /** Dixon–Coles-korjaus matalille tuloksille */
    rho: Number(process.env.MODEL_RHO || -0.05),
    /** Kutistuksen k: montako ottelua kunnes luotetaan puoliksi omaan dataan */
    shrinkageK: Number(process.env.MODEL_SHRINKAGE_K || 6),
  },
  /** Panostuslogiikka */
  staking: {
    kellyFraction: Number(process.env.KELLY_FRACTION || 0.25),
    maxStakeFraction: Number(process.env.MAX_STAKE_FRACTION || 0.02),
  },
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'deepseek-chat',
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  news: {
    rssFeeds: [
      'https://www.jatkoaika.com/rss/feed',
      'https://feeds.yle.fi/urheilu/jaakiekko',
      'https://www.is.fi/rss/jaakiekko.xml',
    ],
  },
} as const;
