// BetTracker configuration — inject via env vars, defaults for dev

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
      'https://www.jatkoaika.com/rss',
      'https://yle.fi/urheilu/rss',
    ],
  },
} as const;
