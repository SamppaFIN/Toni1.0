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
    // Tiketti #61/#62: kahdeksan sarjaa = ilmaistason maksimi.
    // 8 sarjaa x 2 ajoa/vrk x 30 pv = 480 krediittia/kk (raja 500).
    // Kaikilla naista on tilastolahde, joten malli on taysi eika market-only.
    // Lisays: aseta ODDS_FOOTBALL_SPORTS ja tarkista quotaWarning-loki.
    footballSports: (process.env.ODDS_FOOTBALL_SPORTS ||
      [
        // NELJA SARJAA, KAKSI MARKKINAA (tiketti #94).
        //
        // Yli/alle-kertoimet kaksinkertaistavat kvootan, koska The Odds API
        // veloittaa per markkina. Kahdeksan sarjaa kahdella markkinalla
        // maksaisi 960/500 -- lahes kaksinkertaisesti ilmaistason.
        //
        // Nelja sarjaa x 2 markkinaa x 2 ajoa x 30 pv = 480/500.
        // Kaksi ajoa sailytettiin, koska ilman niita CLV-mittaus (#72)
        // lakkaisi toimimasta kokonaan.
        //
        // Valinta: Valioliiga ja Championship tuottivat arkistossa eniten
        // liputettuja kohteita (9 ja 6), ja kaksi kotimaista ovat ne joita
        // oikeasti seurataan.
        'soccer_epl',
        'soccer_efl_champ',
        'soccer_finland_veikkausliiga',
        'icehockey_liiga',
      ].join(','))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    regions: process.env.ODDS_REGIONS || 'eu',
    /**
     * Haettavat markkinat (tiketti #94).
     *
     * HINNOITTELU: The Odds API veloittaa 1 krediitin PER MARKKINA PER ALUE.
     * `h2h,totals` maksaa siis KAKSINKERTAISEN pelkkaan h2h:hen verrattuna,
     * ja se on syy siihen miksi sarjoja on nelja eika kahdeksan.
     */
    markets: process.env.ODDS_MARKETS || 'h2h,totals',
    /** Vuorokausikatto krediiteille — putki keskeytyy ennen kuin kvootta palaa loppuun */
    /**
     * Vuorokausikatto. 4 sarjaa x 2 markkinaa x 2 ajoa = 16 krediittia/vrk.
     * Katto on se joka oikeasti pysayttaa putken jos konfiguraatio kasvaa
     * huomaamatta -- quotaWarning vain varoittaa.
     */
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
    /**
     * Poissonin paino blendissä markkinaa vasten (0 = seuraa markkinaa,
     * 1 = luota omaan malliin).
     *
     * 0.35 -> 0.40 (tiketti #86). Arvo EI ole arvattu vaan mitattu:
     * calibrateBlendWeight() etsii Brier-scoren minimoivan painon
     * toteutuneista tuloksista, ja 21 ratkenneella ottelulla se osoitti
     * arvoon 0.40.
     *
     * Kolme ehtoa täyttyi ennen muutosta, ja kaikki kolme ovat tarpeen:
     *   1. otos >= MIN_SAMPLE (21 >= 20)
     *   2. optimi loytyi hakuvalin SISALTA, ei reunalta -- reunalla oleva
     *      arvo tarkoittaa "hylkaa toinen lahde kokonaan" ja on lahes aina
     *      kohinaa (tiketti #72)
     *   3. muutos on pieni: 0.05 yksikkoa, ei hyppy
     *
     * Edellisella ajolla (n=20) sama laskenta ehdotti painoa 1.0 hakuvalin
     * reunalta. Sita EI sovellettu juuri siksi. Tarkista metrics.json
     * ennen seuraavaa saatoa.
     */
    blendWeight: Number(process.env.MODEL_BLEND_WEIGHT || 0.4),
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
