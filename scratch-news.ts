import { fetchAllFeeds, attachNews } from './src/ingest/news-football.js';

const articles = await fetchAllFeeds();
console.log('Juttuja yhteensa:', articles.length);
const per: Record<string, number> = {};
for (const a of articles) per[a.sport] = (per[a.sport] ?? 0) + 1;
console.log('Lajeittain:', JSON.stringify(per));

// Illan Liiga-ottelut kuvasta
const ottelut = [
  ['Jukurit', 'HPK'], ['Kiekko-Espoo', 'KalPa'], ['Kärpät', 'Ässät'],
  ['Lukko', 'Ilves'], ['SaiPa', 'Tappara'], ['Sport', 'Jokerit'], ['TPS', 'KooKoo'],
];

const news = await attachNews(
  ottelut.map(([h, a], i) => ({
    matchId: `icehockey_liiga:2026-09-01:M${i}`,
    home: { name: h } as any,
    away: { name: a } as any,
    league: 'Liiga',
    sport: 'hockey' as const,
  })),
  articles
);

console.log('\nJAAKIEKKO-OTTELUT JA NIIHIN LIITETYT UUTISET:');
for (const [i, [h, a]] of ottelut.entries()) {
  const n = news.get(`icehockey_liiga:2026-09-01:M${i}`);
  console.log(`\n${h} - ${a}: ${n?.news.length ?? 0} uutista`);
  for (const item of n?.news ?? []) console.log('   •', item.title.slice(0, 78));
}
