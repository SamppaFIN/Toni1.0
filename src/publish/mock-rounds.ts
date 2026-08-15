// Tiketti #37: Viiden kierroksen harjoitusdata
//
// Tarkoitus: omien vetolappujen ja tappioketjujen testaaminen ilman että
// tarvitsee odottaa oikeita otteluita. Viisi kierrosta peräkkäin, jokainen
// simuloitavissa — ketjua voi jahdata kierroksesta toiseen.
//
// KERTOIMET EIVÄT OLE KEKSITTYJÄ ILMASTA: ne johdetaan kauden oikeista
// Elo-luvuista (analyze/season-elo.ts, laskettu 115 pelatusta ottelusta).
// Näin harjoituskierros tuntuu oikealta — KuPS on suosikki koska KuPS on
// oikeasti kauden paras, ei koska arpa niin sanoi.
//
// DETERMINISTINEN: ei Math.randomia. Sama tiedosto joka ajolla, luettavat
// diffit, ja harjoituskierros on toistettavissa.
//
// Ajo: npm run mock:rounds

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fetchSeasonResults } from '../ingest/results-veikkausliiga.js';
import { calculateSeasonElo, eloProbabilities, toEloMap, EloRating } from '../analyze/season-elo.js';
import { buildMatchCard, buildSnapshot } from './snapshot.js';
import { teamRef } from '../ingest/odds-football.js';
import { BookmakerOdds, MatchCard, Snapshot, SideProbs, TeamStats } from '../types-football.js';

export const ROUNDS = 5;

/** Toimistot joilta kertoimet "haetaan" — samat kuin oikeassa datassa */
const BOOKMAKERS: Array<{ name: string; key: string; margin: number }> = [
  { name: 'Pinnacle', key: 'pinnacle', margin: 0.025 },
  { name: 'Unibet (SE)', key: 'unibet_se', margin: 0.055 },
  { name: 'Betsson', key: 'betsson', margin: 0.06 },
  { name: 'Nordic Bet', key: 'nordicbet', margin: 0.058 },
  { name: 'Coolbet', key: 'coolbet', margin: 0.045 },
  { name: 'Betfair', key: 'betfair_ex_eu', margin: 0.02 },
];

export interface MockRoundsFile {
  schema_version: 1;
  generated_at: string;
  kind: 'mock-rounds';
  rounds: Snapshot[];
}

/**
 * Deterministinen "satunnaisuus" indeksistä. Ei Math.randomia, mutta
 * tuottaa toimistokohtaista hajontaa jotta paras kerroin vaihtelee.
 */
function jitter(seed: number, spread: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return ((x - Math.floor(x)) - 0.5) * 2 * spread;
}

/** Todennäköisyydet → kertoimet marginaalilla ja toimistokohtaisella hajonnalla */
function oddsFor(probs: SideProbs, seed: number): BookmakerOdds[] {
  return BOOKMAKERS.map((bk, i) => {
    const price = (p: number, side: number) => {
      // Marginaali jaetaan tasaisesti, jitter siirtää yksittäistä hintaa
      const inflated = p * (1 + bk.margin);
      const withJitter = inflated * (1 + jitter(seed * 17 + i * 7 + side, 0.03));
      return Math.max(1.02, Math.round((1 / withJitter) * 100) / 100);
    };
    return {
      bookmaker: bk.name,
      key: bk.key,
      market: '1X2' as const,
      home: price(probs.home, 1),
      draw: price(probs.draw, 2),
      away: price(probs.away, 3),
      // Betfair on pörssi — komissio mukaan, kuten oikeassakin datassa
      commission: bk.key.startsWith('betfair') ? 0.05 : 0,
      fetched_at: '2026-08-15T08:00:00.000Z',
    };
  });
}

/**
 * Kierrosten ottelupariutus.
 *
 * Yksinkertainen rotaatio (round-robin): joukkue 0 pysyy paikallaan ja muut
 * kiertävät. Näin viisi kierrosta tuottaa 30 eri ottelua ilman toistoja,
 * ja jokainen joukkue pelaa joka kierros.
 */
function buildFixtures(teams: string[], round: number): Array<[string, string]> {
  const n = teams.length;
  const rotated = [teams[0], ...teams.slice(1).map((_, i) => teams[1 + ((i + round) % (n - 1))])];
  const fixtures: Array<[string, string]> = [];
  for (let i = 0; i < n / 2; i++) {
    const home = rotated[i];
    const away = rotated[n - 1 - i];
    // Vuorottele kotietu kierroksittain jotta sama joukkue ei ole aina kotona
    fixtures.push(round % 2 === 0 ? [home, away] : [away, home]);
  }
  return fixtures;
}

/**
 * Kauden oikeat tunnusluvut Elo-laskennan sivutuotteena.
 *
 * calculateSeasonElo laskee jo pelit, voitot ja maalit — nämä ovat oikeita
 * lukuja kauden otteluista, eivät keksittyjä. Sarjasija johdetaan pisteistä
 * (3-1-0), jolloin se vastaa oikeaa taulukkoa.
 *
 * form jää tyhjäksi: viiden viime ottelun järjestys vaatisi tulostason
 * aikajanan, eikä arvattu kirjainjono näyttäisi arvatulta.
 */
function statsFrom(ratings: EloRating[]): Map<string, TeamStats> {
  const points = (r: EloRating) => r.won * 3 + r.drawn;
  const byPoints = [...ratings].sort((a, b) => points(b) - points(a) || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst));
  const byElo = [...ratings].sort((a, b) => b.elo - a.elo);

  const map = new Map<string, TeamStats>();
  for (const r of ratings) {
    const played = r.played || 1;
    map.set(r.team, {
      rank: byPoints.findIndex((x) => x.team === r.team) + 1,
      played: r.played,
      form: '',
      gf_pg: Math.round((r.goalsFor / played) * 100) / 100,
      ga_pg: Math.round((r.goalsAgainst / played) * 100) / 100,
      home_gf_pg: null,
      away_gf_pg: null,
      xg_pg: null,
      rest_days: null,
      ppg: Math.round((points(r) / played) * 100) / 100,
      elo: Math.round(r.elo),
      elo_change: Math.round(r.change),
      elo_rank: byElo.findIndex((x) => x.team === r.team) + 1,
    });
  }
  return map;
}

export function buildMockRounds(ratings: EloRating[], baseDate = new Date('2026-08-16T00:00:00.000Z')): MockRoundsFile {
  const eloMap = toEloMap({ ratings, timeline: new Map(), matchesProcessed: 0 });
  const statsMap = statsFrom(ratings);
  const teams = ratings.map((r) => r.team);

  const rounds: Snapshot[] = [];

  for (let round = 0; round < ROUNDS; round++) {
    const kickoffDay = new Date(baseDate.getTime() + round * 7 * 86400_000);
    const cards: MatchCard[] = [];

    buildFixtures(teams, round).forEach(([home, away], matchIndex) => {
      const homeElo = eloMap.get(home) ?? 1500;
      const awayElo = eloMap.get(away) ?? 1500;
      const probs = eloProbabilities(homeElo, awayElo);

      const kickoff = new Date(kickoffDay.getTime() + (15 + matchIndex) * 3600_000);
      const seed = round * 100 + matchIndex;

      cards.push(
        buildMatchCard({
          id: `mock:r${round + 1}:${teamRef(home).short}-${teamRef(away).short}`,
          league: `Harjoituskierros ${round + 1}/${ROUNDS}`,
          kickoff: kickoff.toISOString(),
          home: teamRef(home),
          away: teamRef(away),
          odds: oddsFor(probs, seed),
          // Poisson jätetään pois: harjoitusdatan malli on Elo-pohjainen, ja
          // sen esittäminen Poissonina väittäisi enemmän kuin data kestää
          poisson: null,
          // Tunnusluvut ovat kauden oikeista otteluista — vain otteluparit
          // ja kertoimet ovat harjoitusta varten rakennettuja
          stats: statsMap.has(home) && statsMap.has(away)
            ? { home: statsMap.get(home)!, away: statsMap.get(away)!, h2h: [] }
            : null,
          bankroll: 100,
          adjustments: [
            {
              reason: `Kertoimet johdettu kauden Elo-luvuista: ${home} ${homeElo.toFixed(0)} vs ${away} ${awayElo.toFixed(0)}`,
            },
          ],
        })
      );
    });

    rounds.push(
      buildSnapshot(cards, 'mock', kickoffDay.toISOString(), [
        'Harjoitusdata — kertoimet johdettu kauden Elo-luvuista',
      ])
    );
  }

  return {
    schema_version: 1,
    generated_at: baseDate.toISOString(),
    kind: 'mock-rounds',
    rounds,
  };
}

export function writeMockRounds(publicDir: string, file: MockRoundsFile): string {
  const dir = path.join(publicDir, 'data');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'mock-rounds.json');
  writeFileSync(target, JSON.stringify(file, null, 2), 'utf8');
  return target;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

  const matches = await fetchSeasonResults();
  const elo = calculateSeasonElo(matches);
  const file = buildMockRounds(elo.ratings);
  const target = writeMockRounds(publicDir, file);

  console.log(`✓ ${ROUNDS} harjoituskierrosta kirjoitettu (${file.rounds.reduce((s, r) => s + r.matches.length, 0)} ottelua)`);
  console.log(`  ${target}`);
  console.log(`  Kertoimet johdettu ${elo.matchesProcessed} pelatun ottelun Elo-luvuista\n`);

  for (const [i, round] of file.rounds.entries()) {
    console.log(`Kierros ${i + 1} — ${round.generated_at.slice(0, 10)}`);
    for (const m of round.matches) {
      const flag = m.analysis.edges.find((e) => e.flag !== 'none');
      console.log(
        `  ${m.home.short} – ${m.away.short}`.padEnd(16) +
          `1 ${m.best.home.toFixed(2)}  X ${m.best.draw.toFixed(2)}  2 ${m.best.away.toFixed(2)}` +
          (flag ? `   ${flag.flag === 'strong' ? '💎' : '🟡'} ${flag.side} ${(flag.edge * 100).toFixed(1)} %` : '')
      );
    }
    console.log('');
  }
}
