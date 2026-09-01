// Tiketti #88: kerroinruudun taustaväri lasketaan RUUDUN OMASTA hinnasta
//
// BUGI JOTA TÄMÄ LUKITSEE: väri piirtyi vain ⭐-ruutuun, koska snapshot laskee
// edgen pelkästä parhaasta hinnasta. Käyttäjä näki 10.00:n värillisenä ja
// saman kohteen 9.80:n mustana — vaikka jos 10.00 on ylikerroin, niin on 9.80
// myös, vain pienemmällä marginaalilla.
//
// Selainmoduulista testataan vain puhdas laskenta; värin päätyminen DOMiin on
// todennettu Playwrightilla (e2e/specs/football-display.spec.ts).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
// (yhdellä rivillä kuten football-display.test.ts:ssä: direktiivi koskee vain
// seuraavaa riviä, ja tsc raportoi virheen moduulipolun kohdalta)
import { cellEdge, edgeBgClass, edgeTextClass, effectiveOdds, EV_CANDIDATE, EV_STRONG, EV_ELITE, MIN_PROB_EDGE } from '../../public/app/football-cards.js';
import {
  VALUE_THRESHOLD,
  STRONG_THRESHOLD,
  MIN_PROB_EDGE as SERVER_MIN_PROB_EDGE,
} from '../publish/snapshot.js';

interface FixtureEdge {
  side: 'home' | 'draw' | 'away';
  odds: number;
  model_prob: number;
  edge: number;
  flag: string;
}

interface FixtureMatch {
  id: string;
  best: Record<string, number | string | null>;
  odds: Array<{ bookmaker: string; home: number; draw: number; away: number; commission: number }>;
  analysis: { edges: FixtureEdge[] };
}

/** E2E-fikstuuri on committoitu ja muuttumaton — today.json vaihtuu kahdesti päivässä */
function fixtureMatches(): FixtureMatch[] {
  const json = readFileSync(new URL('../../e2e/fixtures/snapshot-with-elo.json', import.meta.url), 'utf8');
  return JSON.parse(json).matches as FixtureMatch[];
}

describe('Kynnykset ovat samat selaimessa ja palvelimella', () => {
  it('kandidaatti- ja vahva-raja vastaavat snapshotin kynnyksiä', () => {
    // Jos nämä eriytyvät, ruutu voisi olla keltainen ilman lippua tai
    // päinvastoin ilman että kumpikaan puoli on rikki
    expect(EV_CANDIDATE).toBe(VALUE_THRESHOLD);
    expect(EV_STRONG).toBe(STRONG_THRESHOLD);
  });

  it('todennäköisyyseron kynnys vastaa palvelinta', () => {
    // Selain vain SELITTÄÄ tämän kynnyksen vihjetekstissä — jos luku eroaa,
    // kortti lupaisi väärän rajan
    expect(MIN_PROB_EDGE).toBe(SERVER_MIN_PROB_EDGE);
  });

  it('kultainen taso on kandidaatin ja vahvan yläpuolella', () => {
    expect(EV_ELITE).toBeGreaterThan(EV_STRONG);
    expect(EV_STRONG).toBeGreaterThan(EV_CANDIDATE);
  });
});

describe('Ruudun oma edge', () => {
  it('parhaan hinnan ruutu antaa saman edgen kuin snapshotin analyysi', () => {
    for (const match of fixtureMatches()) {
      for (const edge of match.analysis.edges) {
        const bookmaker = match.best[`${edge.side}_book`] as string;
        const row = match.odds.find((r) => r.bookmaker === bookmaker);
        expect(row, `${match.id}: ${bookmaker} puuttuu kerroinriveistä`).toBeTruthy();
        const own = cellEdge(edge.model_prob, match.best[edge.side] as number, row!.commission);
        // Snapshot pyöristää edgen neljään desimaaliin
        expect(own, `${match.id} ${edge.side}`).toBeCloseTo(edge.edge, 3);
      }
    }
  });

  it('korkeampi kerroin samalla kohteella antaa suuremman edgen', () => {
    // Juuri tämä on käyttäjän havainto: jos 10.00 on ylikerroin, niin 9.80 on
    // sitä myös — pienemmällä marginaalilla, ei mustana
    const p = 0.112;
    const high = cellEdge(p, 10.0);
    const low = cellEdge(p, 9.8);
    expect(high).toBeGreaterThan(low);
    expect(edgeBgClass(high)).toBe('value-elite');
    expect(edgeBgClass(low)).toBe('value-elite');
    // Ja matalammat hinnat samalta kohteelta putoavat tasoittain alaspäin
    expect(edgeBgClass(cellEdge(p, 9.4))).toBe('value-strong');
    expect(edgeBgClass(cellEdge(p, 9.2))).toBe('value-candidate');
    expect(edgeBgClass(cellEdge(p, 9.0))).toBe('');
  });

  it('pörssin komissio pienentää ruudun edgeä', () => {
    const plain = cellEdge(0.5, 10, 0);
    const exchange = cellEdge(0.5, 10, 0.05);
    expect(exchange).toBeLessThan(plain);
    // Sama kaava kuin palvelimella: komissio veloitetaan vain voitosta
    expect(exchange).toBeCloseTo(0.5 * effectiveOdds(10, 0.05) - 1, 10);
  });

  it('palauttaa null kun lukua ei ole', () => {
    expect(cellEdge(null, 2.5)).toBeNull();
    expect(cellEdge(0, 2.5)).toBeNull();
    expect(cellEdge(0.5, 1)).toBeNull();
    expect(cellEdge(0.5, NaN)).toBeNull();
    expect(edgeBgClass(null)).toBe('');
  });
});

describe('Väriluokat', () => {
  it('taustaväri seuraa neljää tasoa', () => {
    expect(edgeBgClass(-0.2)).toBe('');
    expect(edgeBgClass(0.02)).toBe('');
    expect(edgeBgClass(0.031)).toBe('value-candidate');
    expect(edgeBgClass(0.051)).toBe('value-strong');
    expect(edgeBgClass(0.081)).toBe('value-elite');
  });

  it('kynnys on tarkalleen kynnyksellä vielä väritön', () => {
    // > eikä >=, sama kuin palvelimen flagFor
    expect(edgeBgClass(EV_CANDIDATE)).toBe('');
    expect(edgeBgClass(EV_STRONG)).toBe('value-candidate');
    expect(edgeBgClass(EV_ELITE)).toBe('value-strong');
  });

  it('prosenttiluvun väri erottaa negatiivisen nolla-alueesta', () => {
    expect(edgeTextClass(-0.01)).toBe('ev-bad');
    expect(edgeTextClass(0.01)).toBe('ev-flat');
    expect(edgeTextClass(0.04)).toBe('ev-ok');
    expect(edgeTextClass(0.06)).toBe('ev-good');
    expect(edgeTextClass(0.09)).toBe('ev-wow');
  });
});

describe('Väri ei enää seuraa palvelimen lippua', () => {
  it('liputtamaton kohde saa värin jos sen oma edge ylittää kynnyksen', () => {
    // Sama tapaus kuin e2e-fikstuurissa football-flag-count.spec.ts:ssä:
    // edge 5.5 % mutta flag "none", koska todennäköisyysero on 1.1 pp
    const modelProb = 0.207;
    const probEdge = modelProb - 0.196;
    expect(probEdge).toBeLessThan(MIN_PROB_EDGE);
    expect(edgeBgClass(cellEdge(modelProb, 5.1))).toBe('value-strong');
  });

  it('sama kohde toiselta toimistolta voi jäädä mustaksi', () => {
    // 5.1 → +5.6 %, 4.9 → +1.4 %: väri erottaa hinnat, lippu ei
    expect(edgeBgClass(cellEdge(0.207, 4.9))).toBe('');
  });

  it('paras hinta ilman odotusarvoa jää mustaksi', () => {
    // Väri tarkoittaa aina ylikerrointa — ei "halvin kolmesta huonosta"
    expect(edgeBgClass(cellEdge(0.505, 1.98))).toBe('');
  });
});

// Tiketti #97: vari ja panossuositus eivat saa sanoa eri asiaa
//
// BUGI: kortti naytti VIHREAA ruutua (Assat 4.30, +6.9 %) ja samaan aikaan
// sanoi "Ei value-kohdetta ... panossuositusta ei anneta". Syy oli kahdessa
// eri saannossa: vari katsoi pelkkaa edgea, lippu vaati myos 2 pp:n eron
// mallin ja markkinan valilla.
describe('Vari noudattaa lipun saantoa (tiketti #97)', () => {
  it('RIITTAMATON todennakoisyysero -> EI varia vaikka edge olisi iso', () => {
    // Juuri se tapaus jonka kayttaja nappasi: pitka maksu, olematon ero
    expect(edgeBgClass(0.069, 0.0)).toBe('');
    expect(edgeBgClass(0.15, 0.005)).toBe('');
  });

  it('riittava ero -> vari kuten ennen', () => {
    expect(edgeBgClass(0.069, 0.03)).toBe('value-strong');
    expect(edgeBgClass(0.04, 0.025)).toBe('value-candidate');
    expect(edgeBgClass(0.12, 0.05)).toBe('value-elite');
  });

  it('tasan kynnyksella vari annetaan', () => {
    expect(edgeBgClass(0.069, MIN_PROB_EDGE)).toBe('value-strong');
  });

  it('PUUTTUVA tieto ei ole sama kuin nolla — vanha kutsu toimii ennallaan', () => {
    expect(edgeBgClass(0.069)).toBe('value-strong');
    expect(edgeBgClass(0.069, null)).toBe('value-strong');
  });

  it('negatiivinen edge ei saa varia erosta riippumatta', () => {
    expect(edgeBgClass(-0.05, 0.1)).toBe('');
  });

  it('null-edge pysyy varittomana', () => {
    expect(edgeBgClass(null, 0.1)).toBe('');
  });
});
