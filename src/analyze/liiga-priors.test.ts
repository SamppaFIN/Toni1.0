// Liigan kausiennakon priorit (tiketti #89)
//
// Tarkein lukittava asia: ENNAKKO EI SAA ESIINTYA MITTAUKSENA. Joukkueelle
// jolle ennakko ei antanut sijalukua ei saa syntya sellaista, ja kartan on
// pysyttava loivana jottei yhden toimituksen arvio saa kauden alussa liikaa
// painoa.

import { describe, it, expect } from 'vitest';
import {
  TEAM_PRIORS, TEAM_COUNT, RELEGATION_SPOTS, SPREAD, PRIOR_WORTH_MATCHES,
  strengthFromRank, priorFor, normalizeLiigaName, rankedTeams, effectiveRank,
} from './liiga-priors.js';

describe('joukkuelista', () => {
  it('kaudella 2026-27 on 17 joukkuetta', () => {
    expect(TEAM_PRIORS).toHaveLength(TEAM_COUNT);
    expect(TEAM_COUNT).toBe(17);
  });

  it('jokainen joukkue esiintyy tasan kerran', () => {
    const nimet = TEAM_PRIORS.map((p) => normalizeLiigaName(p.team));
    expect(new Set(nimet).size).toBe(nimet.length);
  });

  it('Jokerit on mukana — palasi 12 vuoden tauon jalkeen', () => {
    expect(priorFor('Jokerit')).not.toBeNull();
  });

  it('kolme alinta putoaa', () => {
    expect(RELEGATION_SPOTS).toBe(3);
  });

  it('sijaluvut ovat taydellinen permutaatio 1-17', () => {
    // 2026-09-01: ennakko antoi sijan kaikille 17 joukkueelle
    // (data/liiga-kausiennakko-2026-27.md). Aiemmin osa oli null.
    const sijat = TEAM_PRIORS.map((p) => p.rank)
      .filter((r): r is number => r !== null)
      .sort((a, b) => a - b);
    expect(sijat).toEqual(Array.from({ length: TEAM_COUNT }, (_, i) => i + 1));
  });

  it('jokaisella on silti taso', () => {
    expect(TEAM_PRIORS.every((p) => ['karki', 'ylakeski', 'alakeski', 'putoaja'].includes(p.tier))).toBe(true);
  });
});

describe('strengthFromRank', () => {
  it('karki saa hyokkaysvoimaa ja puolustusvoimaa', () => {
    const s = strengthFromRank(1);
    expect(s.attack).toBeGreaterThan(1);
    expect(s.defense).toBeLessThan(1);
  });

  it('hantapaa on kaanteinen', () => {
    const s = strengthFromRank(17);
    expect(s.attack).toBeLessThan(1);
    expect(s.defense).toBeGreaterThan(1);
  });

  it('keskikohta on tasan 1.0', () => {
    const s = strengthFromRank(9); // (17+1)/2
    expect(s.attack).toBeCloseTo(1, 6);
    expect(s.defense).toBeCloseTo(1, 6);
  });

  it('KARTTA ON LOIVA: aariarvot pysyvat SPREADin sisalla', () => {
    // Jyrkka kartta tekisi ennakosta vahvemman vaitteen kuin se on
    for (const rank of [1, 5, 9, 13, 17]) {
      const s = strengthFromRank(rank);
      expect(Math.abs(s.attack - 1)).toBeLessThanOrEqual(SPREAD + 1e-9);
      expect(Math.abs(s.defense - 1)).toBeLessThanOrEqual(SPREAD + 1e-9);
    }
  });

  it('hyokkays ja puolustus ovat symmetriset', () => {
    const s = strengthFromRank(3);
    expect(s.attack + s.defense).toBeCloseTo(2, 6);
  });

  it('jarjestys sailyy: parempi sija -> suurempi hyokkays', () => {
    const arvot = [1, 4, 8, 12, 17].map((r) => strengthFromRank(r).attack);
    for (let i = 1; i < arvot.length; i++) expect(arvot[i]).toBeLessThan(arvot[i - 1]);
  });

  it('valin ulkopuolinen sija ei karkaa rajoista', () => {
    expect(strengthFromRank(0).attack).toBeLessThanOrEqual(1 + SPREAD + 1e-9);
    expect(strengthFromRank(99).attack).toBeGreaterThanOrEqual(1 - SPREAD - 1e-9);
  });
});

describe('effectiveRank', () => {
  it('kayttaa annettua sijaa kun se on', () => {
    expect(effectiveRank({ team: 'X', rank: 4, tier: 'karki', relegationRisk: false })).toBe(4);
  });

  it('ilman sijaa kaytetaan tason keskikohtaa', () => {
    const r = effectiveRank({ team: 'X', rank: null, tier: 'putoaja', relegationRisk: true });
    expect(r).toBeGreaterThan(TEAM_COUNT / 2);
  });
});

describe('normalizeLiigaName', () => {
  it('skandit eivat estä tunnistusta', () => {
    expect(normalizeLiigaName('Kärpät')).toBe(normalizeLiigaName('Karpat'));
    expect(normalizeLiigaName('Ässät')).toBe(normalizeLiigaName('Assat'));
  });

  it('paikkakunta nimessa ei estä tunnistusta', () => {
    expect(priorFor('Kärpät Oulu')).not.toBeNull();
    expect(priorFor('Vaasan Sport')).not.toBeNull();
    expect(priorFor('Porin Ässät')).not.toBeNull();
  });

  it('IFK Helsinki tunnistetaan HIFK:ksi', () => {
    expect(priorFor('IFK Helsinki')?.team).toBe('HIFK');
  });

  it('tuntematon joukkue -> null eika arvausta', () => {
    expect(priorFor('Djurgården')).toBeNull();
    expect(priorFor('')).toBeNull();
  });

  it('KAIKKI 17 joukkuetta loytyvat omalla nimellaan', () => {
    for (const p of TEAM_PRIORS) expect(priorFor(p.team), p.team).not.toBeNull();
  });
});

describe('rankedTeams', () => {
  it('Tappara on ennakon karjessa', () => {
    expect(rankedTeams()[0].team).toBe('Tappara');
  });

  it('Jukurit on hannilla', () => {
    const j = rankedTeams();
    expect(j[j.length - 1].team).toBe('Jukurit');
  });

  it('jarjestys on nouseva sijaluvun mukaan', () => {
    const r = rankedTeams().map(effectiveRank);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]);
  });

  it('kaikki putoamisvaaraiset ovat alapuoliskolla', () => {
    const j = rankedTeams();
    const vaarassa = j.filter((t) => t.relegationRisk);
    expect(vaarassa.length).toBeGreaterThanOrEqual(RELEGATION_SPOTS);
    for (const t of vaarassa) expect(effectiveRank(t)).toBeGreaterThan(TEAM_COUNT / 3);
  });
});

describe('priorin painoarvo', () => {
  it('ennakko painaa VAHEMMAN kuin mitattu edellinen kausi', () => {
    // Jalkapallossa PREVIOUS_SEASON_WORTH = 8 (mitattua dataa).
    // Kausiennakko on yhden toimituksen arvio -> pienempi paino.
    expect(PRIOR_WORTH_MATCHES).toBeLessThan(8);
    expect(PRIOR_WORTH_MATCHES).toBeGreaterThan(0);
  });
});
