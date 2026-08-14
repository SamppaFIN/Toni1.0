// Tiketti #27: Markkinakonsensus + sharp-ankkuri + blend
//
// Rehellinen lähtökohta: markkina on hyvä. Pinnacle hinnoittelee jalkapalloa
// tarkemmin kuin 10 ottelun Poisson-malli koskaan tekee, koska sen hintaan on
// puskettu satoja miljoonia euroja informaatiota. Siksi mallin todennäköisyys
// on BLENDI: oma malli antaa oman äänen, markkina antaa ankkurin.
//
//   model_prob = w × poisson + (1 − w) × sharp,   w ≈ 0.35
//
// w on se yksi numero jota kalibroidaan toteutuneita tuloksia vasten (Brier score).
// w = 1.0 → luotetaan pelkkään omaan malliin (todennäköisesti häviää markkinalle)
// w = 0.0 → seurataan markkinaa (ei koskaan löydä edgeä, mutta ei myöskään hävitä)

import { pathToFileURL } from 'node:url';
import { removeMargin } from './margin.js';
import { BookmakerOdds, SideProbs } from '../types-football.js';

/** Poissonin paino blendissä. Konservatiivinen oletus — markkina saa enemmistön. */
export const DEFAULT_BLEND_WEIGHT = 0.35;

/**
 * Toimistot tarkkuusjärjestyksessä. Pinnacle ensin: matala kate, korkeat limiitit,
 * ei rajoita voittavia asiakkaita → sen linja on lähimpänä totuutta.
 */
export const SHARP_PRIORITY = ['pinnacle', 'betfair_ex_eu', 'matchbook', 'smarkets'];

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Markkinakonsensus: devigataan jokainen toimisto erikseen ja otetaan mediaani.
 *
 * Mediaani per toimisto EIKÄ mediaanikertoimen devigaus — järjestys on olennainen.
 * Jokaisella toimistolla on oma katteensa; jos ottaisimme ensin mediaanikertoimen
 * ja devigaisimme sen, sekoittaisimme eri katerakenteita keskenään.
 */
export function consensusProbs(rows: BookmakerOdds[]): SideProbs | null {
  if (!rows.length) return null;

  const devigged = rows.map((r) => removeMargin(r.home, r.draw, r.away));
  const raw = {
    home: median(devigged.map((d) => d.home_prob)),
    draw: median(devigged.map((d) => d.draw_prob)),
    away: median(devigged.map((d) => d.away_prob)),
  };

  // Mediaani per kohde ei summaudu tarkalleen ykköseen — normalisoidaan
  const total = raw.home + raw.draw + raw.away;
  if (total <= 0) return null;
  return { home: raw.home / total, draw: raw.draw / total, away: raw.away / total };
}

export interface SharpAnchor {
  probs: SideProbs;
  source: string;
}

/**
 * Sharp-ankkuri: paras saatavilla oleva "totuuden" arvio.
 * Ensisijaisesti SHARP_PRIORITY-listan toimisto, muuten koko markkinan mediaani.
 */
export function sharpAnchor(rows: BookmakerOdds[]): SharpAnchor | null {
  if (!rows.length) return null;

  for (const key of SHARP_PRIORITY) {
    const row = rows.find((r) => r.key.toLowerCase().startsWith(key));
    if (row) {
      const d = removeMargin(row.home, row.draw, row.away);
      return {
        probs: { home: d.home_prob, draw: d.draw_prob, away: d.away_prob },
        source: row.bookmaker,
      };
    }
  }

  const consensus = consensusProbs(rows);
  if (!consensus) return null;
  return { probs: consensus, source: `mediaani (${rows.length} toimistoa)` };
}

/**
 * Yhdistä oma malli ja markkina-ankkuri.
 * weight = Poissonin paino. Jos ankkuria ei ole, palautetaan malli sellaisenaan.
 */
export function blendProbs(
  poisson: SideProbs,
  sharp: SideProbs | null,
  weight: number = DEFAULT_BLEND_WEIGHT
): SideProbs {
  if (!sharp) return normalize(poisson);

  const w = Math.min(1, Math.max(0, weight));
  return normalize({
    home: w * poisson.home + (1 - w) * sharp.home,
    draw: w * poisson.draw + (1 - w) * sharp.draw,
    away: w * poisson.away + (1 - w) * sharp.away,
  });
}

/** Varmista että todennäköisyydet summautuvat ykköseen */
export function normalize(probs: SideProbs): SideProbs {
  const total = probs.home + probs.draw + probs.away;
  if (total <= 0) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: probs.home / total, draw: probs.draw / total, away: probs.away / total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows: BookmakerOdds[] = [
    { bookmaker: 'Pinnacle', key: 'pinnacle', market: '1X2', home: 2.10, draw: 3.45, away: 3.60, commission: 0, fetched_at: '' },
    { bookmaker: 'Unibet', key: 'unibet_eu', market: '1X2', home: 2.15, draw: 3.40, away: 3.55, commission: 0, fetched_at: '' },
    { bookmaker: 'Betsson', key: 'betsson', market: '1X2', home: 2.05, draw: 3.50, away: 3.50, commission: 0, fetched_at: '' },
  ];
  const anchor = sharpAnchor(rows)!;
  console.log(`Sharp-ankkuri (${anchor.source}):`);
  console.log(`  ${(anchor.probs.home * 100).toFixed(1)}% / ${(anchor.probs.draw * 100).toFixed(1)}% / ${(anchor.probs.away * 100).toFixed(1)}%`);

  const poisson: SideProbs = { home: 0.52, draw: 0.24, away: 0.24 };
  const blended = blendProbs(poisson, anchor.probs);
  console.log(`\nPoisson: ${(poisson.home * 100).toFixed(1)}% / ${(poisson.draw * 100).toFixed(1)}% / ${(poisson.away * 100).toFixed(1)}%`);
  console.log(`Blendi (w=${DEFAULT_BLEND_WEIGHT}): ${(blended.home * 100).toFixed(1)}% / ${(blended.draw * 100).toFixed(1)}% / ${(blended.away * 100).toFixed(1)}%`);
}
