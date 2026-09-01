// Tiketti #93: Jääkiekon tasapelikorjaus
//
// MITATTU ONGELMA: Poisson aliarvioi jääkiekon tasapelit järjestelmällisesti.
// Kauden 2026 datalla (480 ottelua, 16 joukkuetta, kaikki 240 paria):
//
//   malli   16.7 %
//   toteuma 21.7 %
//   aliarvio 5.0 prosenttiyksikköä
//
// Viisi prosenttiyksikköä ei ole pyöristysvirhe. Se tarkoittaa että malli
// jakaa liikaa massaa koti- ja vierasvoitoille, ja tuottaa siis
// järjestelmällisesti valheellisia edgejä niihin — ja jättää tasapelien
// ylikertoimet huomaamatta. Sama vikaluokka kuin λ_away = 0 (#48): malli
// näyttää toimivalta mutta on väärässä yhteen suuntaan aina.
//
// MIKSI DIXON–COLES EI RIITÄ. Sen τ-korjaus koskee vain tuloksia joissa
// molemmat tekivät korkeintaan yhden maalin (0-0, 1-0, 0-1, 1-1). Jalkapallossa
// ne ovat suuri osa otteluista; jääkiekossa λ ≈ 2.9/2.5, joten niitä ei
// käytännössä ole. Mitattuna: ρ = −0.2 (hakuvälin ääripää) nostaa tasapelin
// vain 18.2 %:iin — yhä 3.5 pistettä vajaa, ja arvo olisi ääriarvo.
//
// MIKSI POISSON EPÄONNISTUU TÄSSÄ. Se olettaa maalit riippumattomiksi. Kiekossa
// ne eivät ole: johtava joukkue suojaa tulosta, jäljessä oleva ottaa riskejä ja
// nostaa maalivahdin, ja ennen kaikkea VARSINAINEN PELIAIKA PÄÄTTYY 60
// MINUUTTIIN — tasatilanne on stabiili päätepiste, ei välivaihe. Poisson ei
// tunne kelloa.
//
// KORJAUS: kerroin tasapelin todennäköisyydelle, loput normalisoidaan
// suhteellisesti. Kerroin on KALIBROITU eikä arvattu (ks. calibrateDrawBoost).
//
// RAJAUS SANOTAAN: korjaus koskee VAIN 1X2-jakaumaa. Yli/alle- ja
// tarkkatulosennusteet jäävät puhtaaksi Poissoniksi, koska maalimäärän
// jakauma ei riipu siitä miten voitto jakautuu — ja koska niille ei ole
// vastaavaa mitattua poikkeamaa. Korjaus jota ei ole mitattu on arvaus.

import { SideProbs } from '../types-football.js';

/**
 * Tasapelikerroin.
 *
 * MITATTU, EI ARVATTU. calibrateDrawBoost() ajettuna kauden 2026 Liigan 480
 * ottelua vasten:
 *
 *   kerroin  Brier      mallin tasapeli-%
 *   1.00     0.59758    16.7 %   (ei korjausta)
 *   1.20     0.59456    20.0 %
 *   1.25     0.59436    20.8 %   <- optimi
 *   1.30     0.59437    21.7 %   (osuu toteumaan tarkalleen)
 *   1.50     0.59664    25.0 %
 *
 * Optimi loytyi hakuvalin SISALTA, ei reunalta, ja otos on 480 -- kaikki
 * kolme ehtoa jotka blend-painon saadolle asetettiin tiketissa #86.
 *
 * Huomaa etta Brier-optimi (1.25) on hieman ALLE sen arvon joka osuisi
 * toteutuneeseen tasapeliosuuteen tarkalleen (1.30). Se on odotettua: Brier
 * palkitsee myos teravyydesta, joten se vetaa kohti vahaisempaa
 * tasoitusta. Optimoimme ennusteen laatua emmekä yhden tunnusluvun osumaa.
 *
 * Arvo 1.0 tarkoittaa ettei korjausta tehda lainkaan.
 */
export const DRAW_BOOST = 1.25;

/**
 * Korota tasapelin todennäköisyyttä ja normalisoi loput.
 *
 * Koti- ja vierasvoitto pienenevät SUHTEELLISESTI, eli niiden keskinäinen
 * suhde säilyy. Se on olennaista: korjaus koskee tasapelin osuutta, eikä
 * sillä ole mitään sanottavaa siitä kumpi joukkue on parempi.
 */
export function applyDrawBoost(probs: SideProbs, boost = DRAW_BOOST): SideProbs {
  if (!(boost > 0) || !Number.isFinite(boost)) return probs;

  const draw = probs.draw * boost;
  const rest = probs.home + probs.away;

  // Rappeutunut syöte: jos tasapeli veisi kaiken, palautetaan alkuperäinen
  // ennemmin kuin tuotetaan nollia
  if (!(rest > 0) || draw >= 1) return probs;

  const scale = (1 - draw) / rest;
  return {
    home: probs.home * scale,
    draw,
    away: probs.away * scale,
  };
}

export interface DrawSample {
  /** Mallin korjaamaton 1X2-jakauma */
  probs: SideProbs;
  /** Toteutunut lopputulos varsinaisella peliajalla */
  actual: 'home' | 'draw' | 'away';
}

export interface BoostCandidate {
  boost: number;
  brier: number;
  /** Mallin keskimääräinen tasapelitodennäköisyys tällä kertoimella */
  drawRate: number;
}

/** Moniluokkainen Brier — sama kaava kuin analyze/scoring.ts */
function brierOne(probs: SideProbs, actual: 'home' | 'draw' | 'away'): number {
  return (['home', 'draw', 'away'] as const).reduce(
    (sum, side) => sum + (probs[side] - (side === actual ? 1 : 0)) ** 2,
    0
  );
}

/**
 * Etsi Brier-scoren minimoiva tasapelikerroin.
 *
 * Sama menetelmä kuin blend-painon (#71/#86) ja rho:n kalibroinnissa: kokeile
 * arvoja, valitse toteutuneita tuloksia vasten paras. Reunalla oleva optimi
 * liputetaan samasta syystä kuin siellä — se tarkoittaa että paras arvo on
 * hakuvälin ulkopuolella tai ettei data erota arvoja.
 */
export function calibrateDrawBoost(
  samples: DrawSample[],
  range = { min: 1.0, max: 2.0, step: 0.05 }
): { best: BoostCandidate | null; candidates: BoostCandidate[]; atBoundary: boolean; sampleSize: number } {
  const candidates: BoostCandidate[] = [];

  for (let b = range.min; b <= range.max + 1e-9; b += range.step) {
    const boost = Math.round(b * 100) / 100;
    let brier = 0;
    let drawSum = 0;

    for (const s of samples) {
      const adjusted = applyDrawBoost(s.probs, boost);
      brier += brierOne(adjusted, s.actual);
      drawSum += adjusted.draw;
    }

    if (samples.length) {
      candidates.push({
        boost,
        brier: brier / samples.length,
        drawRate: drawSum / samples.length,
      });
    }
  }

  const best = candidates.length ? candidates.reduce((a, c) => (c.brier < a.brier ? c : a)) : null;
  const atBoundary = Boolean(
    best && candidates.length > 1 && (best === candidates[0] || best === candidates[candidates.length - 1])
  );

  return { best, candidates, atBoundary, sampleSize: samples.length };
}
