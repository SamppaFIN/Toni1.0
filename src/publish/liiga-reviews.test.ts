// Liigan kierrosarviointi (tiketti #105)

import { describe, it, expect } from 'vitest';
import { goalMinute, extractGoals, buildClaims, reviewGame, buildRoundReview } from './liiga-reviews.js';
import type { SideProbs } from '../types-football.js';
import type { LiigaApiGame } from '../ingest/stats-liiga.js';

const REG = 'ENDED_DURING_REGULAR_GAME_TIME';
const SO = 'ENDED_DURING_WINNING_SHOT_COMPETITION';
const OT = 'ENDED_DURING_EXTENDED_GAME_TIME';

/** Liiga.fi-tyyppinen ottelu, maalitapahtumat gameTime-sekunteina */
function peli(
  koti: string,
  vieras: string,
  kotiMaalit: { s: number }[],
  vierasMaalit: { s: number }[],
  kg: number,
  vg: number,
  tyyppi = REG,
  pvm = '2026-09-01T15:30:00Z'
): LiigaApiGame {
  return {
    start: pvm,
    ended: true,
    finishedType: tyyppi,
    homeTeam: { teamName: koti, goals: kg, goalEvents: kotiMaalit.map((m) => ({ gameTime: m.s })) } as any,
    awayTeam: { teamName: vieras, goals: vg, goalEvents: vierasMaalit.map((m) => ({ gameTime: m.s })) } as any,
  };
}

describe('goalMinute — Liiga.fi antaa sekunteja, ei minuutteja', () => {
  it('874 sekuntia on 15. minuutti, ei 874.', () => {
    expect(goalMinute(874)).toBe(15);
  });

  it('0 sekuntia pyoristyy 1. minuuttiin (minuutti 0 ei ole mielekas)', () => {
    expect(goalMinute(0)).toBe(1);
  });

  it('merkkijonomuotoinen luku kelpaa', () => {
    expect(goalMinute('600')).toBe(10);
  });

  it('kelvoton syote -> null', () => {
    expect(goalMinute('ei-numero')).toBeNull();
    expect(goalMinute(-5)).toBeNull();
    expect(goalMinute(undefined)).toBeNull();
  });
});

describe('extractGoals', () => {
  it('poimii kotiin ja vieraisiin maalit oikealla minuutilla', () => {
    const g = peli('Tappara', 'Ilves', [{ s: 600 }], [{ s: 1200 }], 1, 1);
    const goals = extractGoals(g);
    expect(goals).toEqual([
      { minute: 10, side: 'home' },
      { minute: 20, side: 'away' },
    ]);
  });

  it('JATKOAJAN MAALI JATETAAN POIS — 1X2 ratkeaa 60 minuutissa', () => {
    // 65. minuutin voittomaali (3900s) ei kuulu varsinaiseen peliaikaan
    const g = peli('Sport', 'Jokerit', [{ s: 600 }], [{ s: 600 }, { s: 3900 }], 1, 2, SO);
    const goals = extractGoals(g);
    expect(goals).toEqual([
      { minute: 10, side: 'home' },
      { minute: 10, side: 'away' },
    ]);
  });

  it('jarjestaa maalit ajan mukaan lajista riippumatta', () => {
    const g = peli('A', 'B', [{ s: 1800 }], [{ s: 300 }], 1, 1);
    expect(extractGoals(g).map((x) => x.side)).toEqual(['away', 'home']);
  });

  it('ei maalitapahtumia -> tyhja lista, ei kaadu', () => {
    const g: LiigaApiGame = { start: '2026-09-01T15:00:00Z', ended: true, finishedType: REG, homeTeam: { teamName: 'A', goals: 0 }, awayTeam: { teamName: 'B', goals: 0 } };
    expect(extractGoals(g)).toEqual([]);
  });
});

const probs = (home: number, draw: number, away: number): SideProbs => ({ home, draw, away });

describe('buildClaims', () => {
  it('Tasapelikorjaus: hit=null kun malli ei poikkea markkinasta', () => {
    const claims = buildClaims(probs(0.4, 0.25, 0.35), probs(0.4, 0.25, 0.35), 'home', 'A', 'B');
    const c = claims.find((c) => c.claim === 'Tasapelikorjaus')!;
    expect(c.hit).toBeNull();
  });

  it('Tasapelikorjaus: testattavissa ja OSUU kun malli nosti tasapelia ja tasapeli toteutui', () => {
    const claims = buildClaims(probs(0.35, 0.3, 0.35), probs(0.4, 0.25, 0.35), 'draw', 'A', 'B');
    const c = claims.find((c) => c.claim === 'Tasapelikorjaus')!;
    expect(c.hit).toBe(true);
  });

  it('Tasapelikorjaus: testattavissa ja EPAONNISTUU kun tasapelia ei tullut', () => {
    const claims = buildClaims(probs(0.35, 0.3, 0.35), probs(0.4, 0.25, 0.35), 'home', 'A', 'B');
    const c = claims.find((c) => c.claim === 'Tasapelikorjaus')!;
    expect(c.hit).toBe(false);
  });

  it('Tasapelikorjaus: ilman markkinaa ei vaitetta lainkaan', () => {
    const claims = buildClaims(probs(0.35, 0.3, 0.35), null, 'draw', 'A', 'B');
    expect(claims.find((c) => c.claim === 'Tasapelikorjaus')).toBeUndefined();
  });

  it('Kausiennakon sija: parempi sija (Tappara #1) voittaa -> osuu', () => {
    const claims = buildClaims(null, null, 'home', 'Tappara', 'Jukurit');
    const c = claims.find((c) => c.claim === 'Kausiennakon sija')!;
    expect(c.hit).toBe(true);
    expect(c.model).toContain('Tappara');
  });

  it('Kausiennakon sija: altavastaaja voittaa -> ei osu', () => {
    const claims = buildClaims(null, null, 'away', 'Tappara', 'Jukurit');
    const c = claims.find((c) => c.claim === 'Kausiennakon sija')!;
    expect(c.hit).toBe(false);
  });

  it('Kausiennakon sija: tasapeli EI testaa sijajarjestysta -> null', () => {
    const claims = buildClaims(null, null, 'draw', 'Tappara', 'Jukurit');
    const c = claims.find((c) => c.claim === 'Kausiennakon sija')!;
    expect(c.hit).toBeNull();
  });

  it('Kausiennakon sija: tuntematon joukkue -> ei vaitetta', () => {
    const claims = buildClaims(null, null, 'home', 'Tappara', 'Tuntematon FC');
    expect(claims.find((c) => c.claim === 'Kausiennakon sija')).toBeUndefined();
  });

  it('Kotietu: malli yli 50 % kotivoitolle ja koti voittaa -> osuu', () => {
    const claims = buildClaims(probs(0.6, 0.2, 0.2), null, 'home', 'A', 'B');
    const c = claims.find((c) => c.claim === 'Kotietu')!;
    expect(c.hit).toBe(true);
  });

  it('Kotietu: malli yli 50 % kotivoitolle mutta koti havio -> ei osu', () => {
    const claims = buildClaims(probs(0.6, 0.2, 0.2), null, 'away', 'A', 'B');
    const c = claims.find((c) => c.claim === 'Kotietu')!;
    expect(c.hit).toBe(false);
  });

  it('Kotietu: malli ei pida kotivoittoa selvana suosikkina -> ei testattavissa', () => {
    const claims = buildClaims(probs(0.45, 0.25, 0.3), null, 'home', 'A', 'B');
    const c = claims.find((c) => c.claim === 'Kotietu')!;
    expect(c.hit).toBeNull();
  });
});

describe('reviewGame', () => {
  it('osui: mallin valinta voitti', () => {
    const g = peli('Tappara', 'Jukurit', [{ s: 600 }, { s: 1200 }], [], 2, 0);
    const r = reviewGame(g, probs(0.7, 0.2, 0.1), probs(0.65, 0.2, 0.15));
    expect(r).not.toBeNull();
    expect(r!.outcome).toBe('home');
    expect(r!.modelPick).toBe('home');
    expect(r!.verdict).toBe('osui');
    expect(r!.regulationScore).toBe('2–0');
    expect(r!.wentToOvertime).toBe(false);
  });

  it('VARSINAINEN PELIAIKA RATKAISEE: voittomaalikilpailu on 1X2:n kannalta tasapeli', () => {
    // Loppulukema 4-4 (JA 5-4): koti ei voittanut varsinaisella peliajalla
    const g = peli('Sport', 'Jokerit', [{ s: 600 }, { s: 1440 }], [{ s: 900 }, { s: 1800 }], 5, 4, SO);
    const r = reviewGame(g, probs(0.3, 0.25, 0.45), null);
    expect(r!.outcome).toBe('draw');
    expect(r!.regulationScore).toBe('4–4');
    expect(r!.finalScore).toBe('5–4');
    expect(r!.wentToOvertime).toBe(true);
  });

  it('ei koskaan voitolla: mallin valinta havisi eika johtanut kertaakaan', () => {
    // Malli poimi vieraan, mutta koti johti koko ajan
    const g = peli('Tappara', 'Jukurit', [{ s: 300 }, { s: 900 }], [], 2, 0);
    const r = reviewGame(g, probs(0.2, 0.2, 0.6), null);
    expect(r!.modelPick).toBe('away');
    expect(r!.outcome).toBe('home');
    expect(r!.verdict).toBe('ei_koskaan_voitolla');
  });

  it('kaatui lopussa: mallin valinta johti pitkalle mutta havisi loppupuolella', () => {
    // Koti johtaa 5. minuutista 50. minuuttiin (yli 75% x 60min = 45min), sitten vieras tasoittaa ja voittaa
    const g = peli('HIFK', 'HPK', [{ s: 300 }], [{ s: 3000 }, { s: 3300 }], 1, 2);
    const r = reviewGame(g, probs(0.55, 0.2, 0.25), null);
    expect(r!.modelPick).toBe('home');
    expect(r!.outcome).toBe('away');
    expect(r!.verdict).toBe('kaatui_lopussa');
  });

  it('ilman mallia ei vaitetta valinnasta, verdikti ei_tietoa', () => {
    const g = peli('A', 'B', [{ s: 600 }], [], 1, 0);
    const r = reviewGame(g, null, null);
    expect(r!.modelPick).toBeNull();
    expect(r!.verdict).toBe('ei_tietoa');
  });

  it('kesken oleva ottelu -> null', () => {
    const g = { ...peli('A', 'B', [], [], 0, 0), ended: false };
    expect(reviewGame(g, probs(0.5, 0.3, 0.2), null)).toBeNull();
  });

  it('vajaa data (puuttuva joukkueen nimi) -> null, ei kaadu', () => {
    const g: LiigaApiGame = { start: '2026-09-01T15:00:00Z', ended: true, finishedType: REG, homeTeam: { teamName: '', goals: 1 }, awayTeam: { teamName: 'B', goals: 0 } };
    expect(reviewGame(g, null, null)).toBeNull();
  });

  it('sisaltaa vaitteet', () => {
    const g = peli('Tappara', 'Jukurit', [{ s: 600 }], [], 1, 0);
    const r = reviewGame(g, probs(0.6, 0.2, 0.2), probs(0.55, 0.25, 0.2));
    expect(r!.claims.length).toBeGreaterThan(0);
    expect(r!.claims.map((c) => c.claim)).toContain('Kotietu');
  });
});

describe('buildRoundReview', () => {
  it('laskee osumat ja vaiteyhteenvedon useasta ottelusta', () => {
    const g1 = peli('Tappara', 'Jukurit', [{ s: 600 }], [], 1, 0);
    const g2 = peli('Sport', 'HIFK', [], [{ s: 300 }], 0, 1);
    const r1 = reviewGame(g1, probs(0.6, 0.2, 0.2), probs(0.55, 0.25, 0.2))!;
    const r2 = reviewGame(g2, probs(0.3, 0.2, 0.5), probs(0.35, 0.2, 0.45))!;

    const round = buildRoundReview([r1, r2], '2026-09-01');
    expect(round.date).toBe('2026-09-01');
    expect(round.summary.matches).toBe(2);
    expect(round.summary.modelCorrect).toBe(2);
    expect(round.summary.marketCorrect).toBe(2);
  });

  it('hit:null vaitteet EIVAT vaikuta yhteenvetoon — arvattu osuma olisi vaarempi kuin puuttuva', () => {
    // Malli ei poikennut markkinasta tasapelissa eika ollut yli 50% kotivoitolle -> molemmat null
    const g = peli('Tappara', 'Jukurit', [{ s: 600 }], [], 1, 0);
    const r = reviewGame(g, probs(0.45, 0.25, 0.3), probs(0.45, 0.25, 0.3))!;
    const round = buildRoundReview([r], '2026-09-01');
    expect(round.summary.claims['Tasapelikorjaus']).toBeUndefined();
    expect(round.summary.claims['Kotietu']).toBeUndefined();
    // Kausiennakon sija oli testattavissa (molemmat tunnetaan, ei tasapeli)
    expect(round.summary.claims['Kausiennakon sija']).toEqual({ hit: 1, tested: 1 });
  });

  it('neverLeading laskee analyysivirheet erikseen', () => {
    const g = peli('Tappara', 'Jukurit', [{ s: 300 }], [], 1, 0);
    const r = reviewGame(g, probs(0.2, 0.2, 0.6), null)!;
    const round = buildRoundReview([r], '2026-09-01');
    expect(round.summary.neverLeading).toBe(1);
  });

  it('tyhja syote -> tyhja yhteenveto, ei kaadu', () => {
    const round = buildRoundReview([], '2026-09-01');
    expect(round.summary.matches).toBe(0);
    expect(round.summary.claims).toEqual({});
  });
});
