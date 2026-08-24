// Tiketti #33: Mittarien laskenta ja julkaisu
//
// Lukee kaksi asiaa:
//   public/data/history/*.json  — snapshotit ajan yli (2/vrk, cronin tuottamat)
//   public/data/results.json    — oikeat lopputulokset
//
// Tuottaa public/data/metrics.json, jonka UI näyttää.
//
// KESKEINEN PERIAATE: jokainen luku esitetään vertailukohdan kanssa, ja jos
// otos on liian pieni, se sanotaan suoraan. Kolmen ottelun Brier score näyttää
// mittarilta muttei ole mittari — ja siihen luottaminen on pahempaa kuin ei
// mittaria lainkaan.

import { pathToFileURL, fileURLToPath } from 'node:url';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { Snapshot, MatchCard, SideProbs, MarketSide } from '../types-football.js';
import { readResults, MatchResult } from '../ingest/results.js';
import { predictFromLambda, DEFAULT_RHO } from '../analyze/poisson.js';
import {
  Outcome,
  accuracy,
  brierScore,
  logLoss,
  calibration,
  calibrateRho,
  clvFor,
  clvSummary,
  paperRoi,
  calibrateBlendWeight,
  UNIFORM_BRIER,
  MIN_SAMPLE,
  SIDES,
  argmax,
  ClvResult,
  PaperBet,
} from '../analyze/scoring.js';

export interface MetricsFile {
  schema_version: 1;
  generated_at: string;
  /** Montako ottelua on ratkennut ja käytettävissä */
  sample: { predictions: number; results: number; matched: number; sufficient: boolean; minimum: number };
  accuracy: { model: ReturnType<typeof accuracy>; market: ReturnType<typeof accuracy> };
  brier: { model: number | null; market: number | null; uniform: number };
  logLoss: { model: number | null; market: number | null };
  calibration: ReturnType<typeof calibration>;
  clv: { summary: ReturnType<typeof clvSummary>; picks: ClvResult[] };
  paperRoi: ReturnType<typeof paperRoi>;
  blendCalibration: ReturnType<typeof calibrateBlendWeight>;
  /** Dixon–Coles-parametrin kalibrointi toteutuneista tuloksista (tiketti #71) */
  rhoCalibration: ReturnType<typeof calibrateRho>;
  /** Käytössä oleva paino, jotta UI voi verrata suositukseen */
  currentBlendWeight: number;
}

// ─── Historian lukeminen ──────────────────────────────────────────────────

interface HistoryEntry {
  file: string;
  snapshot: Snapshot;
}

export function readHistory(publicDir: string): HistoryEntry[] {
  const dir = path.join(publicDir, 'data', 'history');
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort() // tiedostonimet ovat aikajärjestyksessä (2026-08-14T0800Z.json)
    .map((file) => {
      try {
        return { file, snapshot: JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as Snapshot };
      } catch {
        console.warn(`[Metrics] ${file} on vioittunut — ohitetaan`);
        return null;
      }
    })
    .filter((x): x is HistoryEntry => x !== null);
}

/**
 * Kaksi havaintoa EI viela tee sulkeutumislinjaa (tiketti #72).
 *
 * Cron ajaa 08:00 ja 14:00 UTC, mutta workflow_dispatch voi tuottaa kaksi
 * ajoa parin minuutin valein. Silloin "sulkeutumislinja" on kaksi minuuttia
 * avauksen jalkeen: kerroin ei ole ehtinyt liikkua, ja CLV mittaa kohinaa.
 * Nollan ymparilla heiluva luku nayttaa mittarilta ja on siksi pahempi kuin
 * puuttuva luku.
 */
export const MIN_LINE_GAP_MINUTES = 60;

export interface MatchTimeline {
  matchId: string;
  /** Ensimmäinen havainto — avauslinja */
  opening: MatchCard;
  /** Viimeinen havainto ennen ottelua — sulkeutumislinja */
  closing: MatchCard;
  observations: number;
  /** Avaus- ja sulkeutumishavainnon väli minuutteina */
  spanMinutes: number;
  /** Kuinka kauan ennen aloitusta viimeinen havainto tehtiin (null jos tuntematon) */
  closingLeadMinutes: number | null;
  /** Onko sulkeutumishavainto tarpeeksi erillään avauksesta ollakseen oma linjansa */
  hasClosingLine: boolean;
}

/**
 * Kokoa jokaisen ottelun avaus- ja sulkeutumishavainto.
 *
 * Tämä on syy siihen miksi historiatiedosto nimetään kellonajalla (tiketti 34):
 * jos päivän toinen ajo ylikirjoittaisi ensimmäisen, avauslinja katoaisi eikä
 * CLV:tä voisi laskea lainkaan.
 */
/** Minuutteja havainnosta aloituspotkuun; null jos kumpi tahansa aika on kelvoton */
function leadMinutes(kickoff: string, seenAt: number): number | null {
  const start = Date.parse(kickoff);
  if (!Number.isFinite(start) || !Number.isFinite(seenAt)) return null;
  return (start - seenAt) / 60_000;
}

export function buildTimelines(history: HistoryEntry[]): Map<string, MatchTimeline> {
  const timelines = new Map<string, MatchTimeline>();

  const openedAt = new Map<string, number>();

  for (const entry of history) {
    const seenAt = Date.parse(entry.snapshot.generated_at);
    for (const match of entry.snapshot.matches) {
      const existing = timelines.get(match.id);
      if (!existing) {
        openedAt.set(match.id, seenAt);
        timelines.set(match.id, {
          matchId: match.id,
          opening: match,
          closing: match,
          observations: 1,
          spanMinutes: 0,
          closingLeadMinutes: leadMinutes(match.kickoff, seenAt),
          hasClosingLine: false,
        });
      } else {
        existing.closing = match;
        existing.observations++;
        const start = openedAt.get(match.id);
        // Vioittunut aikaleima -> ei sulkeutumislinjaa. Ei arvausta.
        existing.spanMinutes =
          Number.isFinite(seenAt) && Number.isFinite(start) ? (seenAt - (start as number)) / 60_000 : 0;
        existing.closingLeadMinutes = leadMinutes(match.kickoff, seenAt);
        existing.hasClosingLine = existing.spanMinutes >= MIN_LINE_GAP_MINUTES;
      }
    }
  }

  return timelines;
}

// ─── Mittarien kokoaminen ─────────────────────────────────────────────────

function marketProbs(match: MatchCard): SideProbs | null {
  // Sharp-ankkuri on paras markkina-arvio; ilman sitä konsensus
  return match.market.sharp ?? (match.market.implied.home > 0 ? match.market.implied : null);
}

export function computeMetrics(
  history: HistoryEntry[],
  results: MatchResult[],
  currentBlendWeight: number,
  now = new Date()
): MetricsFile {
  const timelines = buildTimelines(history);
  const resultById = new Map(results.map((r) => [r.match_id, r]));

  // Ennuste = AVAUSHAVAINTO. Sulkeutumislinjaa vasten mittaaminen olisi
  // itsepetosta: silloin malli hyötyisi tiedosta joka syntyi vasta ennusteen
  // jälkeen.
  const outcomes: Outcome[] = [];
  const clvPicks: ClvResult[] = [];
  const paperBets: PaperBet[] = [];
  const blendSamples: Array<{ poisson: SideProbs; market: SideProbs; actual: MarketSide }> = [];
  const rhoSamples: Array<{ lambdaHome: number; lambdaAway: number; actual: MarketSide }> = [];

  for (const timeline of timelines.values()) {
    const result = resultById.get(timeline.matchId);

    // CLV ei tarvitse tulosta — se vertaa hintaa hintaan.
    // Vaatii AIDON sulkeutumislinjan (tiketti #72): kaksi havaintoa parin
    // minuutin valein on sama linja kahdesti, ei liike.
    if (timeline.hasClosingLine) {
      const closingMarket = marketProbs(timeline.closing);
      if (closingMarket) {
        for (const edge of timeline.opening.analysis.edges) {
          if (edge.flag === 'none') continue; // vain liputetut kohteet
          const clv = clvFor({
            matchId: timeline.matchId,
            side: edge.side,
            oddsTaken: edge.odds_effective,
            closingFairProb: closingMarket[edge.side],
          });
          if (clv) clvPicks.push(clv);
        }
      }
    }

    if (!result) continue;

    outcomes.push({
      matchId: timeline.matchId,
      actual: result.outcome,
      model: timeline.opening.model.probs,
      market: marketProbs(timeline.opening),
    });

    // Paperitulos: 1 yksikkö jokaiseen liputettuun kohteeseen avaushinnalla
    for (const edge of timeline.opening.analysis.edges) {
      if (edge.flag === 'none') continue;
      paperBets.push({ matchId: timeline.matchId, side: edge.side, odds: edge.odds_effective, stake: 1 });
    }

    // Blend-painon kalibrointi tarvitsee sekä Poissonin että markkinan erikseen
    const poisson = timeline.opening.model.poisson_probs;
    const market = marketProbs(timeline.opening);
    if (poisson && market) blendSamples.push({ poisson, market, actual: result.outcome });

    // rho-kalibrointi tarvitsee lambdat, ei valmiita todennäköisyyksiä:
    // koko pistejakauma lasketaan uudelleen jokaisella ehdokasarvolla.
    const lh = timeline.opening.model.lambda_home;
    const la = timeline.opening.model.lambda_away;
    if (lh !== null && la !== null && lh > 0 && la > 0) {
      rhoSamples.push({ lambdaHome: lh, lambdaAway: la, actual: result.outcome });
    }
  }

  const actualBySide = new Map([...resultById].map(([id, r]) => [id, r.outcome] as [string, MarketSide]));

  return {
    schema_version: 1,
    generated_at: now.toISOString(),
    sample: {
      predictions: timelines.size,
      results: results.length,
      matched: outcomes.length,
      sufficient: outcomes.length >= MIN_SAMPLE,
      minimum: MIN_SAMPLE,
    },
    accuracy: {
      model: accuracy(outcomes, (o) => o.model),
      market: accuracy(outcomes, (o) => o.market),
    },
    brier: {
      model: brierScore(outcomes, (o) => o.model),
      market: brierScore(outcomes, (o) => o.market),
      uniform: UNIFORM_BRIER,
    },
    logLoss: {
      model: logLoss(outcomes, (o) => o.model),
      market: logLoss(outcomes, (o) => o.market),
    },
    calibration: calibration(outcomes, (o) => o.model),
    clv: { summary: clvSummary(clvPicks), picks: clvPicks },
    paperRoi: paperRoi(paperBets, actualBySide),
    blendCalibration: calibrateBlendWeight(blendSamples),
    rhoCalibration: calibrateRho(rhoSamples, (lh, la, rho) => predictFromLambda(lh, la, rho).probs),
    currentBlendWeight,
  };
}

export function writeMetrics(publicDir: string, metrics: MetricsFile): string {
  const file = path.join(publicDir, 'data', 'metrics.json');
  writeFileSync(file, JSON.stringify(metrics, null, 2), 'utf8');
  return file;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

  const history = readHistory(publicDir);
  const results = readResults(publicDir).results;
  const metrics = computeMetrics(history, results, config.model.blendWeight);
  const timelines = buildTimelines(history);
  const file = writeMetrics(publicDir, metrics);

  console.log(`Historiatiedostoja: ${history.length} · tuloksia: ${results.length}`);
  console.log(`Otteluita seurannassa: ${metrics.sample.predictions} · ratkennut: ${metrics.sample.matched}\n`);

  if (!metrics.sample.sufficient) {
    console.log(`⚠️  Otos on liian pieni (${metrics.sample.matched} < ${MIN_SAMPLE}). Luvut ovat kohinaa.\n`);
  }

  const fmt = (n: number | null, d = 3) => (n === null ? '—' : n.toFixed(d));
  console.log('Osumatarkkuus     malli ' + pctOf(metrics.accuracy.model.rate) + '   markkina ' + pctOf(metrics.accuracy.market.rate));
  console.log(`Brier score       malli ${fmt(metrics.brier.model)}   markkina ${fmt(metrics.brier.market)}   tasajako ${fmt(metrics.brier.uniform)}`);
  console.log(`Log loss          malli ${fmt(metrics.logLoss.model)}   markkina ${fmt(metrics.logLoss.market)}`);

  const clv = metrics.clv.summary;
  console.log(`\nCLV               ${clv.count} valintaa · keskiarvo ${clv.count ? (clv.average * 100 >= 0 ? '+' : '') + (clv.average * 100).toFixed(1) + ' %' : '—'} · voitti linjan ${clv.count ? pctOf(clv.beatRate) : '—'}`);
  // Sano AANEEN jos sulkeutumislinjaa ei ole: tyhja CLV ei tarkoita etta malli
  // ei voita linjaa, vaan ettei linjaa ole viela mitattu (tiketti #72).
  if (!clv.count) {
    const pairs = [...timelines.values()].filter((t) => t.observations > 1).length;
    console.log(
      `                  ei sulkeutumislinjaa: ${pairs} ottelulla 2+ havaintoa, mutta alle ${MIN_LINE_GAP_MINUTES} min välein`
    );
  }

  const roi = metrics.paperRoi;
  console.log(`Paperitulos       ${roi.bets} vetoa · osumia ${roi.wins} · ROI ${roi.bets ? (roi.roi * 100 >= 0 ? '+' : '') + (roi.roi * 100).toFixed(1) + ' %' : '—'}`);

  const cal = metrics.blendCalibration;
  if (cal.best) {
    console.log(`\nBlend-paino       käytössä ${metrics.currentBlendWeight} · data ehdottaa ${cal.best.weight} (Brier ${cal.best.brier.toFixed(3)})`);
    if (!cal.sufficientSample) console.log('                  → otos liian pieni, ÄLÄ muuta painoa tämän perusteella');
    if (cal.atBoundary) console.log('                  → arvo on hakuvälin reunalla, mikä on merkki kohinasta eikä löydöksestä');
  }

  const rho = metrics.rhoCalibration;
  if (rho.best) {
    console.log(
      `Dixon–Coles rho   käytössä ${DEFAULT_RHO} · data ehdottaa ${rho.best.rho} (Brier ${rho.best.brier.toFixed(3)})`
    );
    if (!rho.sufficientSample) console.log('                  → otos liian pieni, ÄLÄ viritä rho:ta tämän perusteella');
    if (rho.atBoundary) console.log('                  → arvo on hakuvälin reunalla, mikä on merkki kohinasta eikä löydöksestä');
  }

  console.log(`\n✓ ${file}`);
}

function pctOf(rate: number): string {
  return `${(rate * 100).toFixed(1)} %`;
}
