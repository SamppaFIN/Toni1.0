// Tiketit #24 + #25: today.json oikeasta datasta
//
// Koko putki yhdessä paikassa:
//   1. Kertoimet The Odds API:sta (oikeat toimistot, oikeat hinnat)
//   2. Tunnusluvut sarjan mukaan: veikkausliiga.com tai football-data.org
//   3. Joukkuevoimat nykyisestä + edellisestä kaudesta (kauden alun priori)
//   4. Poisson → 1X2, O/U 2.5, BTTS, tarkat tulokset
//   5. Sharp-devig (Pinnacle) → blendi → edge parhaasta hinnasta → Kelly
//
// Jos tilastolähde puuttuu tai pettää, ottelu jää `market-only`-tilaan:
// kertoimet ja hintavertailu toimivat silti. Tämä on tarkoituksellinen
// degradaatio eikä virhe — hauras lähde ei saa kaataa koko analyysiä.
//
// Ajo: npm run snapshot:live

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { ingestFootballOdds, FootballOddsEvent } from '../ingest/odds-football.js';
import { fetchStatsFor, LeagueStatsPair } from '../ingest/stats.js';
import { strengthForTeam } from '../analyze/strength.js';
import { predictPoisson, predictFromLambda, adjustLambda, LeagueAverages } from '../analyze/poisson.js';
import { fetchAllFeeds, attachNews, MatchNews } from '../ingest/news-football.js';
import { buildMatchCard, buildSnapshot, writeSnapshot } from './snapshot.js';
import { MatchCard, MatchStats, ModelAdjustment, TeamStats, TeamSeasonStats } from '../types-football.js';

/** Kuinka pitkälle eteenpäin otteluita otetaan mukaan */
const HORIZON_HOURS = Number(process.env.SNAPSHOT_HORIZON_HOURS || 72);

export interface BuildLiveOptions {
  now?: Date;
  bankroll?: number;
}

/** Kausitilastot → ottelukortin tunnuslukumuoto */
function toTeamStats(s: TeamSeasonStats, isHome: boolean): TeamStats {
  const perGame = (v: number | null, n: number | null) => (n && n > 0 && v !== null ? v / n : null);
  return {
    rank: s.rank,
    played: s.played,
    form: s.form ?? '',
    gf_pg: s.played ? round(s.gf / s.played, 2) : 0,
    ga_pg: s.played ? round(s.ga / s.played, 2) : 0,
    home_gf_pg: roundOrNull(perGame(s.home_gf, s.home_played), 2),
    away_gf_pg: roundOrNull(perGame(s.away_gf, s.away_played), 2),
    xg_pg: null,
    rest_days: null,
    ppg: s.played ? round(s.points / s.played, 2) : null,
    // isHome ei muuta lukuja, mutta pidetään parametri kutsupaikan luettavuuden vuoksi
    ...(isHome ? {} : {}),
  };
}

export async function buildLiveSnapshot(options: BuildLiveOptions = {}) {
  const now = options.now ?? new Date();
  const until = new Date(now.getTime() + HORIZON_HOURS * 3600_000);

  const events = await ingestFootballOdds({ from: now, until });

  // Tilastot haetaan kertaalleen per sarja, ei per ottelu
  const statsByLeague = new Map<string, LeagueStatsPair | null>();
  for (const sportKey of new Set(events.map((e) => e.sportKey))) {
    statsByLeague.set(sportKey, await fetchStatsFor(sportKey, now));
  }

  // Uutiset haetaan kertaalleen kaikille otteluille. Jos haku pettää, ottelut
  // jäävät ilman uutisia — se ei estä kertoimia eikä analyysiä.
  let newsByMatch = new Map<string, MatchNews>();
  try {
    const articles = await fetchAllFeeds();
    newsByMatch = await attachNews(
      events.map((e) => ({
        matchId: matchId(e),
        home: e.home,
        away: e.away,
        league: e.league,
      })),
      articles,
      now
    );
  } catch (err) {
    console.warn(`[News] Uutishaku epäonnistui kokonaan — ottelut jäävät ilman uutisia: ${(err as Error).message}`);
  }

  const cards: MatchCard[] = events.map((e) =>
    buildCard(e, statsByLeague.get(e.sportKey) ?? null, newsByMatch.get(matchId(e)) ?? null, options)
  );
  cards.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  // Lähteet nimeltä snapshotiin: käyttäjän pitää voida jäljittää mistä luku tuli
  const providers = ['The Odds API'];
  for (const pair of statsByLeague.values()) {
    if (pair && !providers.includes(pair.current.source)) providers.push(pair.current.source);
  }
  if ([...newsByMatch.values()].some((n) => n.news.length)) providers.push('RSS-uutissyötteet');

  return buildSnapshot(cards, 'live', now.toISOString(), providers);
}

function matchId(e: FootballOddsEvent): string {
  return `${e.sportKey}:${e.kickoff.slice(0, 10)}:${e.home.short}-${e.away.short}`;
}

function buildCard(
  e: FootballOddsEvent,
  stats: LeagueStatsPair | null,
  news: MatchNews | null,
  options: BuildLiveOptions
): MatchCard {
  const base = {
    id: matchId(e),
    league: e.league,
    kickoff: e.kickoff,
    home: e.home,
    away: e.away,
    odds: e.odds,
    news: news?.news ?? [],
    newsWindow: news?.newsWindow ?? false,
    bankroll: options.bankroll ?? 100,
    blendWeight: config.model.blendWeight,
  };

  if (!stats) return buildMatchCard({ ...base, poisson: null, stats: null });

  const home = strengthForTeam(e.home.name, stats.current, stats.previous, config.model.shrinkageK);
  const away = strengthForTeam(e.away.name, stats.current, stats.previous, config.model.shrinkageK);

  // Täsmäytys epäonnistui → näkyvä varoitus, ei hiljainen degradaatio
  if (!home || !away) {
    const missing = [!home && e.home.name, !away && e.away.name].filter(Boolean).join(', ');
    console.warn(`[Stats] ${e.home.name} vs ${e.away.name}: joukkuetta ei löytynyt tilastoista (${missing}) — market-only`);
    return buildMatchCard({ ...base, poisson: null, stats: null });
  }

  const league: LeagueAverages = { homeGoals: stats.current.homeGoalsAvg, awayGoals: stats.current.awayGoalsAvg };
  let poisson = predictPoisson(home.strength, away.strength, league, config.model.rho);

  const matchStats: MatchStats = {
    home: toTeamStats(home.stats, true),
    away: toTeamStats(away.stats, false),
    h2h: [], // otteluhistoria vaatii tulosdatan; ei vielä lähdettä Veikkausliigalle
  };

  // Mallin peruste näkyviin: käyttäjän pitää tietää nojaako luku tähän vai
  // viime kauteen, koska se muuttaa kuinka paljon siihen voi luottaa
  const adjustments: ModelAdjustment[] = [
    {
      reason:
        `Voimat: ${basisLabel(home.basis)} (${e.home.short}, ${home.playedThisSeason} ottelua) / ` +
        `${basisLabel(away.basis)} (${e.away.short}, ${away.playedThisSeason} ottelua)` +
        `${stats.current.splitsEstimated ? ' · koti/vierasjakauma estimoitu' : ''}`,
    },
  ];

  // Uutisten λ-korjaukset: vain korkean varmuuden LLM-tapahtumat pääsevät tänne
  // (ks. nlp-football.ts). Korjaus tehdään λ-arvoihin ja koko jakauma lasketaan
  // uudelleen, jotta myös O/U ja BTTS heijastavat muutoksen.
  const lambdaAdjustments = news?.lambdaAdjustments ?? [];
  if (lambdaAdjustments.length) {
    const homeDelta = sumDeltas(lambdaAdjustments, 'home');
    const awayDelta = sumDeltas(lambdaAdjustments, 'away');
    poisson = predictFromLambda(
      adjustLambda(poisson.lambdaHome, homeDelta),
      adjustLambda(poisson.lambdaAway, awayDelta),
      config.model.rho
    );
    for (const adj of lambdaAdjustments) {
      adjustments.push({
        reason: `📰 ${adj.reason}`,
        ...(adj.side === 'home' ? { delta_lambda_home: adj.delta } : { delta_lambda_away: adj.delta }),
      });
    }
  }

  return buildMatchCard({ ...base, poisson, stats: matchStats, adjustments });
}

function sumDeltas(adjustments: Array<{ side: 'home' | 'away'; delta: number }>, side: 'home' | 'away'): number {
  return adjustments.filter((a) => a.side === side).reduce((sum, a) => sum + a.delta, 0);
}

function basisLabel(basis: string): string {
  return (
    {
      'current-season': 'tämä kausi',
      blended: 'tämä + viime kausi',
      'previous-season': 'viime kausi',
      'league-average': 'sarjan keskitaso',
    }[basis] ?? basis
  );
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

function roundOrNull(n: number | null, d: number): number | null {
  return n === null ? null : round(n, d);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

  buildLiveSnapshot()
    .then((snapshot) => {
      if (!snapshot.matches.length) {
        console.warn('\n⚠️  Ei otteluita aikaikkunassa — today.json jätetään koskematta.');
        return;
      }

      const { todayPath, historyPath } = writeSnapshot(snapshot, publicDir);
      console.log(`\n✓ ${snapshot.matches.length} ottelua kirjoitettu (${snapshot.leagues.join(', ')})`);
      console.log(`  ${todayPath}`);
      console.log(`  ${historyPath}\n`);

      let flagged = 0;
      for (const m of snapshot.matches) {
        const best = m.analysis.edges.reduce((a, b) => (b.edge > a.edge ? b : a));
        const icon = best.flag === 'strong' ? '💎' : best.flag === 'candidate' ? '🟡' : '⚫';
        if (best.flag !== 'none') flagged++;

        console.log(`${icon} ${m.home.name} vs ${m.away.name}  —  ${m.league}, ${m.kickoff.slice(0, 16).replace('T', ' ')}`);
        console.log(`   ${m.odds.length} toimistoa | kate ${(m.market.margin * 100).toFixed(2)} % | ankkuri: ${m.market.sharp_source} | malli: ${m.model.method}`);

        if (m.model.lambda_home !== null) {
          console.log(`   λ ${m.model.lambda_home.toFixed(2)} − ${m.model.lambda_away!.toFixed(2)} | yli 2.5: ${pct(m.model.over25)} | BTTS: ${pct(m.model.btts)} | todennäköisin ${m.model.top_scores[0]?.score}`);
          console.log(`   Poisson  ${pct(m.model.poisson_probs!.home)} / ${pct(m.model.poisson_probs!.draw)} / ${pct(m.model.poisson_probs!.away)}`);
        }
        if (m.stats) {
          console.log(`   tunnusluvut  ${m.home.short}: sija ${m.stats.home.rank}, ${m.stats.home.gf_pg}−${m.stats.home.ga_pg} maalia/peli  |  ${m.away.short}: sija ${m.stats.away.rank}, ${m.stats.away.gf_pg}−${m.stats.away.ga_pg}`);
        }
        console.log(`   markkina ${pct(m.market.implied.home)} / ${pct(m.market.implied.draw)} / ${pct(m.market.implied.away)}`);
        console.log(`   malli    ${pct(m.model.probs.home)} / ${pct(m.model.probs.draw)} / ${pct(m.model.probs.away)}  (w=${m.model.blend_weight})`);
        console.log(`   paras    1 ${m.best.home.toFixed(2)} (${m.best.home_book})  X ${m.best.draw.toFixed(2)} (${m.best.draw_book})  2 ${m.best.away.toFixed(2)} (${m.best.away_book})`);

        for (const edge of m.analysis.edges) {
          const mark = edge.flag === 'strong' ? '💎' : edge.flag === 'candidate' ? '🟡' : '  ';
          const stake = edge.stake_suggestion > 0 ? ` → panos ${edge.stake_suggestion.toFixed(2)} €` : '';
          console.log(`   ${mark} ${edge.side.padEnd(5)} edge ${(edge.edge * 100).toFixed(1).padStart(6)} %${stake}`);
        }
        console.log('');
      }

      console.log(`Value-kohteita: ${flagged}/${snapshot.matches.length} ottelussa.`);
      if (!flagged) console.log('Ei löytöjä — markkina on tiukka. Normaali ja odotettu lopputulos.');
    })
    .catch((err) => {
      console.error('\n✗ Snapshotin luonti epäonnistui:', err.message);
      process.exit(1);
    });
}

function pct(prob: number | null): string {
  return prob === null ? '—' : `${(prob * 100).toFixed(1)}%`;
}
