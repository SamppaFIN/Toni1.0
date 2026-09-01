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
import { sportOf } from '../leagues.js';
import { applyDrawBoost } from '../analyze/hockey-draws.js';
import { quotaWarning } from '../leagues.js';
import { ingestFootballOdds, buildMatchId, FootballOddsEvent } from '../ingest/odds-football.js';
import { fetchStatsFor, LeagueStatsPair } from '../ingest/stats.js';
import { fetchLowerDivision, promotedStrengthFrom } from '../ingest/promoted.js';
import { strengthForTeam, matchConfidence } from '../analyze/strength.js';
import { predictPoisson, predictFromLambda, adjustLambda, LeagueAverages } from '../analyze/poisson.js';
import { fetchAllFeeds, attachNews, MatchNews } from '../ingest/news-football.js';
import { fetchSeasonResults, normalizeTeam } from '../ingest/results-veikkausliiga.js';
import { fetchSeasonResultsEspn, hasEspnResults } from '../ingest/results-espn.js';
import { calculateSeasonElo, STARTING_ELO } from '../analyze/season-elo.js';
import { buildMatchCard, buildSnapshot, writeSnapshot } from './snapshot.js';
import { MatchCard, MatchStats, ModelAdjustment, TeamStats, TeamSeasonStats } from '../types-football.js';

/** Kuinka pitkälle eteenpäin otteluita otetaan mukaan */
const HORIZON_HOURS = Number(process.env.SNAPSHOT_HORIZON_HOURS || 72);

/** Ainoa sarja jolle on ottelutuloslähde eli jolle Elo voidaan laskea */
const VEIKKAUSLIIGA_KEY = 'soccer_finland_veikkausliiga';

export interface BuildLiveOptions {
  now?: Date;
  bankroll?: number;
}

/**
 * Kauden Elo-luvut joukkuenimen mukaan.
 *
 * Vain Veikkausliigalle: Elo vaatii ottelutulokset kronologisessa
 * järjestyksessä, ja veikkausliigapelit.fi on ainoa lähde joka ne antaa.
 * Muille sarjoille luku jää nulliksi — sarjataulukon pisteistä johdettu
 * "Elo" ei olisi Elo vaan eri suure samalla nimellä.
 */
export type EloLookup = Map<string, { elo: number; change: number; rank: number }>;

export async function fetchSeasonEloMap(): Promise<EloLookup> {
  const matches = await fetchSeasonResults();
  const result = calculateSeasonElo(matches);
  const sorted = [...result.ratings].sort((a, b) => b.elo - a.elo);
  const map: EloLookup = new Map();
  sorted.forEach((r, i) => {
    map.set(normalizeTeam(r.team), { elo: Math.round(r.elo), change: Math.round(r.change), rank: i + 1 });
  });
  return map;
}

/**
 * Aggressiivinen nimennormalisointi ESPN-sarjoille (tiketti #57).
 *
 * Kolme lähdettä kirjoittaa saman joukkueen eri tavoin:
 *   The Odds API      "Brighton and Hove Albion"
 *   ESPN              "Brighton & Hove Albion"
 *   football-data.org "Brighton & Hove Albion FC"
 *
 * Veikkausliigalle tämä ratkaistiin käsin ylläpidetyllä kartalla
 * (STATS_TO_ELO_NAME), koska sarjassa on 12 joukkuetta ja nimet ovat
 * epäsäännöllisiä. Isoissa sarjoissa se ei skaalaa — siellä poistetaan
 * seuramuodot ja välimerkit ja verrataan jäljelle jäävää.
 *
 * Riski on päinvastainen kuin kartalla: liian aggressiivinen normalisointi
 * voisi yhdistää kaksi eri joukkuetta. Siksi "united"/"city" ja vastaavat
 * EROTTELEVAT sanat jätetään paikoilleen — vain seuramuodot poistetaan.
 */
const DIACRITICS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/** Seuramuodot jotka eivat erottele joukkueita toisistaan */
const CLUB_FORMS = new Set(['afc', 'fc', 'cf', 'sc', 'ac', 'if', 'ifk', 'club']);

export function normalizeClubName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/&/g, ' and ')
    // Sanoittain eika regexin sanarajoilla: token-vertailu on tassa seka
    // selkeampi etta turvallisempi. Korvaus ilman sanarajaa silpoisi nimia
    // keskelta -- "palace" sisaltaa "ac" ja muuttuisi muotoon "pale",
    // jolloin kaksi eri joukkuetta voisi normalisoitua samaksi.
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !CLUB_FORMS.has(t))
    .join('');
}

/**
 * Kauden Elo yhdelle sarjalle. Veikkausliiga käyttää omaa tuloslähdettään
 * (tokenipohjainen jäsennys, testattu), muut ESPN:ää. Sarja jolle ei ole
 * kumpaakaan jää ilman Eloa — sitä ei johdeta sarjataulukosta, koska
 * pisteistä laskettu luku ei olisi Elo vaan eri suure samalla nimellä.
 */
export async function fetchEloMapFor(sportKey: string): Promise<EloLookup | null> {
  if (sportKey === VEIKKAUSLIIGA_KEY) return fetchSeasonEloMap();
  if (!hasEspnResults(sportKey)) return null;

  const matches = await fetchSeasonResultsEspn(sportKey);
  if (!matches.length) return null;

  const result = calculateSeasonElo(matches);
  const sorted = [...result.ratings].sort((a, b) => b.elo - a.elo);
  const map: EloLookup = new Map();
  sorted.forEach((r, i) => {
    map.set(normalizeClubName(r.team), { elo: Math.round(r.elo), change: Math.round(r.change), rank: i + 1 });
  });
  return map;
}

/**
 * Tilastolähde (Wikipedia/football-data.org) käyttää lyhyempiä nimiä kuin
 * tuloslähde (veikkausliigapelit.fi): "HJK" vs "HJK Helsinki", "Inter Turku"
 * vs "FC Inter Turku". Sama ongelma jota TEAM_NAME_MAP jo ratkaisee
 * tuloslähteen SISÄLLÄ (Helsingfors/Helsinki) — tämä kartta menee
 * tilastolähteen nimestä tuloslähteen (siis Elo-kartan) nimeen.
 *
 * Todettu käsin vertaamalla molempien lähteiden 12 joukkueen listaa
 * (ks. tickets/... tai git-historia): 4/12 täsmäsi jo sellaisenaan, loput 8
 * tässä. Ilman tätä 3/4 päivän ottelusta jäi ilman Elo-lukua huomaamatta.
 */
const STATS_TO_ELO_NAME: Record<string, string> = {
  HJK: 'HJK Helsinki',
  'Inter Turku': 'FC Inter Turku',
  VPS: 'VPS Vaasa',
  TPS: 'TPS Turku',
  Ilves: 'Ilves Tampere',
  SJK: 'SJK Seinäjoki',
  KuPS: 'KuPS Kuopio',
  'FF Jaro': 'Jaro',
};

/** Tilastolähteen nimi → Elo-kartan avain */
export function eloKeyFor(statsName: string): string {
  return normalizeTeam(STATS_TO_ELO_NAME[statsName] ?? statsName);
}

/** Kausitilastot → ottelukortin tunnuslukumuoto */
function toTeamStats(s: TeamSeasonStats, isHome: boolean, elo: EloLookup | null): TeamStats {
  const perGame = (v: number | null, n: number | null) => (n && n > 0 && v !== null ? v / n : null);
  // Epäonnistunut täsmäytys jättää luvun nulliksi eikä arvaa.
  // Veikkausliigan kartta ensin, sitten yleinen normalisointi muille sarjoille
  // Veikkausliigan kasin yllapidetty kartta ensin, sitten yleinen normalisointi
  const rating = elo?.get(eloKeyFor(s.name)) ?? elo?.get(normalizeClubName(s.name)) ?? null;

  // Sarjalla ON Elo mutta joukkue ei ole viela pelannut: nayta kauden
  // LAHTOTASO merkittyna. Pelkka null saa ominaisuuden nayttamaan
  // rikkinaiselta kauden alussa, merkitsematon 1500 taas vaittaisi mitattua.
  const provisional = !rating && Boolean(elo?.size);
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
    elo: rating?.elo ?? (provisional ? STARTING_ELO : null),
    elo_change: rating?.change ?? (provisional ? 0 : null),
    elo_rank: rating?.rank ?? null,
    ...(provisional ? { elo_provisional: true } : {}),
    // isHome ei muuta lukuja, mutta pidetään parametri kutsupaikan luettavuuden vuoksi
    ...(isHome ? {} : {}),
  };
}

export async function buildLiveSnapshot(options: BuildLiveOptions = {}) {
  const now = options.now ?? new Date();
  const until = new Date(now.getTime() + HORIZON_HOURS * 3600_000);

  // Tiketti #61: kerroinhaku maksaa 1 krediitin PER SARJA, joten hinta kasvaa
  // lineaarisesti sarjojen maarassa. Varoitus ei esta ajoa (kayttaja voi olla
  // maksavalla tasolla) -- vuorokausikatto ODDS_DAILY_CREDIT_BUDGET on se joka
  // oikeasti pysayttaa putken.
  const warning = quotaWarning(config.odds.footballSports.length);
  if (warning) console.warn(`[Kvootta] ${warning}`);

  const events = await ingestFootballOdds({ from: now, until });

  // Tilastot haetaan kertaalleen per sarja, ei per ottelu
  const statsByLeague = new Map<string, LeagueStatsPair | null>();
  // Tiketti #68: nousijan priori edellisen kauden alemmasta sarjasta.
  // Haetaan vain sarjoille joilla on toisen tason vastine rekisterissa.
  const lowerByLeague = new Map<string, Awaited<ReturnType<typeof fetchLowerDivision>>>();
  for (const sportKey of new Set(events.map((e) => e.sportKey))) {
    statsByLeague.set(sportKey, await fetchStatsFor(sportKey, now));
    lowerByLeague.set(sportKey, await fetchLowerDivision(sportKey, now.getUTCFullYear()));
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

  // Kauden Elo per sarja (tiketti #57). Aiemmin vain Veikkausliigalla oli
  // ottelutuloslähde; ESPN antaa nyt tulokset myös Valioliigalle ja muille
  // suurille sarjoille ilman avainta. Haetaan vain ne sarjat joita kierroksella
  // oikeasti on — turha pyyntö on turha vaikka se olisi ilmainen.
  const eloByLeague = new Map<string, EloLookup>();
  for (const sportKey of new Set(events.map((e) => e.sportKey))) {
    try {
      const map = await fetchEloMapFor(sportKey);
      if (map?.size) {
        eloByLeague.set(sportKey, map);
        console.log(`[Elo] ${sportKey}: Elo laskettu ${map.size} joukkueelle`);
      }
    } catch (err) {
      // Elo on lisätieto, ei ehto analyysille — putki jatkaa ilman sitä
      console.warn(`[Elo] ${sportKey}: Elo-lukuja ei saatu: ${(err as Error).message}`);
    }
  }

  const cards: MatchCard[] = events.map((e) =>
    buildCard(
      e,
      statsByLeague.get(e.sportKey) ?? null,
      newsByMatch.get(matchId(e)) ?? null,
      options,
      eloByLeague.get(e.sportKey) ?? null,
      lowerByLeague.get(e.sportKey) ?? null
    )
  );
  cards.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  // Lähteet nimeltä snapshotiin: käyttäjän pitää voida jäljittää mistä luku tuli
  const providers = ['The Odds API'];
  if (eloByLeague.has(VEIKKAUSLIIGA_KEY)) providers.push('veikkausliigapelit.fi (Elo)');
  if ([...eloByLeague.keys()].some((k) => k !== VEIKKAUSLIIGA_KEY)) providers.push('ESPN (tulokset & Elo)');
  for (const pair of statsByLeague.values()) {
    if (pair && !providers.includes(pair.current.source)) providers.push(pair.current.source);
  }
  if ([...newsByMatch.values()].some((n) => n.news.length)) providers.push('RSS-uutissyötteet');

  return buildSnapshot(cards, 'live', now.toISOString(), providers);
}

/** Sama tunniste kuin tuloshaussa — jaettu funktio, ks. odds-football.ts */
function matchId(e: FootballOddsEvent): string {
  return buildMatchId(e.sportKey, e.kickoff, e.home.name, e.away.name);
}

function buildCard(
  e: FootballOddsEvent,
  stats: LeagueStatsPair | null,
  news: MatchNews | null,
  options: BuildLiveOptions,
  elo: EloLookup | null,
  /** Edellisen kauden alempi sarja nousijan prioria varten (tiketti #68) */
  lowerSeason: import("../types-football.js").LeagueSeasonStats | null = null
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

  // Nousijan priori haetaan alemmasta sarjasta; null -> keskiverto nousija
  const promotedFor = (name: string) => (lowerSeason ? promotedStrengthFrom(name, lowerSeason) ?? undefined : undefined);
  const home = strengthForTeam(e.home.name, stats.current, stats.previous, config.model.shrinkageK, promotedFor(e.home.name));
  const away = strengthForTeam(e.away.name, stats.current, stats.previous, config.model.shrinkageK, promotedFor(e.away.name));

  // Täsmäytys epäonnistui → näkyvä varoitus, ei hiljainen degradaatio
  if (!home || !away) {
    const missing = [!home && e.home.name, !away && e.away.name].filter(Boolean).join(', ');
    console.warn(`[Stats] ${e.home.name} vs ${e.away.name}: joukkuetta ei löytynyt tilastoista (${missing}) — market-only`);
    return buildMatchCard({ ...base, poisson: null, stats: null });
  }

  const league: LeagueAverages = { homeGoals: stats.current.homeGoalsAvg, awayGoals: stats.current.awayGoalsAvg };
  let poisson = predictPoisson(home.strength, away.strength, league, config.model.rho);

  // Tiketti #93: jaakiekossa Poisson aliarvioi tasapelit 5 prosenttiyksikkoa.
  // Syy on rakenteellinen: varsinainen peliaika paattyy 60 minuuttiin ja
  // tasatilanne on stabiili paatepiste, jota riippumattomuusoletus ei tunne.
  // Korjaus koskee VAIN 1X2-jakaumaa; maalimaaraennusteet jaavat puhtaaksi
  // Poissoniksi koska niille ei ole vastaavaa mitattua poikkeamaa.
  if (sportOf(e.sportKey) === 'hockey') {
    poisson = { ...poisson, probs: applyDrawBoost(poisson.probs) };
  }

  // Puolustus syvyydessä: λ = 0 tarkoittaa "tämä joukkue ei tee maalia
  // varmuudella", mikä ei ole ennuste vaan laskentavirhe. Se tuottaa btts = 0
  // ja toispuoleisen voiton todennäköisyydeksi 0, ja niistä syntyy valtavia
  // valheellisia edgejä. Juurisyy on korjattu shrinkLeagueAverages():ssa,
  // mutta jos λ silti päätyy kelvottomaksi, market-only on ainoa rehellinen tila.
  if (!isUsableLambda(poisson.lambdaHome) || !isUsableLambda(poisson.lambdaAway)) {
    console.warn(
      `[Malli] ${e.home.name} vs ${e.away.name}: kelvoton λ (${poisson.lambdaHome} / ${poisson.lambdaAway}) — market-only`
    );
    return buildMatchCard({ ...base, poisson: null, stats: null });
  }

  const matchStats: MatchStats = {
    home: toTeamStats(home.stats, true, elo),
    away: toTeamStats(away.stats, false, elo),
    h2h: [], // otteluhistoria vaatii tulosdatan; ei vielä lähdettä Veikkausliigalle
  };

  // Mallin peruste näkyviin: käyttäjän pitää tietää nojaako luku tähän vai
  // viime kauteen, koska se muuttaa kuinka paljon siihen voi luottaa
  // Blend-paino skaalataan sen mukaan kuinka paljon dataa mallin takana on.
  // Kiinteä paino antoi kauden avauskierroksella regressoidulle viime kaudelle
  // saman painon kuin täydelle kaudelle dataa — ks. strength.ts:modelConfidence.
  const confidence = matchConfidence(home, away);
  const effectiveBlendWeight = config.model.blendWeight * confidence;

  const adjustments: ModelAdjustment[] = [
    {
      reason:
        `Voimat: ${basisLabel(home.basis)} (${e.home.short}, ${home.playedThisSeason} ottelua) / ` +
        `${basisLabel(away.basis)} (${e.away.short}, ${away.playedThisSeason} ottelua)` +
        `${stats.current.splitsEstimated ? ' · koti/vierasjakauma estimoitu' : ''}`,
    },
    {
      reason:
        `Mallin luottamus ${(confidence * 100).toFixed(0)} % → paino markkinaa vastaan ` +
        `${(effectiveBlendWeight * 100).toFixed(0)} % (täysi ${(config.model.blendWeight * 100).toFixed(0)} %). ` +
        (confidence < 0.35
          ? 'Vähän dataa — arvio nojaa markkinaan.'
          : confidence < 0.7
            ? 'Kohtalaisesti dataa.'
            : 'Kausidataa riittävästi.'),
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

  return buildMatchCard({
    ...base,
    poisson,
    stats: matchStats,
    adjustments,
    blendWeight: effectiveBlendWeight,
    homeStrength: { attack: round(home.strength.attack, 2), defense: round(home.strength.defense, 2) },
    awayStrength: { attack: round(away.strength.attack, 2), defense: round(away.strength.defense, 2) },
  });
}

/**
 * Kelvollinen λ. Alarajaksi 0.05 eikä 0, koska mielivaltaisen pieni λ on yhtä
 * epäuskottava kuin nolla: 0.001 maalin odotusarvo väittää käytännössä samaa.
 * Yläraja 8 suojaa vastakkaiselta virheeltä (rikkinäinen sarjataulukko → valtava
 * keskiarvo), jonka jälkeen jokainen ottelu näyttäisi runsasmaaliselta.
 */
export function isUsableLambda(lambda: number): boolean {
  return Number.isFinite(lambda) && lambda >= 0.05 && lambda <= 8;
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
