// Tiketti #23: Snapshotin kokoaminen, validointi ja julkaisu
//
// Tämä on ainoa paikka jossa today.json syntyy. GitHub Pages on staattinen, joten
// selain ei voi hakea kertoimia itse: API-avain paljastuisi, CORS estäisi ja
// kuukausikvootta palaisi jokaisella sivulatauksella. Node-putki laskee kaiken
// valmiiksi, kirjoittaa tiedoston, ja selain vain renderöi sen.

import { buildTotalsView } from './totals-analysis.js';
import { scoreMatrix, DEFAULT_RHO } from '../analyze/poisson.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { removeMargin } from '../analyze/margin.js';
import { consensusProbs, sharpAnchor, blendProbs, DEFAULT_BLEND_WEIGHT } from '../analyze/consensus.js';
import { PoissonPrediction } from '../analyze/poisson.js';
import { kellyStake, edgeOf, KellyOptions } from '../engine/kelly.js';
import {
  SCHEMA_VERSION,
  Snapshot,
  MatchCard,
  BookmakerOdds,
  BestOddsRow,
  MarketView,
  ModelView,
  AnalysisView,
  EdgeRow,
  MarketSide,
  ModelAdjustment,
  MatchStats,
  NewsItem,
  TeamRef,
  SnapshotSource,
  ValueFlagLevel,
  TeamStrengthView,
} from '../types-football.js';

export const VALUE_THRESHOLD = 0.03;
export const STRONG_THRESHOLD = 0.05;

/**
 * Kerroin komission jälkeen. Pörssissä komissio veloitetaan vain voitosta,
 * eli panos palautuu kokonaan mutta voitto-osasta lähtee osuus pois.
 */
export function effectiveOdds(odds: number, commission = 0): number {
  if (!(odds > 1)) return odds;
  const c = Math.min(Math.max(commission, 0), 1);
  return 1 + (odds - 1) * (1 - c);
}

/**
 * Paras kerroin per kohde kaikkien toimistojen yli — tässä oikea edge asuu.
 *
 * Vertailu tehdään komission jälkeisellä hinnalla. Muuten Betfairin 9.60 voittaisi
 * aina kirjan 9.00:n, vaikka 5 %:n komission jälkeen se on todellisuudessa 9.17
 * — ja jos ero olisi pienempi, valittaisiin systemaattisesti väärä toimisto.
 */
export function bestOdds(rows: BookmakerOdds[]): BestOddsRow {
  const best: BestOddsRow = {
    home: 0,
    draw: 0,
    away: 0,
    home_effective: 0,
    draw_effective: 0,
    away_effective: 0,
    home_book: null,
    draw_book: null,
    away_book: null,
  };

  for (const r of rows) {
    for (const side of ['home', 'draw', 'away'] as const) {
      const eff = effectiveOdds(r[side], r.commission);
      if (eff > best[`${side}_effective`]) {
        best[side] = r[side];
        best[`${side}_effective`] = eff;
        best[`${side}_book`] = r.bookmaker;
      }
    }
  }

  return best;
}

/** Markkinanäkymä: kate, konsensus ja sharp-ankkuri */
export function buildMarketView(rows: BookmakerOdds[]): MarketView {
  const best = bestOdds(rows);
  const anchor = sharpAnchor(rows);
  const consensus = consensusProbs(rows);

  // Kate lasketaan parhaista kertoimista komission jälkeen — se on se kate jonka
  // käyttäjä tosiasiassa maksaa kun hän shoppailee jokaisen kohteen parhaalta
  // toimistolta ja pörssin komissio on huomioitu.
  const margin = rows.length
    ? removeMargin(best.home_effective, best.draw_effective, best.away_effective).margin
    : 0;

  return {
    margin,
    implied: consensus ?? { home: 0, draw: 0, away: 0 },
    sharp: anchor?.probs ?? null,
    sharp_source: anchor?.source ?? null,
  };
}

/**
 * Mallinäkymä: Poisson + blendi markkinaan.
 *
 * Kun `poisson` on null (sarjalle ei ole ilmaista tilastolähdettä), malli on
 * pelkkä markkina-ankkuri. Se ei tuota omaa näkemystä 1X2-suunnasta, mutta
 * edge syntyy silti hintavertailusta: sharp-devig kertoo reilun hinnan ja
 * paras kerroin toimistojen yli kertoo mitä siitä maksetaan.
 */
export function buildModelView(
  poisson: PoissonPrediction | null,
  sharp: MarketView['sharp'],
  adjustments: ModelAdjustment[] = [],
  blendWeight: number = DEFAULT_BLEND_WEIGHT,
  homeStrength: TeamStrengthView | null = null,
  awayStrength: TeamStrengthView | null = null
): ModelView {
  if (!poisson) {
    if (!sharp) throw new Error('buildModelView: tarvitaan vähintään Poisson-ennuste tai markkina-ankkuri');
    return {
      method: 'market-only',
      lambda_home: null,
      lambda_away: null,
      probs: roundProbs(sharp),
      poisson_probs: null,
      blend_weight: 0,
      over25: null,
      btts: null,
      top_scores: [],
      adjustments,
      home_strength: null,
      away_strength: null,
    };
  }

  return {
    method: sharp ? 'poisson+sharp-blend' : 'poisson',
    lambda_home: round(poisson.lambdaHome, 3),
    lambda_away: round(poisson.lambdaAway, 3),
    probs: roundProbs(blendProbs(poisson.probs, sharp, blendWeight)),
    poisson_probs: roundProbs(poisson.probs),
    blend_weight: sharp ? blendWeight : 1,
    over25: round(poisson.over25, 4),
    btts: round(poisson.btts, 4),
    top_scores: poisson.topScores.map((s) => ({ score: s.score, p: round(s.p, 4) })),
    adjustments,
    home_strength: homeStrength,
    away_strength: awayStrength,
  };
}

/**
 * Pienin todennäköisyysero jonka mallin on voitettava markkina, prosenttiyksikköinä.
 *
 * MIKSI PELKKÄ EDGE-KYNNYS EI RIITÄ:
 * Devigatulle markkinalle pätee likimain p_markkina × kerroin = 1, joten
 *
 *     edge = p_malli × kerroin − 1 ≈ (p_malli − p_markkina) × kerroin
 *
 * Sama 3 %:n edge tarkoittaa siis eri suuruista todennäköisyysväitettä eri
 * kertoimilla: kertoimella 2.0 se vaatii 1.5 prosenttiyksikön eron, mutta
 * kertoimella 20.0 vain 0.15 prosenttiyksikköä. Kynnys on kymmenen kertaa
 * löysempi juuri siellä missä malli on epäluotettavin — pitkässä hännässä.
 *
 * Tämä tuotti aidot väärät positiiviset 22.8.2026: Hull City "edge +292 %"
 * ja Coventry "+75 %" syntyivät 2–3 prosenttiyksikön eroista, jotka kerroin
 * suurensi järjettömiksi luvuiksi.
 *
 * 2 prosenttiyksikköä on suora vaatimus: malli saa liputtaa vain jos se
 * oikeasti väittää tietävänsä jotain, ei siksi että kerroin on iso.
 */
export const MIN_PROB_EDGE = 0.02;

/**
 * Value-lippu. Vaatii SEKÄ riittävän edgen ETTÄ riittävän
 * todennäköisyyseron — ks. MIN_PROB_EDGE.
 */
function flagFor(edge: number, probEdge: number): ValueFlagLevel {
  if (probEdge < MIN_PROB_EDGE) return 'none';
  if (edge > STRONG_THRESHOLD) return 'strong';
  if (edge > VALUE_THRESHOLD) return 'candidate';
  return 'none';
}

/**
 * Analyysinäkymä: edge ja Kelly-panos jokaiselle 1X2-kohteelle.
 * Edge lasketaan PARHAAN kertoimen mukaan, ei keskiarvon — juuri siltä
 * toimistolta veto myös lyötäisiin.
 */
export function buildAnalysisView(
  model: ModelView,
  market: MarketView,
  best: BestOddsRow,
  bankroll: number,
  newsWindow = false,
  kellyOptions: Partial<KellyOptions> = {}
): AnalysisView {
  const sides: Array<{ side: MarketSide; odds: number; effective: number; book: string | null; model_prob: number; implied_prob: number }> = [
    { side: 'home', odds: best.home, effective: best.home_effective, book: best.home_book, model_prob: model.probs.home, implied_prob: market.implied.home },
    { side: 'draw', odds: best.draw, effective: best.draw_effective, book: best.draw_book, model_prob: model.probs.draw, implied_prob: market.implied.draw },
    { side: 'away', odds: best.away, effective: best.away_effective, book: best.away_book, model_prob: model.probs.away, implied_prob: market.implied.away },
  ];

  const edges: EdgeRow[] = sides.map((s) => {
    // Edge ja Kelly komission jälkeisestä hinnasta — se on se mitä veto todella maksaa
    const edge = s.effective > 0 ? edgeOf(s.model_prob, s.effective) : -1;
    // Kuinka monta prosenttiyksikköä malli väittää markkinan olevan väärässä.
    // Tämä on se väite jonka pitää olla riittävän suuri — ei edge, joka on
    // sama väite kertoimella kerrottuna (ks. MIN_PROB_EDGE).
    const probEdge = s.model_prob - s.implied_prob;
    const flag = flagFor(edge, probEdge);
    // Panossuositus vain liputetuille kohteille. Kelly antaisi positiivisen
    // panoksen heti kun edge > 0, mutta alle kynnyksen jäävä ero on mallin
    // virherajojen sisällä — panossuositus siitä olisi valheellista
    // tarkkuutta. Lippu ja panos pysyvät näin samaa mieltä.
    const kelly =
      flag !== 'none'
        ? kellyStake(s.model_prob, s.effective, bankroll, kellyOptions)
        : { full_fraction: 0, fraction: 0, stake: 0, capped: false };
    return {
      side: s.side,
      odds: s.odds,
      odds_effective: round(s.effective, 4),
      book: s.book,
      model_prob: round(s.model_prob, 4),
      implied_prob: round(s.implied_prob, 4),
      edge: round(edge, 4),
      flag,
      kelly_fraction: round(kelly.fraction, 4),
      stake_suggestion: kelly.stake,
    };
  });

  return { edges, news_window: newsWindow, bankroll_basis: bankroll };
}

export interface BuildMatchCardInput {
  id: string;
  league: string;
  kickoff: string;
  home: TeamRef;
  away: TeamRef;
  odds: BookmakerOdds[];
  /** null → malli on pelkkä markkina-ankkuri (ks. buildModelView) */
  poisson: PoissonPrediction | null;
  /** null → sarjalle ei ole ilmaista tilastolähdettä */
  stats: MatchStats | null;
  news?: NewsItem[];
  adjustments?: ModelAdjustment[];
  bankroll?: number;
  blendWeight?: number;
  newsWindow?: boolean;
  /** Yli/alle-kertoimet toimistoilta (tiketti #94); tyhjä on normaali tila */
  totals?: import('../ingest/odds-football.js').TotalsOdds[];
  /** Sama voima jolla λ laskettiin — kulkee mukaan joukkuetaulukon vertailua varten (tiketti #45) */
  homeStrength?: TeamStrengthView | null;
  awayStrength?: TeamStrengthView | null;
}

/** Kokoa yksi ottelukortti. Vaiheen B ingestio kutsuu tätä per ottelu. */
export function buildMatchCard(input: BuildMatchCardInput): MatchCard {
  const best = bestOdds(input.odds);
  const market = buildMarketView(input.odds);
  const model = buildModelView(
    input.poisson,
    market.sharp,
    input.adjustments ?? [],
    input.blendWeight,
    input.homeStrength ?? null,
    input.awayStrength ?? null
  );
  const analysis = buildAnalysisView(model, market, best, input.bankroll ?? 100, input.newsWindow ?? false);

  // Yli/alle: lasketaan vain jos markkina haettiin JA malli on olemassa.
  // Ilman mallia kertoimet nakyvat mutta edgeja ei lasketa -- puolikas
  // vertailu olisi harhaanjohtava.
  //
  // Matriisi lasketaan lambdasta uudelleen eika kanneta ennusteen mukana:
  // se on 2D-taulukko joka paatyisi turhaan today.json:iin ja kasvattaisi
  // snapshotin kokoa jokaisella ottelulla.
  //
  // HUOM: jaakiekon tasapelikorjaus (#93) EI vaikuta tahan. Se muuttaa vain
  // 1X2-jakaumaa, ja maalimaaran jakauma on siita riippumaton -- juuri kuten
  // korjauksen rajaus sanoo.
  const totals = input.totals?.length
    ? buildTotalsView(
        input.totals,
        input.poisson ? scoreMatrix(input.poisson.lambdaHome, input.poisson.lambdaAway, DEFAULT_RHO) : null,
        input.bankroll ?? 100
      )
    : undefined;

  return {
    ...(totals ? { totals } : {}),
    id: input.id,
    league: input.league,
    kickoff: input.kickoff,
    home: input.home,
    away: input.away,
    odds: input.odds,
    best,
    market: { ...market, margin: round(market.margin, 4), implied: roundProbs(market.implied), sharp: market.sharp ? roundProbs(market.sharp) : null },
    model,
    analysis,
    stats: input.stats,
    news: input.news ?? [],
  };
}

export function buildSnapshot(
  matches: MatchCard[],
  source: SnapshotSource,
  generatedAt: string,
  providers: string[] = []
): Snapshot {
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: generatedAt,
    sport: 'football',
    source,
    providers,
    leagues: [...new Set(matches.map((m) => m.league))],
    matches,
  };
}

// ─── Validointi ───────────────────────────────────────────────────────────
// Ei skeemakirjastoa: projektissa ei ole zodia eikä sitä kannata lisätä yhden
// tiedostomuodon takia. Tämä tarkistaa juuri ne asiat jotka rikkovat UI:n.

interface SideProbsLike {
  home: number;
  draw: number;
  away: number;
}

export function validateSnapshot(data: unknown): string[] {
  const errors: string[] = [];
  const snap = data as Snapshot;

  if (!snap || typeof snap !== 'object') return ['snapshot ei ole objekti'];
  if (snap.schema_version !== SCHEMA_VERSION) {
    errors.push(`schema_version on ${snap.schema_version}, odotettiin ${SCHEMA_VERSION}`);
  }
  if (snap.sport !== 'football') errors.push(`sport on "${snap.sport}", odotettiin "football"`);
  if (!snap.generated_at || Number.isNaN(Date.parse(snap.generated_at))) {
    errors.push('generated_at puuttuu tai ei ole validi ISO-aika');
  }
  if (!Array.isArray(snap.matches)) return [...errors, 'matches ei ole taulukko'];

  snap.matches.forEach((m, i) => {
    const at = `matches[${i}]`;
    if (!m.id) errors.push(`${at}.id puuttuu`);
    if (!m.home?.name || !m.away?.name) errors.push(`${at}: joukkueen nimi puuttuu`);
    if (!m.kickoff || Number.isNaN(Date.parse(m.kickoff))) errors.push(`${at}.kickoff ei ole validi ISO-aika`);

    if (!Array.isArray(m.odds)) {
      errors.push(`${at}.odds ei ole taulukko`);
    } else {
      m.odds.forEach((o, j) => {
        for (const side of ['home', 'draw', 'away'] as const) {
          if (typeof o[side] !== 'number' || o[side] <= 1) {
            errors.push(`${at}.odds[${j}].${side} = ${o[side]} — kerroin pitää olla > 1`);
          }
        }
        if (!o.bookmaker) errors.push(`${at}.odds[${j}].bookmaker puuttuu`);
      });
    }

    // model.probs ja market.implied ovat pakollisia; poisson_probs vain jos malli on Poisson-pohjainen
    const required: Array<readonly [string, unknown]> = [
      ['model.probs', m.model?.probs],
      ['market.implied', m.market?.implied],
    ];
    if (m.model && m.model.poisson_probs !== null) required.push(['model.poisson_probs', m.model.poisson_probs]);

    for (const [label, value] of required) {
      const probs = value as SideProbsLike | undefined;
      if (!probs) {
        errors.push(`${at}.${label} puuttuu`);
        continue;
      }
      const sum = probs.home + probs.draw + probs.away;
      if (Math.abs(sum - 1) > 0.01) errors.push(`${at}.${label} summa on ${sum.toFixed(4)}, pitäisi olla 1.0`);
    }

    if (m.model?.method === 'market-only' && m.model.poisson_probs !== null) {
      errors.push(`${at}.model: method on "market-only" mutta poisson_probs ei ole null`);
    }

    if (!Array.isArray(m.analysis?.edges) || m.analysis.edges.length !== 3) {
      errors.push(`${at}.analysis.edges pitää sisältää tarkalleen 3 riviä (1X2)`);
    }
    // stats saa olla null (sarjalla ei ilmaista tilastolähdettä), mutta jos se
    // on olemassa, molempien joukkueiden luvut pitää löytyä
    if (m.stats && (!m.stats.home || !m.stats.away)) errors.push(`${at}.stats puuttuu joukkueelta`);
  });

  return errors;
}

// ─── Kirjoitus ────────────────────────────────────────────────────────────

export interface WriteResult {
  todayPath: string;
  historyPath: string;
}

/**
 * Kirjoita snapshot levylle. Validoi ensin — rikkinäistä tiedostoa ei julkaista,
 * koska selain ei osaa siitä valittaa käyttäjälle mitään järkevää.
 */
export function writeSnapshot(snapshot: Snapshot, publicDir: string): WriteResult {
  const errors = validateSnapshot(snapshot);
  if (errors.length) {
    throw new Error(`Snapshot ei läpäise validointia:\n  - ${errors.join('\n  - ')}`);
  }

  const dataDir = path.join(publicDir, 'data');
  const historyDir = path.join(dataDir, 'history');
  if (!existsSync(historyDir)) mkdirSync(historyDir, { recursive: true });

  const json = JSON.stringify(snapshot, null, 2);
  const todayPath = path.join(dataDir, 'today.json');

  // Historiatiedoston nimessä on kellonaika, ei pelkkä päivämäärä.
  //
  // Cron ajaa putken kahdesti vuorokaudessa: aamun avauslinja ja iltapäivän
  // sulkeutumislinja. Jos nimi olisi pelkkä päivämäärä, toinen ajo ylikirjoittaisi
  // ensimmäisen ja avauskerroin katoaisi — juuri se luku jota CLV-mittari
  // (tiketti 33) tarvitsee. Menetettyä linjaa ei voi hakea jälkikäteen.
  //
  // "2026-08-14T15:58:27.727Z" → "2026-08-14T1558Z"
  const stamp = `${snapshot.generated_at.slice(0, 16).replace(':', '')}Z`;
  const historyPath = path.join(historyDir, `${stamp}.json`);

  writeFileSync(todayPath, json, 'utf8');
  writeFileSync(historyPath, json, 'utf8');

  return { todayPath, historyPath };
}

function round(n: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function roundProbs<T extends { home: number; draw: number; away: number }>(p: T): T {
  return { ...p, home: round(p.home, 4), draw: round(p.draw, 4), away: round(p.away, 4) };
}
