// Tiketti #28: Kelly-panostuslogiikka
// Kelly kertoo teoreettisen optimipanoksen joka maksimoi kassan pitkän aikavälin
// logaritmisen kasvun. Täysi Kelly on käytännössä liian aggressiivinen: se olettaa
// että model_prob on TÄSMÄLLEEN oikein. Meidän mallissa on virhettä, joten
// käytetään murto-Kellyä (25 %) ja päälle kova katto kassasta.
//
// f* = (b × p − q) / b,  missä b = kerroin − 1, q = 1 − p

import { pathToFileURL } from 'node:url';

export interface KellyOptions {
  /** Murto-Kelly: 0.25 = neljäsosa täydestä Kellystä */
  fraction: number;
  /** Kova katto osuutena kassasta, 0.02 = korkeintaan 2 % per veto */
  cap: number;
}

export const DEFAULT_KELLY: KellyOptions = { fraction: 0.25, cap: 0.02 };

export interface KellyResult {
  /** Täysi Kelly-osuus — informatiivinen, ei suositus */
  full_fraction: number;
  /** Käytetty osuus kassasta murto-Kellyn ja katon jälkeen */
  fraction: number;
  /** Panossuositus euroina, pyöristettynä sentteihin */
  stake: number;
  /** Osuiko katto — kertoo että Kelly halusi enemmän kuin sallitaan */
  capped: boolean;
}

const ZERO: KellyResult = { full_fraction: 0, fraction: 0, stake: 0, capped: false };

/**
 * Laske panossuositus.
 * Palauttaa nollan aina kun vetoa ei pitäisi lyödä: ei-positiivinen edge,
 * kelvoton kerroin, tyhjä kassa tai järjetön todennäköisyys.
 */
export function kellyStake(
  modelProb: number,
  odds: number,
  bankroll: number,
  options: Partial<KellyOptions> = {}
): KellyResult {
  const { fraction, cap } = { ...DEFAULT_KELLY, ...options };

  if (!Number.isFinite(modelProb) || modelProb <= 0 || modelProb >= 1) return ZERO;
  if (!Number.isFinite(odds) || odds <= 1) return ZERO;
  if (!Number.isFinite(bankroll) || bankroll <= 0) return ZERO;

  const b = odds - 1;
  const q = 1 - modelProb;
  const full = (b * modelProb - q) / b;

  // f* <= 0 tarkoittaa ettei kohteessa ole arvoa — älä lyö
  if (full <= 0) return { full_fraction: full, fraction: 0, stake: 0, capped: false };

  const scaled = full * fraction;
  const capped = scaled > cap;
  const applied = Math.min(scaled, cap);

  return {
    full_fraction: full,
    fraction: applied,
    stake: Math.round(bankroll * applied * 100) / 100,
    capped,
  };
}

/**
 * Edge suoraan Kellyn rinnalle — sama kaava kuin value.ts:ssä,
 * tässä mukavuussyistä jotta ottelukortti saa molemmat yhdellä kutsulla.
 */
export function edgeOf(modelProb: number, odds: number): number {
  return modelProb * odds - 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cases: Array<[number, number, string]> = [
    [0.55, 2.0, 'selvä arvo: malli 55 %, kerroin 2.00'],
    [0.50, 2.0, 'nollaedge: malli 50 %, kerroin 2.00'],
    [0.45, 2.0, 'negatiivinen edge'],
    [0.35, 3.50, 'iso kerroin, kohtalainen edge'],
    [0.90, 1.50, 'raskas suosikki — katto osuu'],
  ];
  const bankroll = 100;
  console.log(`Kassa ${bankroll} €, murto-Kelly ${DEFAULT_KELLY.fraction}, katto ${DEFAULT_KELLY.cap * 100} %\n`);
  for (const [p, odds, label] of cases) {
    const r = kellyStake(p, odds, bankroll);
    const edge = edgeOf(p, odds);
    console.log(
      `${label}\n  edge ${(edge * 100).toFixed(1)} % | täysi Kelly ${(r.full_fraction * 100).toFixed(1)} % → panos ${r.stake.toFixed(2)} €${r.capped ? ' (KATTO)' : ''}`
    );
  }
}
