// Tiketti #23: Esimerkkisnapshot — kontraktin konkreettinen muoto
//
// Tämä tuottaa public/data/today.json:n ilman yhtäkään API-avainta, jotta UI-työ
// (tiketit 30–32) voi alkaa rinnakkain datankeruun kanssa. Kertoimet ovat
// KÄSINKIRJOITETTUJA esimerkkilukuja — siksi source = "mock" ja UI näyttää siitä
// varoituksen. Kaikki muu (devig, blendi, edge, Kelly) lasketaan oikealla koodilla,
// joten tiedosto on aito näyte siitä mitä putki tuottaa.
//
// Deterministinen tarkoituksella: ei Math.randomia, jotta committoitu tiedosto
// ei muutu joka ajolla ja diffit pysyvät luettavina.
//
// Ajo: npm run snapshot:mock

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { predictPoisson, teamStrength, shrinkStrength, LeagueAverages } from '../analyze/poisson.js';
import { commissionFor } from '../ingest/odds-football.js';
import { buildMatchCard, buildSnapshot, writeSnapshot } from './snapshot.js';
import { BookmakerOdds, MatchStats, NewsItem, TeamRef } from '../types-football.js';

const GENERATED_AT = '2026-08-14T09:00:00.000Z';

interface MockMatch {
  id: string;
  league: string;
  leagueAverages: LeagueAverages;
  kickoff: string;
  home: TeamRef;
  away: TeamRef;
  /** [maalit tehty/peli, maalit päästetty/peli] */
  homeGoals: [number, number];
  awayGoals: [number, number];
  /** [1, X, 2] per toimisto */
  odds: Array<[string, string, number, number, number]>;
  stats: MatchStats;
  news: NewsItem[];
}

const EPL: LeagueAverages = { homeGoals: 1.55, awayGoals: 1.25 };
const VEIKKAUSLIIGA: LeagueAverages = { homeGoals: 1.45, awayGoals: 1.15 };

const MATCHES: MockMatch[] = [
  {
    id: 'soccer_epl:2026-08-14:ARS-CHE',
    league: 'Valioliiga',
    leagueAverages: EPL,
    kickoff: '2026-08-14T18:30:00.000Z',
    home: { name: 'Arsenal', short: 'ARS', color: '#EF0107' },
    away: { name: 'Chelsea', short: 'CHE', color: '#034694' },
    homeGoals: [2.20, 0.90],
    awayGoals: [1.60, 1.30],
    odds: [
      ['Pinnacle', 'pinnacle', 1.95, 3.70, 4.00],
      ['Unibet', 'unibet_eu', 1.98, 3.60, 3.95],
      ['Betsson', 'betsson', 1.92, 3.75, 3.85],
      ['NordicBet', 'nordicbet', 1.94, 3.65, 4.05],
      ['bet365', 'bet365', 1.96, 3.60, 3.90],
    ],
    stats: {
      home: { rank: 2, played: 3, form: 'WWD', gf_pg: 2.20, ga_pg: 0.90, home_gf_pg: 2.50, away_gf_pg: 1.90, xg_pg: null, rest_days: 6, ppg: 2.33 },
      away: { rank: 6, played: 3, form: 'WLD', gf_pg: 1.60, ga_pg: 1.30, home_gf_pg: 1.80, away_gf_pg: 1.40, xg_pg: null, rest_days: 4, ppg: 1.33 },
      h2h: [
        { date: '2026-04-11', score: '1-2', venue: 'home' },
        { date: '2025-11-23', score: '2-2', venue: 'away' },
        { date: '2025-03-08', score: '3-1', venue: 'home' },
      ],
    },
    news: [
      {
        title: 'Chelsea ilman avainhyökkääjäänsä — reisivamma pitää sivussa arviolta kolme viikkoa',
        url: 'https://www.bbc.com/sport/football/example-1',
        source: 'BBC Sport',
        published_at: '2026-08-14T07:40:00.000Z',
        event_type: 'injury',
        team: 'Chelsea',
        player: 'esimerkkipelaaja',
        confidence: 0.86,
        impact: 'Kärkihyökkääjä sivussa — vieraiden maaliodotus laskee',
      },
      {
        title: 'Arsenalin kokoonpano ennallaan, valmentaja vahvisti lehdistötilaisuudessa',
        url: 'https://www.theguardian.com/football/example-2',
        source: 'The Guardian',
        published_at: '2026-08-13T16:10:00.000Z',
        event_type: 'lineup_change',
        team: 'Arsenal',
        player: null,
        confidence: 0.74,
        impact: 'Ei muutoksia — ei vaikutusta malliin',
      },
    ],
  },
  {
    id: 'soccer_epl:2026-08-14:BHA-EVE',
    league: 'Valioliiga',
    leagueAverages: EPL,
    kickoff: '2026-08-14T16:00:00.000Z',
    home: { name: 'Brighton', short: 'BHA', color: '#0057B8' },
    away: { name: 'Everton', short: 'EVE', color: '#003399' },
    homeGoals: [1.50, 1.40],
    awayGoals: [1.20, 1.50],
    odds: [
      ['Pinnacle', 'pinnacle', 2.05, 3.45, 3.75],
      ['Unibet', 'unibet_eu', 2.10, 3.40, 3.60],
      ['Betsson', 'betsson', 2.02, 3.50, 3.70],
      ['NordicBet', 'nordicbet', 2.08, 3.35, 3.80],
    ],
    stats: {
      home: { rank: 9, played: 3, form: 'DWL', gf_pg: 1.50, ga_pg: 1.40, home_gf_pg: 1.70, away_gf_pg: 1.30, xg_pg: null, rest_days: 7, ppg: 1.33 },
      away: { rank: 14, played: 3, form: 'LDL', gf_pg: 1.20, ga_pg: 1.50, home_gf_pg: 1.40, away_gf_pg: 1.00, xg_pg: null, rest_days: 7, ppg: 0.67 },
      h2h: [
        { date: '2026-02-14', score: '1-1', venue: 'home' },
        { date: '2025-09-27', score: '0-2', venue: 'away' },
      ],
    },
    news: [],
  },
  {
    id: 'soccer_finland_veikkausliiga:2026-08-14:HJK-KUPS',
    league: 'Veikkausliiga',
    leagueAverages: VEIKKAUSLIIGA,
    kickoff: '2026-08-14T15:30:00.000Z',
    home: { name: 'HJK', short: 'HJK', color: '#0033A0' },
    away: { name: 'KuPS', short: 'KUP', color: '#FFDD00' },
    homeGoals: [1.85, 1.05],
    awayGoals: [1.70, 1.10],
    odds: [
      ['Pinnacle', 'pinnacle', 2.25, 3.30, 3.20],
      ['Unibet', 'unibet_eu', 2.35, 3.25, 3.10],
      ['Veikkaus', 'veikkaus', 2.15, 3.20, 3.05],
      ['NordicBet', 'nordicbet', 2.28, 3.30, 3.15],
    ],
    stats: {
      home: { rank: 1, played: 18, form: 'WWWDW', gf_pg: 1.85, ga_pg: 1.05, home_gf_pg: 2.10, away_gf_pg: 1.60, xg_pg: null, rest_days: 5, ppg: 2.11 },
      away: { rank: 3, played: 18, form: 'WDWLW', gf_pg: 1.70, ga_pg: 1.10, home_gf_pg: 1.95, away_gf_pg: 1.45, xg_pg: null, rest_days: 4, ppg: 1.83 },
      h2h: [
        { date: '2026-05-18', score: '2-1', venue: 'home' },
        { date: '2025-08-30', score: '1-1', venue: 'away' },
        { date: '2025-04-20', score: '0-1', venue: 'home' },
      ],
    },
    news: [
      {
        title: 'KuPS kiertää tiiviissä ottelutahdissa — kolme peliä kahdeksassa päivässä',
        url: 'https://yle.fi/urheilu/example-3',
        source: 'Yle Urheilu',
        published_at: '2026-08-13T11:00:00.000Z',
        event_type: 'other',
        team: 'KuPS',
        player: null,
        confidence: 0.68,
        impact: 'Otteluruuhka — matala confidence, ei λ-korjausta',
      },
    ],
  },
  {
    // Tämä ottelu on fixtuurina se tapaus jossa edge on AITO: pieni sarja,
    // 18 pelattua ottelua (kutistus ei enää syö voimaeroa) ja yksi toimisto
    // selvästi linjan ulkopuolella kotivoitossa. Juuri näin oikea arvo syntyy —
    // ei mallin nerokkuudesta vaan siitä että joku hinnoittelee väärin.
    id: 'soccer_finland_veikkausliiga:2026-08-14:INT-ILV',
    league: 'Veikkausliiga',
    leagueAverages: VEIKKAUSLIIGA,
    kickoff: '2026-08-14T16:00:00.000Z',
    home: { name: 'Inter Turku', short: 'INT', color: '#004B93' },
    away: { name: 'Ilves', short: 'ILV', color: '#00843D' },
    homeGoals: [2.05, 0.85],
    awayGoals: [1.05, 1.65],
    odds: [
      ['Pinnacle', 'pinnacle', 1.36, 4.75, 7.90],
      ['Unibet', 'unibet_eu', 1.38, 4.65, 7.60],
      ['Veikkaus', 'veikkaus', 1.33, 4.50, 7.20],
      ['NordicBet', 'nordicbet', 1.48, 4.40, 6.80],
    ],
    stats: {
      home: { rank: 2, played: 18, form: 'WWDWW', gf_pg: 2.05, ga_pg: 0.85, home_gf_pg: 2.35, away_gf_pg: 1.75, xg_pg: null, rest_days: 6, ppg: 2.06 },
      away: { rank: 11, played: 18, form: 'LLDLW', gf_pg: 1.05, ga_pg: 1.65, home_gf_pg: 1.25, away_gf_pg: 0.85, xg_pg: null, rest_days: 6, ppg: 0.89 },
      h2h: [
        { date: '2026-06-02', score: '3-0', venue: 'home' },
        { date: '2025-09-14', score: '1-1', venue: 'away' },
      ],
    },
    news: [],
  },
];

function toBookmakerOdds(row: [string, string, number, number, number]): BookmakerOdds {
  const [bookmaker, key, home, draw, away] = row;
  return { bookmaker, key, market: '1X2', home, draw, away, commission: commissionFor(key), fetched_at: GENERATED_AT };
}

export function buildMockSnapshot() {
  const cards = MATCHES.map((m) => {
    // Kutistus otoskoon mukaan: 3 ottelun Valioliigadata on kohinaa,
    // 18 ottelun Veikkausliigadata jo kohtuullinen estimaatti
    const home = shrinkStrength(
      teamStrength(m.homeGoals[0], m.homeGoals[1], m.leagueAverages),
      m.stats.home.played
    );
    const away = shrinkStrength(
      teamStrength(m.awayGoals[0], m.awayGoals[1], m.leagueAverages),
      m.stats.away.played
    );
    const poisson = predictPoisson(home, away, m.leagueAverages);

    // Loukkaantumissäätö näkyviin: yli 0.7 confidencen injury-uutinen laskee λ:aa
    const injury = m.news.find((n) => n.event_type === 'injury' && (n.confidence ?? 0) > 0.7);
    const adjustments = injury
      ? [
          {
            reason: `${injury.team}: ${injury.impact}`,
            ...(injury.team === m.away.name ? { delta_lambda_away: -0.09 } : { delta_lambda_home: -0.09 }),
          },
        ]
      : [];

    return buildMatchCard({
      id: m.id,
      league: m.league,
      kickoff: m.kickoff,
      home: m.home,
      away: m.away,
      odds: m.odds.map(toBookmakerOdds),
      poisson,
      stats: m.stats,
      news: m.news,
      adjustments,
      bankroll: 100,
    });
  });

  return buildSnapshot(cards, 'mock', GENERATED_AT, ['esimerkkidata (ei oikeita kertoimia)']);
}

// Huom: pathToFileURL on välttämätön — `file://${process.argv[1]}` ei täsmää
// Windowsilla, koska argv[1] on "C:\..." ja import.meta.url on "file:///C:/...".
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  const snapshot = buildMockSnapshot();
  const { todayPath, historyPath } = writeSnapshot(snapshot, publicDir);

  console.log(`✓ Kirjoitettu ${snapshot.matches.length} ottelua (source: ${snapshot.source})`);
  console.log(`  ${todayPath}`);
  console.log(`  ${historyPath}\n`);

  for (const m of snapshot.matches) {
    // Mock-snapshotissa Poisson on aina laskettu, mutta skeema sallii sen puuttuvan
    const { lambda_home, lambda_away, poisson_probs, over25, btts } = m.model;
    console.log(`${m.home.name} vs ${m.away.name}  (${m.league})`);
    console.log(`  λ ${num(lambda_home)} − ${num(lambda_away)} | kate ${(m.market.margin * 100).toFixed(1)} % | sharp: ${m.market.sharp_source}`);
    if (poisson_probs) console.log(`  Poisson  ${pct(poisson_probs.home)} / ${pct(poisson_probs.draw)} / ${pct(poisson_probs.away)}`);
    console.log(`  Markkina ${pct(m.market.implied.home)} / ${pct(m.market.implied.draw)} / ${pct(m.market.implied.away)}`);
    console.log(`  Blendi   ${pct(m.model.probs.home)} / ${pct(m.model.probs.draw)} / ${pct(m.model.probs.away)}  (w=${m.model.blend_weight})`);
    console.log(`  Yli 2.5: ${pct(over25)}  BTTS: ${pct(btts)}  Todennäköisin: ${m.model.top_scores[0]?.score ?? '—'}`);
    for (const e of m.analysis.edges) {
      const icon = e.flag === 'strong' ? '💎' : e.flag === 'candidate' ? '🟡' : '⚫';
      const stake = e.stake_suggestion > 0 ? ` → panos ${e.stake_suggestion.toFixed(2)} €` : '';
      console.log(`  ${icon} ${e.side.padEnd(5)} @ ${e.odds.toFixed(2)} (${e.book}) edge ${(e.edge * 100).toFixed(1)} %${stake}`);
    }
    console.log('');
  }
}

function pct(n: number | null): string {
  return n === null ? '—' : `${(n * 100).toFixed(1)}%`;
}

function num(n: number | null): string {
  return n === null ? '—' : n.toFixed(2);
}
