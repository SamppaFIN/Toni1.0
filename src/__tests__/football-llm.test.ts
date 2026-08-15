// Tiketti #38: "Kysy LLM:ltä" — promptin rakennus
//
// Verkkokutsu (askLlm) ja näkymä on todennettu selaimessa. Täältä testataan
// se osa joka määrää analyysin laadun: mitä malli näkee ja missä
// järjestyksessä.
//
// Yksi testeistä on tärkeämpi kuin muut: tunnuslukujen ja uutisten pitää
// tulla ENNEN kertoimia. Jos markkinan hinnat annetaan ensin, malli toistaa
// ne takaisin ja analyysi näyttää vahvistavan omaa malliamme, vaikka se vain
// kopioi markkinaa. Sama ansa kuin mallin mittaaminen sulkeutumislinjaa
// vasten — vastaus näyttää hyvältä juuri siksi että se on kehäpäätelmä.

import { describe, it, expect } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä, tuodaan tarkoituksella
import { buildPrompt, renderMarkdown, SUGGESTED_MODELS, DEFAULT_MODEL } from '../../public/app/football-llm.js';

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    generated_at: '2026-08-15T08:00:00.000Z',
    sport: 'football',
    source: 'live',
    providers: ['The Odds API', 'Wikipedia'],
    leagues: ['Veikkausliiga'],
    matches: [match()],
    ...overrides,
  };
}

function match(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test:1',
    league: 'Veikkausliiga',
    kickoff: '2026-08-15T16:00:00.000Z',
    home: { name: 'HJK Helsinki', short: 'HJK', color: '#0033A0' },
    away: { name: 'KuPS', short: 'KUP', color: '#FFDD00' },
    odds: [],
    best: { home: 2.25, draw: 3.3, away: 3.2, home_book: 'Pinnacle', draw_book: 'Unibet', away_book: 'Betsson' },
    market: { margin: 0.042, implied: { home: 0.44, draw: 0.28, away: 0.28 }, sharp: null, sharp_source: 'Pinnacle' },
    model: {
      method: 'poisson+sharp-blend',
      lambda_home: 1.62,
      lambda_away: 1.31,
      probs: { home: 0.46, draw: 0.27, away: 0.27 },
      poisson_probs: { home: 0.48, draw: 0.26, away: 0.26 },
      blend_weight: 0.35,
      over25: 0.52,
      btts: 0.51,
      top_scores: [],
      adjustments: [{ reason: 'Voimat: tämä kausi (HJK, 18 ottelua)' }],
    },
    analysis: {
      edges: [
        { side: 'home', odds: 2.25, odds_effective: 2.25, book: 'Pinnacle', model_prob: 0.46, implied_prob: 0.44, edge: 0.035, flag: 'candidate', kelly_fraction: 0.007, stake_suggestion: 0.7 },
        { side: 'draw', odds: 3.3, odds_effective: 3.3, book: 'Unibet', model_prob: 0.27, implied_prob: 0.28, edge: -0.109, flag: 'none', kelly_fraction: 0, stake_suggestion: 0 },
        { side: 'away', odds: 3.2, odds_effective: 3.2, book: 'Betsson', model_prob: 0.27, implied_prob: 0.28, edge: -0.136, flag: 'none', kelly_fraction: 0, stake_suggestion: 0 },
      ],
      news_window: false,
      bankroll_basis: 100,
    },
    stats: {
      home: { rank: 1, played: 18, form: 'WWWDW', gf_pg: 1.85, ga_pg: 1.05, home_gf_pg: 2.1, away_gf_pg: 1.6, xg_pg: null, rest_days: 5, ppg: 2.11, elo: 1604, elo_change: 104, elo_rank: 1 },
      away: { rank: 3, played: 18, form: 'WDWLW', gf_pg: 1.7, ga_pg: 1.1, home_gf_pg: 1.95, away_gf_pg: 1.45, xg_pg: null, rest_days: 4, ppg: 1.83, elo: 1562, elo_change: 62, elo_rank: 3 },
      h2h: [],
    },
    news: [],
    ...overrides,
  };
}

describe('Promptin rakennus', () => {
  it('tunnusluvut tulevat ennen kertoimia', () => {
    const p = buildPrompt(snapshot());
    const statsAt = p.indexOf('maalia/peli');
    const oddsAt = p.indexOf('Parhaat kertoimet');
    expect(statsAt).toBeGreaterThan(-1);
    expect(oddsAt).toBeGreaterThan(-1);
    expect(statsAt).toBeLessThan(oddsAt);
  });

  it('oman mallin arvio tulee ennen markkinan devigattua näkymää', () => {
    const p = buildPrompt(snapshot());
    expect(p.indexOf('Oman mallin todennäköisyydet')).toBeLessThan(p.indexOf('Markkina (devigattu)'));
  });

  it('sisältää molempien joukkueiden nimet ja sarjan', () => {
    const p = buildPrompt(snapshot());
    expect(p).toContain('HJK Helsinki');
    expect(p).toContain('KuPS');
    expect(p).toContain('Veikkausliiga');
  });

  it('kertoo value-lipun ja Kelly-panoksen kun sellainen on', () => {
    const p = buildPrompt(snapshot());
    expect(p).toContain('Value-lippu: home');
    expect(p).toContain('Kelly-panos');
  });

  it('sanoo suoraan kun value-kohteita ei ole', () => {
    const flat = match();
    flat.analysis.edges = flat.analysis.edges.map((e) => ({ ...e, flag: 'none', edge: -0.05, stake_suggestion: 0 }));
    const p = buildPrompt(snapshot({ matches: [flat] }));
    expect(p).toContain('Ei value-lippuja');
    expect(p).not.toContain('Value-lippu:');
  });

  it('varoittaa harjoitusdatasta — muuten malli analysoisi keksittyjä hintoja tosissaan', () => {
    const p = buildPrompt(snapshot({ source: 'mock' }));
    expect(p).toContain('harjoitusdataa');
  });

  it('kertoo kun tilastolähdettä ei ole eikä jätä lukua arvattavaksi', () => {
    const p = buildPrompt(snapshot({ matches: [match({ stats: null })] }));
    expect(p).toContain('Joukkuetilastoja ei ole saatavilla');
  });

  it('ottaa mukaan enintään kolme uutista per ottelu', () => {
    const news = Array.from({ length: 6 }, (_, i) => ({
      title: `Uutinen numero ${i}`,
      url: 'https://example.com',
      source: 'BBC Sport',
      published_at: '2026-08-15T06:00:00.000Z',
      event_type: 'injury',
      team: 'HJK Helsinki',
      player: null,
      confidence: 0.8,
      impact: null,
    }));
    const p = buildPrompt(snapshot({ matches: [match({ news })] }));
    const included = news.filter((n) => p.includes(n.title)).length;
    expect(included).toBe(3);
  });

  it('liittää omat avoimet vedot arvioitavaksi', () => {
    const p = buildPrompt(snapshot(), [
      { side: 'home', home: 'HJK Helsinki', away: 'KuPS', stake: 10, odds: 2.25, bookmaker: 'Pinnacle' },
    ]);
    expect(p).toContain('Omat avoimet vetoni');
    expect(p).toContain('Arvioi myös nämä vetoni');
  });

  it('jättää veto-osion pois kun vetoja ei ole', () => {
    expect(buildPrompt(snapshot(), [])).not.toContain('Omat avoimet vetoni');
  });

  it('listaa kaikki kierroksen ottelut numeroituina', () => {
    const p = buildPrompt(snapshot({ matches: [match(), match({ id: 'test:2' })] }));
    expect(p).toContain('## Ottelu 1:');
    expect(p).toContain('## Ottelu 2:');
  });
});

describe('Vastauksen renderöinti', () => {
  it('escapettaa HTML:n — mallin vastaus ei voi injektoida markkinointia', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('muuttaa lihavoinnin ja otsikot merkinnöiksi', () => {
    expect(renderMarkdown('**tärkeä**')).toContain('<b>tärkeä</b>');
    expect(renderMarkdown('## Otsikko')).toContain('Otsikko');
  });

  it('tyhjä vastaus ei kaadu', () => {
    expect(renderMarkdown('')).toBe('');
  });
});

describe('Mallivalinnat', () => {
  it('oletusmalli on tarjotulla listalla', () => {
    expect(SUGGESTED_MODELS.map((m: { id: string }) => m.id)).toContain(DEFAULT_MODEL);
  });

  it('jokaisella mallilla on id ja nimi', () => {
    for (const m of SUGGESTED_MODELS) {
      expect(m.id).toBeTruthy();
      expect(m.label).toBeTruthy();
    }
  });
});
