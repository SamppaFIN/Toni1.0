// Tiketti #37: Kausisimulaation kierrosdata
//
// Tarkoitus: harjoitella vedonlyontia kokonaisella kaudella niin, etta jokainen
// kierros rakennetaan historiaan perustuen. Ennen jokaista kierrosta Elo-luvut
// ja tunnusluvut lasketaan uudelleen siihen asti pelatuista otteluista.
//
// Kertoimet johdetaan kierroskohtaisista Eloista ja niihin lisataan pieni,
// deterministinen varianssi. Varianssi tuottaa seka hyvia etta huonoja
// vetokohteita ilman satunnaisesti vaihtuvaa tiedostoa.
//
// Ajo: npm run mock:rounds

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fetchSeasonResults, SeasonMatch } from '../ingest/results-veikkausliiga.js';
import { STARTING_ELO, calculateSeasonElo, eloProbabilities, toEloMap } from '../analyze/season-elo.js';
import { buildMatchCard, buildSnapshot } from './snapshot.js';
import { teamRef } from '../ingest/odds-football.js';
import { BookmakerOdds, MatchCard, Snapshot, SideProbs, TeamStats } from '../types-football.js';

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
  season: string;
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
  const valueSide = seed % 3;
  const trapSide = (seed + 1) % 3;

  return BOOKMAKERS.map((bk, i) => {
    const price = (p: number, side: number) => {
      const sideIndex = side - 1;
      const sideBoost = i === 1 && sideIndex === valueSide ? -0.11 : 0;
      const sidePenalty = i === 2 && sideIndex === trapSide ? 0.05 : 0;
      // Marginaali jaetaan tasaisesti, jitter siirtää yksittäistä hintaa
      const inflated = p * (1 + bk.margin);
      const withJitter = inflated * (1 + jitter(seed * 17 + i * 7 + side, 0.025) + sideBoost + sidePenalty);
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
 * Ryhmittele kauden ottelut kierroksiksi.
 *
 * Kierros vaihtuu kun joku joukkue esiintyisi toista kertaa samassa ryhmässä.
 * Tämä toimii Veikkausliigan rytmillä, jossa yksi joukkue pelaa kierroksella
 * yleensä vain kerran.
 */
function splitToRounds(matches: SeasonMatch[]): SeasonMatch[][] {
  const rounds: SeasonMatch[][] = [];
  let current: SeasonMatch[] = [];
  let seen = new Set<string>();

  for (const m of matches) {
    if (seen.has(m.home) || seen.has(m.away)) {
      if (current.length) rounds.push(current);
      current = [];
      seen = new Set<string>();
    }
    current.push(m);
    seen.add(m.home);
    seen.add(m.away);
  }

  if (current.length) rounds.push(current);
  return rounds;
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
function statsFromRound(allTeams: string[], matchesSoFar: SeasonMatch[]): Map<string, TeamStats> {
  const ratings = calculateSeasonElo(matchesSoFar, { startingElo: STARTING_ELO }).ratings;
  const points = (r: { won: number; drawn: number }) => r.won * 3 + r.drawn;
  const byPoints = [...ratings].sort((a, b) => points(b) - points(a) || b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst));
  const byElo = [...ratings].sort((a, b) => b.elo - a.elo);

  const byTeam = new Map(ratings.map((r) => [r.team, r]));

  const map = new Map<string, TeamStats>();
  for (const team of allTeams) {
    const r = byTeam.get(team);
    if (!r) {
      map.set(team, {
        rank: null,
        played: 0,
        form: '',
        gf_pg: 0,
        ga_pg: 0,
        home_gf_pg: null,
        away_gf_pg: null,
        xg_pg: null,
        rest_days: null,
        ppg: null,
        elo: STARTING_ELO,
        elo_change: 0,
        elo_rank: null,
      });
      continue;
    }

    const played = r.played || 1;
    map.set(team, {
      rank: byPoints.findIndex((x) => x.team === team) + 1,
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
      elo_rank: byElo.findIndex((x) => x.team === team) + 1,
    });
  }
  return map;
}

function seasonLabel(matches: SeasonMatch[]): string {
  const years = [...new Set(matches.map((m) => m.date.slice(0, 4)))];
  return years.length === 1 ? years[0] : `${years[0]}-${years[years.length - 1]}`;
}

export function buildMockRounds(matches: SeasonMatch[], baseDate = new Date('2026-08-16T00:00:00.000Z')): MockRoundsFile {
  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const roundsFromSeason = splitToRounds(ordered);
  const allTeams = [...new Set(ordered.flatMap((m) => [m.home, m.away]))].sort();

  const rounds: Snapshot[] = [];
  let processed: SeasonMatch[] = [];

  for (let round = 0; round < roundsFromSeason.length; round++) {
    const kickoffDay = new Date(baseDate.getTime() + round * 7 * 86400_000);
    const cards: MatchCard[] = [];
    const seasonRound = roundsFromSeason[round];
    const preRoundRatings = calculateSeasonElo(processed, { startingElo: STARTING_ELO }).ratings;
    const eloMap = toEloMap({ ratings: preRoundRatings, timeline: new Map(), matchesProcessed: processed.length });
    const statsMap = statsFromRound(allTeams, processed);

    seasonRound.forEach((resultMatch, matchIndex) => {
      const home = resultMatch.home;
      const away = resultMatch.away;
      const homeElo = eloMap.get(home) ?? 1500;
      const awayElo = eloMap.get(away) ?? 1500;
      const probs = eloProbabilities(homeElo, awayElo);

      const kickoff = new Date(kickoffDay.getTime() + (15 + matchIndex) * 3600_000);
      const seed = round * 100 + matchIndex;

      cards.push(
        buildMatchCard({
          id: `mock:r${round + 1}:${teamRef(home).short}-${teamRef(away).short}`,
          league: `Kausisimulaatio ${round + 1}/${roundsFromSeason.length}`,
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
              reason: `Kierroksen alku-Elo: ${home} ${homeElo.toFixed(0)} vs ${away} ${awayElo.toFixed(0)}`,
            },
            {
              reason: `Historiatulos (vertailu): ${resultMatch.homeScore}-${resultMatch.awayScore} (${resultMatch.date})`,
            },
          ],
        })
      );
    });

    rounds.push(
      buildSnapshot(cards, 'mock', kickoffDay.toISOString(), [
        'Kausisimulaatio — kertoimet johdettu kierroskohtaisista Elo-luvuista',
        `Historiadata: ${seasonLabel(ordered)} Veikkausliiga`,
      ])
    );

    processed = processed.concat(seasonRound);
  }

  return {
    schema_version: 1,
    generated_at: baseDate.toISOString(),
    kind: 'mock-rounds',
    season: seasonLabel(ordered),
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
  const file = buildMockRounds(matches);
  const target = writeMockRounds(publicDir, file);

  console.log(`✓ ${file.rounds.length} kausisimulaatiokierrosta kirjoitettu (${file.rounds.reduce((s, r) => s + r.matches.length, 0)} ottelua)`);
  console.log(`  ${target}`);
  console.log(`  Historiakausi: ${file.season} (${matches.length} tulosta)\n`);

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
