// Tiketti #94: Yli/alle-kertoimien analyysi
//
// Malli on laskenut maalimäärän todennäköisyyttä alusta asti (`over25`,
// tiketti #26), mutta sillä ei ole ollut mitään mihin verrata: markkinaa ei
// haettu. Luku on siis ollut näyttötietoa eikä signaali — edgeä ei voi laskea
// yhdestä puolikkaasta.
//
// Nyt `totals`-markkina haetaan, ja tämä moduuli tekee sille saman mitä
// buildAnalysisView tekee 1X2:lle: marginaalin poisto, edge parhaasta
// hinnasta, kynnykset ja Kelly-panos.
//
// KAKSI ASIAA JOTKA PITÄÄ TEHDÄ OIKEIN:
//
//   1. MALLIA VERRATAAN TOIMISTON OMAAN RAJAAN. Raja vaihtelee: jalkapallossa
//      yleensä 2.5, jääkiekossa 5.5, mutta toimisto voi tarjota 2.25 tai 6.0,
//      ja eri toimistot eri rajoja samasta ottelusta. Kiinteään 2.5:een
//      vertaaminen laskisi edgen kahdesta eri asiasta — luku näyttäisi
//      oikealta ja olisi merkityksetön.
//
//   2. MARGINAALI POISTETAAN PARILTA, EI YKSITTÄISELTÄ HINNALTA. Yli ja alle
//      ovat saman markkinan kaksi puolta; implisiittinen todennäköisyys
//      lasketaan niiden summasta. Yksipuolinen rivi hylätään jo jäsentimessä.

import { TotalsOdds } from '../ingest/odds-football.js';
import { overProb } from '../analyze/poisson.js';
import { kellyStake, KellyOptions } from '../engine/kelly.js';
import { ValueFlagLevel } from '../types-football.js';
import { STRONG_THRESHOLD, VALUE_THRESHOLD, MIN_PROB_EDGE } from './snapshot.js';

export interface TotalsEdgeRow {
  line: number;
  side: 'over' | 'under';
  odds: number;
  odds_effective: number;
  book: string | null;
  link: string | null;
  model_prob: number;
  implied_prob: number;
  edge: number;
  flag: ValueFlagLevel;
  kelly_fraction: number;
  stake_suggestion: number;
}

export interface TotalsView {
  /** Toimistokohtaiset rivit näytettäväksi, rajan mukaan järjestettynä */
  books: TotalsOdds[];
  /** Paras hinta per raja ja puoli, edgeineen */
  edges: TotalsEdgeRow[];
}

/** Sama kynnyslogiikka kuin 1X2:lla — kaksi ehtoa, ei yksi */
function flagFor(edge: number, probEdge: number): ValueFlagLevel {
  if (probEdge < MIN_PROB_EDGE) return 'none';
  if (edge > STRONG_THRESHOLD) return 'strong';
  if (edge > VALUE_THRESHOLD) return 'candidate';
  return 'none';
}

function round(n: number, d: number): number {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

/** Komission jälkeen jäävä kerroin — se mitä veto oikeasti maksaa */
function effective(odds: number, commission: number): number {
  return commission > 0 ? 1 + (odds - 1) * (1 - commission) : odds;
}

/**
 * Marginaalin poisto yli/alle-parilta.
 *
 * Summa 1/yli + 1/alle on yli 1 katteen verran; jaetaan sillä, jolloin
 * todennäköisyydet summautuvat ykköseen. Sama kaava kuin 1X2:lla (tiketti #6),
 * vain kaksi kohdetta kolmen sijaan.
 */
export function devigPair(over: number, under: number): { over: number; under: number } | null {
  if (!(over > 1) || !(under > 1)) return null;
  const sum = 1 / over + 1 / under;
  if (!(sum > 0)) return null;
  return { over: 1 / over / sum, under: 1 / under / sum };
}

/**
 * Analysoi yli/alle-markkina.
 *
 * `matrix` on Poissonin tulosmatriisi; siitä lasketaan todennäköisyys
 * jokaiselle toimiston tarjoamalle rajalle erikseen.
 *
 * Palauttaa tyhjän näkymän jos kertoimia tai mallia ei ole — se on normaali
 * tila eikä virhe.
 */
export function buildTotalsView(
  totals: TotalsOdds[],
  matrix: number[][] | null,
  bankroll: number,
  kellyOptions: Partial<KellyOptions> = {}
): TotalsView {
  if (!totals.length || !matrix?.length) return { books: totals, edges: [] };

  // Paras hinta per raja ja puoli. Vertailu tehdään KOMISSION JÄLKEEN,
  // koska pörssin nimellinen kerroin ei ole se mitä veto tuottaa.
  const best = new Map<number, { over?: TotalsOdds; under?: TotalsOdds }>();
  for (const row of totals) {
    const slot = best.get(row.line) ?? {};
    if (!slot.over || effective(row.over, row.commission) > effective(slot.over.over, slot.over.commission)) {
      slot.over = row;
    }
    if (!slot.under || effective(row.under, row.commission) > effective(slot.under.under, slot.under.commission)) {
      slot.under = row;
    }
    best.set(row.line, slot);
  }

  const edges: TotalsEdgeRow[] = [];

  for (const [line, slot] of [...best.entries()].sort((a, b) => a[0] - b[0])) {
    if (!slot.over || !slot.under) continue;

    // Malli TÄLLE rajalle — ei kiinteälle 2.5:lle
    const modelOver = overProb(matrix, line);
    const modelUnder = 1 - modelOver;

    // Implisiittiset lasketaan SAMAN toimiston parilta jos mahdollista,
    // muuten parhaista hinnoista: marginaali kuuluu markkinalle, ei riville
    const implied = devigPair(slot.over.over, slot.under.under);
    if (!implied) continue;

    for (const side of ['over', 'under'] as const) {
      const row = side === 'over' ? slot.over : slot.under;
      const odds = side === 'over' ? row.over : row.under;
      const eff = effective(odds, row.commission);
      const modelProb = side === 'over' ? modelOver : modelUnder;
      const impliedProb = implied[side];

      const edge = eff > 0 ? modelProb * eff - 1 : -1;
      const probEdge = modelProb - impliedProb;
      const flag = flagFor(edge, probEdge);

      const kelly =
        flag !== 'none'
          ? kellyStake(modelProb, eff, bankroll, kellyOptions)
          : { full_fraction: 0, fraction: 0, stake: 0, capped: false };

      edges.push({
        line,
        side,
        odds,
        odds_effective: round(eff, 4),
        book: row.bookmaker,
        link: row.link,
        model_prob: round(modelProb, 4),
        implied_prob: round(impliedProb, 4),
        edge: round(edge, 4),
        flag,
        kelly_fraction: round(kelly.fraction, 4),
        stake_suggestion: kelly.stake,
      });
    }
  }

  return { books: totals, edges };
}
