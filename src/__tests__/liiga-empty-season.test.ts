// Tiketti #103: TYHJÄ KAUSI EI OLE SAMA KUIN TOIMIVA TILASTOLÄHDE
//
// TÄMÄ ON SE VIKA JOTA TESTI SUOJAA. Liigan avauskierroksella liiga.fi
// palautti kauden 2027 ohjelman ilman yhtäkään päättynyttä ottelua, joten
// `current.teams` oli TYHJÄ LISTA. Koodi tarkisti vain `if (!stats)`, ja
// tyhjä kausi ei ollut null — joten kausiennakon varareitti EI ajanut.
// `strengthForTeam` palautti nullin, kortti putosi market-only-tilaan ja
// `stats` jäi nulliksi.
//
// Seuraus jonka käyttäjä näki: lähtö-Elo ei näkynyt joukkueiden nimissä,
// vaikka Elo-kartta oli laskettu oikein. Luku oli olemassa, mutta mikään ei
// vienyt sitä kortille.
//
// Vika oli hiljainen juuri siksi että kaikki näytti toimivan: lähdelistassa
// luki liiga.fi, kertoimet olivat kohdillaan, eikä lokissa ollut virhettä.

import { describe, it, expect } from 'vitest';
import { buildCard } from '../publish/live-snapshot.js';
import { priorEloMap } from '../analyze/liiga-priors.js';
import type { FootballOddsEvent } from '../ingest/odds-football.js';
import type { LeagueSeasonStats } from '../types-football.js';
import type { LeagueStatsPair } from '../ingest/stats.js';

const event = (home: string, away: string): FootballOddsEvent => ({
  eventId: `${home}-${away}`,
  sportKey: 'icehockey_liiga',
  league: 'Liiga',
  kickoff: '2026-09-01T15:30:00.000Z',
  home: { name: home, short: home.slice(0, 3).toUpperCase(), color: '#000' },
  away: { name: away, short: away.slice(0, 3).toUpperCase(), color: '#000' },
  odds: [
    { bookmaker: 'Coolbet', key: 'coolbet', market: '1X2', home: 2.92, draw: 3.75, away: 2.38, commission: 0, fetched_at: '2026-09-01T11:40:00.000Z' },
    { bookmaker: '1xBet', key: 'onexbet', market: '1X2', home: 2.81, draw: 3.92, away: 2.21, commission: 0, fetched_at: '2026-09-01T11:41:00.000Z' },
  ],
  totals: [],
});

/** Kausi joka on OLEMASSA muttei sisällä yhtään pelattua ottelua */
const emptySeason: LeagueSeasonStats = {
  league: 'Liiga',
  season: '2027',
  teams: [],
  homeGoalsAvg: 0,
  awayGoalsAvg: 0,
  source: 'liiga.fi/api/v2',
  splitsEstimated: false,
};

const emptyPair: LeagueStatsPair = { current: emptySeason, previous: null };
const elo = priorEloMap();

describe('tyhjä kausi -> kausiennakko, ei market-only', () => {
  const card = buildCard(event('Jukurit', 'HPK'), emptyPair, null, {}, elo);

  it('KORTILLA ON TUNNUSLUVUT vaikka tilastolähde palautti tyhjän kauden', () => {
    expect(card.stats).not.toBeNull();
  });

  it('LÄHTÖ-ELO ON KORTILLA — tämä oli se puuttuva luku', () => {
    expect(card.stats!.home.elo).toBe(1380); // Jukurit, ennakon sija 17
    expect(card.stats!.away.elo).toBe(1455); // HPK, ennakon sija 12
  });

  it('Elo on merkitty lähtötasoksi eikä mittaukseksi', () => {
    expect(card.stats!.home.elo_provisional).toBe(true);
    expect(card.stats!.home.played).toBe(0);
  });

  it('malli EI ole market-only — ennakko ohjaa sitä', () => {
    expect(card.model.method).not.toBe('market-only');
    expect(card.model.lambda_home).not.toBeNull();
  });

  it('mallin paino markkinaa vastaan on matala — ennakko ei ole mittaus', () => {
    expect(card.model.blend_weight).toBeGreaterThan(0);
    expect(card.model.blend_weight).toBeLessThan(0.25);
  });

  it('ennakon plussat ja miinukset ovat kortilla rakenteisena', () => {
    expect(card.preview).toBeDefined();
    expect(card.preview!.home.strengths.length).toBeGreaterThan(0);
    expect(card.preview!.away.weaknesses.length).toBeGreaterThan(0);
    expect(card.preview!.home.elo).toBe(1380);
  });

  it('lähde kulkee kortille — yhden toimituksen arvio on merkittävä sellaiseksi', () => {
    expect(card.preview!.source.name).toContain('Ristikaksi');
    expect(card.preview!.source.url).toMatch(/^https:\/\//);
  });

  it('parempi ennakkosija on suosikki', () => {
    // HPK (#12) on vieraissa Jukureita (#17) vastaan: mallin pitää nähdä se
    const k = buildCard(event('Jukurit', 'Tappara'), emptyPair, null, {}, elo);
    expect(k.model.poisson_probs!.away).toBeGreaterThan(k.model.poisson_probs!.home);
  });
});

describe('puuttuva tilastolähde toimii kuten ennenkin', () => {
  it('null-lähde päätyy samaan kausiennakkoon', () => {
    const card = buildCard(event('Jukurit', 'HPK'), null, null, {}, elo);
    expect(card.stats!.home.elo).toBe(1380);
    expect(card.preview).toBeDefined();
  });
});

describe('sarja jolle ei ole ennakkoa', () => {
  it('putoaa market-only-tilaan ilman keksittyjä lukuja', () => {
    const jalkapallo = { ...event('Arsenal', 'Chelsea'), sportKey: 'soccer_epl', league: 'Valioliiga' };
    const card = buildCard(jalkapallo, { current: { ...emptySeason, league: 'Valioliiga' }, previous: null }, null, {}, null);
    expect(card.stats).toBeNull();
    expect(card.preview).toBeUndefined();
    expect(card.model.method).toBe('market-only');
  });
});
