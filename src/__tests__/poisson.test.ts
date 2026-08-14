import { describe, it, expect } from 'vitest';
import {
  poissonPmf,
  scoreMatrix,
  outcomeProbs,
  overProb,
  bttsProb,
  topScores,
  teamStrength,
  expectedGoals,
  predictPoisson,
  adjustLambda,
  shrinkStrength,
  DEFAULT_LEAGUE,
  DEFAULT_SHRINKAGE_K,
} from '../analyze/poisson.js';

describe('Poissonin pistetodennäköisyys', () => {
  it('vastaa käsin laskettua arvoa (λ=1.5, k=2)', () => {
    // P(X=2) = e^-1.5 × 1.5² / 2! = 0.22313 × 2.25 / 2 = 0.25102
    expect(poissonPmf(2, 1.5)).toBeCloseTo(0.25102, 5);
  });

  it('λ=0 → varmasti nolla maalia', () => {
    expect(poissonPmf(0, 0)).toBe(1);
    expect(poissonPmf(1, 0)).toBe(0);
  });

  it('summautuu ykköseen kun k käydään läpi', () => {
    let sum = 0;
    for (let k = 0; k <= 30; k++) sum += poissonPmf(k, 2.4);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('hylkää negatiiviset ja murtoluvut', () => {
    expect(poissonPmf(-1, 1.5)).toBe(0);
    expect(poissonPmf(1.5, 1.5)).toBe(0);
  });

  it('ei ylivuoda suurilla k-arvoilla (logaritminen kertoma)', () => {
    expect(Number.isFinite(poissonPmf(50, 2))).toBe(true);
  });
});

describe('Tulosmatriisi', () => {
  it('summautuu ykköseen puhtaalla Poissonilla (rho=0)', () => {
    const m = scoreMatrix(1.5, 1.2, 0);
    const sum = m.flat().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('summautuu ykköseen myös Dixon–Coles-korjauksen jälkeen', () => {
    const m = scoreMatrix(1.5, 1.2, -0.05);
    const sum = m.flat().reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it('kaikki alkiot ovat ei-negatiivisia', () => {
    const m = scoreMatrix(2.5, 0.4, -0.15);
    expect(m.flat().every((p) => p >= 0)).toBe(true);
  });

  it('Dixon–Coles nostaa tasapelitulosten 0-0 ja 1-1 todennäköisyyttä', () => {
    const plain = scoreMatrix(1.4, 1.2, 0);
    const dc = scoreMatrix(1.4, 1.2, -0.08);
    expect(dc[0][0]).toBeGreaterThan(plain[0][0]);
    expect(dc[1][1]).toBeGreaterThan(plain[1][1]);
    // ...ja laskee 1-0 ja 0-1 todennäköisyyttä
    expect(dc[1][0]).toBeLessThan(plain[1][0]);
    expect(dc[0][1]).toBeLessThan(plain[0][1]);
  });
});

describe('1X2-todennäköisyydet', () => {
  it('summautuvat ykköseen', () => {
    const p = outcomeProbs(scoreMatrix(1.6, 1.1));
    expect(p.home + p.draw + p.away).toBeCloseTo(1.0, 6);
  });

  it('symmetriset λ:t antavat symmetriset koti- ja vieraslukemat', () => {
    const p = outcomeProbs(scoreMatrix(1.3, 1.3));
    expect(p.home).toBeCloseTo(p.away, 6);
  });

  it('suurempi λ_koti johtaa suurempaan kotivoittotodennäköisyyteen', () => {
    const p = outcomeProbs(scoreMatrix(2.2, 0.8));
    expect(p.home).toBeGreaterThan(p.away);
    expect(p.home).toBeGreaterThan(0.5);
  });

  it('tasavahvoilla tasapeli on realistisella jalkapallovälillä 22–30 %', () => {
    const p = outcomeProbs(scoreMatrix(1.4, 1.4));
    expect(p.draw).toBeGreaterThan(0.22);
    expect(p.draw).toBeLessThan(0.30);
  });
});

describe('Maalimarkkinat', () => {
  it('yli 2.5 kasvaa kun λ:t kasvavat', () => {
    const low = overProb(scoreMatrix(0.8, 0.7));
    const high = overProb(scoreMatrix(2.2, 1.9));
    expect(high).toBeGreaterThan(low);
    expect(low).toBeLessThan(0.5);
    expect(high).toBeGreaterThan(0.6);
  });

  it('yli 2.5 keskitasolla on lähellä markkinan tyypillistä 50 %:a', () => {
    const p = overProb(scoreMatrix(DEFAULT_LEAGUE.homeGoals, DEFAULT_LEAGUE.awayGoals));
    expect(p).toBeGreaterThan(0.44);
    expect(p).toBeLessThan(0.58);
  });

  it('BTTS on nolla kun toinen joukkue ei voi tehdä maalia', () => {
    expect(bttsProb(scoreMatrix(1.5, 0, 0))).toBeCloseTo(0, 6);
  });

  it('BTTS kasvaa kun molempien λ kasvaa', () => {
    expect(bttsProb(scoreMatrix(1.8, 1.6))).toBeGreaterThan(bttsProb(scoreMatrix(0.9, 0.8)));
  });

  it('yli/alle 2.5 summautuvat ykköseen', () => {
    const m = scoreMatrix(1.7, 1.3);
    const over = overProb(m, 2.5);
    let under = 0;
    for (let h = 0; h < m.length; h++) for (let a = 0; a < m[h].length; a++) if (h + a < 2.5) under += m[h][a];
    expect(over + under).toBeCloseTo(1.0, 6);
  });
});

describe('Todennäköisimmät tulokset', () => {
  it('palauttaa pyydetyn määrän laskevassa järjestyksessä', () => {
    const top = topScores(scoreMatrix(1.5, 1.2), 5);
    expect(top).toHaveLength(5);
    for (let i = 1; i < top.length; i++) expect(top[i].p).toBeLessThanOrEqual(top[i - 1].p);
  });

  it('matalilla λ-arvoilla 0-0 on todennäköisin', () => {
    expect(topScores(scoreMatrix(0.6, 0.5), 1)[0].score).toBe('0-0');
  });
});

describe('Joukkuevoimat ja λ', () => {
  it('keskitason joukkue saa voiman 1.0', () => {
    const avg = (DEFAULT_LEAGUE.homeGoals + DEFAULT_LEAGUE.awayGoals) / 2;
    const s = teamStrength(avg, avg);
    expect(s.attack).toBeCloseTo(1.0, 6);
    expect(s.defense).toBeCloseTo(1.0, 6);
  });

  it('keskitason joukkueet tuottavat sarjan keskiarvo-λ:t', () => {
    const { lambdaHome, lambdaAway } = expectedGoals({ attack: 1, defense: 1 }, { attack: 1, defense: 1 });
    expect(lambdaHome).toBeCloseTo(DEFAULT_LEAGUE.homeGoals, 6);
    expect(lambdaAway).toBeCloseTo(DEFAULT_LEAGUE.awayGoals, 6);
  });

  it('vahva hyökkäys heikkoa puolustusta vastaan nostaa λ:aa', () => {
    const { lambdaHome } = expectedGoals({ attack: 1.5, defense: 1 }, { attack: 1, defense: 1.4 });
    expect(lambdaHome).toBeGreaterThan(DEFAULT_LEAGUE.homeGoals * 2);
  });

  it('kotietu näkyy: tasavahvoilla koti on todennäköisempi voittaja', () => {
    const p = predictPoisson({ attack: 1, defense: 1 }, { attack: 1, defense: 1 });
    expect(p.probs.home).toBeGreaterThan(p.probs.away);
  });

  it('nollalla sarjakeskiarvolla ei kaadu', () => {
    const s = teamStrength(1.5, 1.2, { homeGoals: 0, awayGoals: 0 });
    expect(s.attack).toBe(1);
    expect(s.defense).toBe(1);
  });
});

describe('Kutistus otoskoon mukaan', () => {
  const strong = { attack: 2.0, defense: 0.5 };

  it('nolla pelattua ottelua → täysi kutistus keskitasoon', () => {
    const s = shrinkStrength(strong, 0);
    expect(s.attack).toBeCloseTo(1.0, 6);
    expect(s.defense).toBeCloseTo(1.0, 6);
  });

  it('k pelattua ottelua → puolet matkasta keskitasosta', () => {
    const s = shrinkStrength(strong, DEFAULT_SHRINKAGE_K, DEFAULT_SHRINKAGE_K);
    expect(s.attack).toBeCloseTo(1.5, 6);
    expect(s.defense).toBeCloseTo(0.75, 6);
  });

  it('kutistus vähenee kun otteluita kertyy', () => {
    const few = shrinkStrength(strong, 3);
    const many = shrinkStrength(strong, 30);
    expect(few.attack).toBeLessThan(many.attack);
    expect(many.attack).toBeGreaterThan(1.6);
  });

  it('lähestyy alkuperäistä voimaa kun otteluita on paljon', () => {
    expect(shrinkStrength(strong, 10000).attack).toBeCloseTo(2.0, 2);
    // Kutistus ei koskaan katoa täysin — se vain käy merkityksettömäksi
    expect(shrinkStrength(strong, 10000).attack).toBeLessThan(2.0);
  });

  it('keskitason joukkue pysyy keskitasolla otoskoosta riippumatta', () => {
    for (const played of [0, 3, 18, 100]) {
      expect(shrinkStrength({ attack: 1, defense: 1 }, played).attack).toBeCloseTo(1.0, 6);
    }
  });

  it('negatiivinen otoskoko käsitellään nollana', () => {
    expect(shrinkStrength(strong, -5).attack).toBeCloseTo(1.0, 6);
  });

  it('kutistus vaimentaa alkukauden ylisuuret todennäköisyydet', () => {
    // 3 ottelua, hyökkäys 2.2/0.9 vs 1.6/1.3 — ilman kutistusta malli
    // antaa yli 65 % kotivoitolle, mikä on pelkkää otantavirhettä
    const league = { homeGoals: 1.55, awayGoals: 1.25 };
    const rawHome = teamStrength(2.2, 0.9, league);
    const rawAway = teamStrength(1.6, 1.3, league);
    const raw = predictPoisson(rawHome, rawAway, league);
    const shrunk = predictPoisson(shrinkStrength(rawHome, 3), shrinkStrength(rawAway, 3), league);

    expect(raw.probs.home).toBeGreaterThan(0.65);
    expect(shrunk.probs.home).toBeLessThan(raw.probs.home);
    expect(shrunk.probs.home).toBeLessThan(0.58);
  });
});

describe('λ-säätö uutistiedosta', () => {
  it('negatiivinen delta laskee odotettuja maaleja', () => {
    expect(adjustLambda(1.5, -0.10)).toBeCloseTo(1.35, 6);
  });

  it('ei mene nollaan tai negatiiviseksi', () => {
    expect(adjustLambda(1.5, -2)).toBeGreaterThan(0);
  });
});
