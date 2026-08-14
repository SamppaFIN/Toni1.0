import { describe, it, expect } from 'vitest';
import { bestOdds, effectiveOdds, buildMarketView, buildModelView, buildAnalysisView, buildMatchCard, buildSnapshot, validateSnapshot } from '../publish/snapshot.js';
import { predictPoisson } from '../analyze/poisson.js';
import { buildMockSnapshot } from '../publish/mock-snapshot.js';
import { SCHEMA_VERSION, BookmakerOdds, MatchStats } from '../types-football.js';

function row(bookmaker: string, key: string, home: number, draw: number, away: number): BookmakerOdds {
  return { bookmaker, key, market: '1X2', home, draw, away, commission: 0, fetched_at: '2026-08-14T09:00:00.000Z' };
}

const ROWS: BookmakerOdds[] = [
  row('Pinnacle', 'pinnacle', 2.10, 3.45, 3.60),
  row('Unibet', 'unibet_eu', 2.15, 3.40, 3.55),
  row('Betsson', 'betsson', 2.05, 3.50, 3.70),
];

const STATS: MatchStats = {
  home: { rank: 1, played: 10, form: 'WWWDW', gf_pg: 2.0, ga_pg: 1.0, home_gf_pg: 2.2, away_gf_pg: 1.8, xg_pg: null, rest_days: 5, ppg: 2.2 },
  away: { rank: 5, played: 10, form: 'WLDWL', gf_pg: 1.4, ga_pg: 1.3, home_gf_pg: 1.6, away_gf_pg: 1.2, xg_pg: null, rest_days: 4, ppg: 1.4 },
  h2h: [],
};

describe('Paras kerroin', () => {
  it('poimii korkeimman kertoimen per kohde ja kirjaa toimiston', () => {
    const best = bestOdds(ROWS);
    expect(best.home).toBe(2.15);
    expect(best.home_book).toBe('Unibet');
    expect(best.draw).toBe(3.50);
    expect(best.draw_book).toBe('Betsson');
    expect(best.away).toBe(3.70);
    expect(best.away_book).toBe('Betsson');
  });

  it('paras kerroin on aina >= yksittäisen toimiston kerroin', () => {
    const best = bestOdds(ROWS);
    for (const r of ROWS) {
      expect(best.home).toBeGreaterThanOrEqual(r.home);
      expect(best.draw).toBeGreaterThanOrEqual(r.draw);
      expect(best.away).toBeGreaterThanOrEqual(r.away);
    }
  });

  it('tyhjä lista → nollat, ei kaadu', () => {
    const best = bestOdds([]);
    expect(best.home).toBe(0);
    expect(best.home_effective).toBe(0);
    expect(best.home_book).toBeNull();
  });

  it('ilman komissiota effective on sama kuin näytettävä kerroin', () => {
    const best = bestOdds(ROWS);
    expect(best.home_effective).toBeCloseTo(best.home, 6);
  });
});

describe('Pörssin komissio', () => {
  it('laskee voitto-osasta, ei panoksesta', () => {
    // 9.60 @ 5 % → 1 + 8.60 × 0.95 = 9.17
    expect(effectiveOdds(9.60, 0.05)).toBeCloseTo(9.17, 2);
    // Panos palautuu aina täysimääräisenä → kerroin ei mene alle 1:n
    expect(effectiveOdds(1.50, 0.05)).toBeCloseTo(1.475, 3);
  });

  it('komissio 0 ei muuta kerrointa', () => {
    expect(effectiveOdds(3.40, 0)).toBe(3.40);
  });

  it('paras kerroin valitaan komission JÄLKEEN', () => {
    // Pörssi näyttää paremman hinnan mutta häviää komission jälkeen
    const exchange = { ...row('Betfair', 'betfair_ex_eu', 9.60, 4.0, 4.0), commission: 0.05 };
    const book = row('Unibet', 'unibet_se', 9.30, 4.0, 4.0);
    const best = bestOdds([exchange, book]);
    expect(best.home_book).toBe('Unibet'); // 9.30 > 9.17
    expect(best.home).toBe(9.30);

    // ...ja voittaa kun ero on riittävän suuri
    const bigger = { ...row('Betfair', 'betfair_ex_eu', 10.5, 4.0, 4.0), commission: 0.05 };
    expect(bestOdds([bigger, book]).home_book).toBe('Betfair');
  });

  it('edge lasketaan komission jälkeisestä hinnasta — ei yliarvioi pörssiä', () => {
    const exchange = { ...row('Betfair', 'betfair_ex_eu', 9.60, 4.0, 4.0), commission: 0.05 };
    const market = buildMarketView([exchange]);
    const model = buildModelView(null, market.sharp);
    const analysis = buildAnalysisView(model, market, bestOdds([exchange]), 100);
    const home = analysis.edges.find((e) => e.side === 'home')!;

    expect(home.odds).toBe(9.60); // näytetään mitä Betfair näyttää
    expect(home.odds_effective).toBeCloseTo(9.17, 2); // lasketaan mitä se maksaa
    expect(home.edge).toBeCloseTo(home.model_prob * home.odds_effective - 1, 4);
    // Raa'alla hinnalla laskettu edge olisi selvästi suurempi
    expect(home.model_prob * home.odds - 1).toBeGreaterThan(home.edge);
  });

  it('kate lasketaan komission jälkeen — pörssi ei näytä katetta pienempänä kuin se on', () => {
    const exchange = [
      { ...row('Betfair', 'betfair_ex_eu', 2.10, 3.50, 3.60), commission: 0.05 },
    ];
    const withCommission = buildMarketView(exchange).margin;
    const withoutCommission = buildMarketView([row('Betfair', 'betfair_ex_eu', 2.10, 3.50, 3.60)]).margin;
    expect(withCommission).toBeGreaterThan(withoutCommission);
  });
});

describe('Markkinanäkymä', () => {
  it('parhaiden kertoimien kate on pienempi kuin yksittäisen toimiston', () => {
    const shopped = buildMarketView(ROWS).margin;
    const single = buildMarketView([ROWS[0]]).margin;
    expect(shopped).toBeLessThan(single);
  });

  it('tunnistaa Pinnaclen sharp-lähteeksi', () => {
    expect(buildMarketView(ROWS).sharp_source).toBe('Pinnacle');
  });

  it('tyhjillä kertoimilla kate on 0 eikä NaN', () => {
    const mv = buildMarketView([]);
    expect(mv.margin).toBe(0);
    expect(mv.sharp).toBeNull();
  });
});

describe('Mallinäkymä', () => {
  const poisson = predictPoisson({ attack: 1.3, defense: 0.8 }, { attack: 1.0, defense: 1.2 });

  it('blendattu ja pelkkä Poisson molemmat näkyvissä', () => {
    const market = buildMarketView(ROWS);
    const model = buildModelView(poisson, market.sharp);
    expect(model.probs.home + model.probs.draw + model.probs.away).toBeCloseTo(1.0, 2);
    const pp = model.poisson_probs!;
    expect(pp.home + pp.draw + pp.away).toBeCloseTo(1.0, 2);
    expect(model.method).toBe('poisson+sharp-blend');
  });

  it('ilman Poissonia malli on market-only ja nojaa pelkkään markkinaan', () => {
    const market = buildMarketView(ROWS);
    const model = buildModelView(null, market.sharp);
    expect(model.method).toBe('market-only');
    expect(model.poisson_probs).toBeNull();
    expect(model.lambda_home).toBeNull();
    expect(model.lambda_away).toBeNull();
    expect(model.over25).toBeNull();
    expect(model.btts).toBeNull();
    expect(model.blend_weight).toBe(0);
    expect(model.top_scores).toEqual([]);
    // Mallin todennäköisyydet ovat täsmälleen sharp-ankkurin devigatut luvut
    expect(model.probs.home).toBeCloseTo(market.sharp!.home, 3);
    expect(model.probs.home + model.probs.draw + model.probs.away).toBeCloseTo(1.0, 2);
  });

  it('ilman Poissonia JA ilman markkinaa kaatuu selkeällä virheellä', () => {
    expect(() => buildModelView(null, null)).toThrow(/Poisson-ennuste tai markkina-ankkuri/);
  });

  it('ilman markkinaa metodi on pelkkä poisson ja paino 1', () => {
    const model = buildModelView(poisson, null);
    expect(model.method).toBe('poisson');
    expect(model.blend_weight).toBe(1);
  });

  it('säädöt kulkevat läpi näkyviin', () => {
    const model = buildModelView(poisson, null, [{ reason: 'testisyy', delta_lambda_away: -0.09 }]);
    expect(model.adjustments).toHaveLength(1);
    expect(model.adjustments[0].reason).toBe('testisyy');
  });
});

describe('Analyysinäkymä', () => {
  const poisson = predictPoisson({ attack: 1.3, defense: 0.8 }, { attack: 1.0, defense: 1.2 });
  const market = buildMarketView(ROWS);
  const model = buildModelView(poisson, market.sharp);
  const analysis = buildAnalysisView(model, market, bestOdds(ROWS), 100);

  it('sisältää tarkalleen kolme kohdetta', () => {
    expect(analysis.edges).toHaveLength(3);
    expect(analysis.edges.map((e) => e.side)).toEqual(['home', 'draw', 'away']);
  });

  it('edge vastaa kaavaa model_prob × kerroin − 1 (komission jälkeisestä hinnasta)', () => {
    for (const e of analysis.edges) {
      expect(e.edge).toBeCloseTo(e.model_prob * e.odds_effective - 1, 3);
    }
  });

  it('lippu seuraa kynnyksiä 3 % ja 5 %', () => {
    for (const e of analysis.edges) {
      const expected = e.edge > 0.05 ? 'strong' : e.edge > 0.03 ? 'candidate' : 'none';
      expect(e.flag).toBe(expected);
    }
  });

  it('panossuositus on nolla kun edge ei ole positiivinen', () => {
    for (const e of analysis.edges) {
      if (e.edge <= 0) expect(e.stake_suggestion).toBe(0);
    }
  });

  it('panossuositus vain kynnyksen ylittäville — lippu ja panos samaa mieltä', () => {
    // Alle 3 %:n edge on mallin virherajojen sisällä: Kelly antaisi siitä
    // positiivisen panoksen, mutta lippu sanoo "none". Ristiriita korjattu.
    for (const e of analysis.edges) {
      if (e.flag === 'none') expect(e.stake_suggestion).toBe(0);
      else expect(e.stake_suggestion).toBeGreaterThan(0);
    }
  });

  it('nollan ja kolmen prosentin väliin jäävä edge ei saa panossuositusta', () => {
    // Rakennetaan tilanne jossa edge on tarkalleen tällä välillä
    const tiny = buildAnalysisView(
      { ...model, probs: { home: 0.478, draw: 0.28, away: 0.242 } },
      market,
      {
        home: 2.13,
        draw: 3.0,
        away: 3.0,
        home_effective: 2.13,
        draw_effective: 3.0,
        away_effective: 3.0,
        home_book: 'X',
        draw_book: 'X',
        away_book: 'X',
      },
      1000
    );
    const homeEdge = tiny.edges.find((e) => e.side === 'home')!;
    expect(homeEdge.edge).toBeGreaterThan(0);
    expect(homeEdge.edge).toBeLessThan(0.03);
    expect(homeEdge.flag).toBe('none');
    expect(homeEdge.stake_suggestion).toBe(0);
  });

  it('panos ei koskaan ylitä 2 % kassasta', () => {
    const big = buildAnalysisView(model, market, bestOdds(ROWS), 1000);
    for (const e of big.edges) expect(e.stake_suggestion).toBeLessThanOrEqual(20);
  });

  it('kirjaa millä kassalla panos laskettiin', () => {
    expect(analysis.bankroll_basis).toBe(100);
  });

  it('nollakertoimilla edge on negatiivinen eikä NaN', () => {
    const empty = buildAnalysisView(model, buildMarketView([]), bestOdds([]), 100);
    for (const e of empty.edges) {
      expect(Number.isNaN(e.edge)).toBe(false);
      expect(e.stake_suggestion).toBe(0);
    }
  });
});

describe('Ottelukortti ja snapshot', () => {
  const card = buildMatchCard({
    id: 'test:2026-08-14:A-B',
    league: 'Testiliiga',
    kickoff: '2026-08-14T18:00:00.000Z',
    home: { name: 'Koti', short: 'KOT', color: '#ff0000' },
    away: { name: 'Vieras', short: 'VIE', color: '#0000ff' },
    odds: ROWS,
    poisson: predictPoisson({ attack: 1.2, defense: 0.9 }, { attack: 1.0, defense: 1.1 }),
    stats: STATS,
  });

  it('kortti läpäisee validoinnin snapshotissa', () => {
    const snap = buildSnapshot([card], 'mock', '2026-08-14T09:00:00.000Z');
    expect(validateSnapshot(snap)).toEqual([]);
  });

  it('market-only-kortti ilman tilastoja läpäisee validoinnin', () => {
    // Tämä on se tila jossa oikeat Veikkausliigan kertoimet nyt tulevat:
    // kertoimet on, tilastolähdettä ei
    const marketOnly = buildMatchCard({
      id: 'soccer_finland_veikkausliiga:2026-08-14:VPS-TPS',
      league: 'Veikkausliiga',
      kickoff: '2026-08-14T15:00:00.000Z',
      home: { name: 'VPS Vaasa', short: 'VPS', color: '#C8102E' },
      away: { name: 'TPS Turku', short: 'TPS', color: '#000000' },
      odds: ROWS,
      poisson: null,
      stats: null,
    });
    const snap = buildSnapshot([marketOnly], 'live', '2026-08-14T09:00:00.000Z', ['The Odds API']);
    expect(validateSnapshot(snap)).toEqual([]);
    expect(marketOnly.model.method).toBe('market-only');
    expect(marketOnly.stats).toBeNull();
    expect(marketOnly.analysis.edges).toHaveLength(3);
  });

  it('validointi hylkää market-only-mallin jossa poisson_probs ei ole null', () => {
    const snap = buildSnapshot(
      [
        buildMatchCard({
          id: 'x',
          league: 'L',
          kickoff: '2026-08-14T15:00:00.000Z',
          home: { name: 'A', short: 'A', color: '#000' },
          away: { name: 'B', short: 'B', color: '#fff' },
          odds: ROWS,
          poisson: null,
          stats: null,
        }),
      ],
      'mock',
      '2026-08-14T09:00:00.000Z'
    );
    const bad = JSON.parse(JSON.stringify(snap));
    bad.matches[0].model.poisson_probs = { home: 0.4, draw: 0.3, away: 0.3 };
    expect(validateSnapshot(bad).some((e) => e.includes('market-only'))).toBe(true);
  });

  it('snapshot kerää sarjat automaattisesti', () => {
    const snap = buildSnapshot([card], 'mock', '2026-08-14T09:00:00.000Z');
    expect(snap.leagues).toEqual(['Testiliiga']);
    expect(snap.schema_version).toBe(SCHEMA_VERSION);
  });
});

describe('Validointi hylkää rikkinäisen datan', () => {
  const valid = buildSnapshot(
    [
      buildMatchCard({
        id: 'test:1',
        league: 'L',
        kickoff: '2026-08-14T18:00:00.000Z',
        home: { name: 'A', short: 'A', color: '#000' },
        away: { name: 'B', short: 'B', color: '#fff' },
        odds: ROWS,
        poisson: predictPoisson({ attack: 1, defense: 1 }, { attack: 1, defense: 1 }),
        stats: STATS,
      }),
    ],
    'mock',
    '2026-08-14T09:00:00.000Z'
  );

  const clone = () => JSON.parse(JSON.stringify(valid));

  it('kelvollinen data ei tuota virheitä', () => {
    expect(validateSnapshot(valid)).toEqual([]);
  });

  it('väärä schema_version havaitaan', () => {
    const bad = clone();
    bad.schema_version = 99;
    expect(validateSnapshot(bad).some((e) => e.includes('schema_version'))).toBe(true);
  });

  it('kerroin <= 1 havaitaan', () => {
    const bad = clone();
    bad.matches[0].odds[0].home = 0.95;
    expect(validateSnapshot(bad).some((e) => e.includes('kerroin pitää olla > 1'))).toBe(true);
  });

  it('todennäköisyydet jotka eivät summaudu ykköseen havaitaan', () => {
    const bad = clone();
    bad.matches[0].model.probs = { home: 0.9, draw: 0.9, away: 0.9 };
    expect(validateSnapshot(bad).some((e) => e.includes('summa'))).toBe(true);
  });

  it('kelvoton kickoff havaitaan', () => {
    const bad = clone();
    bad.matches[0].kickoff = 'eilen joskus';
    expect(validateSnapshot(bad).some((e) => e.includes('kickoff'))).toBe(true);
  });

  it('puuttuva joukkueen nimi havaitaan', () => {
    const bad = clone();
    bad.matches[0].home.name = '';
    expect(validateSnapshot(bad).some((e) => e.includes('joukkueen nimi'))).toBe(true);
  });

  it('vajaa edge-lista havaitaan', () => {
    const bad = clone();
    bad.matches[0].analysis.edges = bad.matches[0].analysis.edges.slice(0, 2);
    expect(validateSnapshot(bad).some((e) => e.includes('3 riviä'))).toBe(true);
  });

  it('ei-objekti hylätään kaatumatta', () => {
    expect(validateSnapshot(null).length).toBeGreaterThan(0);
    expect(validateSnapshot('roska').length).toBeGreaterThan(0);
  });
});

describe('Historiatiedoston nimeäminen', () => {
  // Suora yksikkötesti nimenmuodostuksesta ilman levylle kirjoittamista.
  // Sama laskenta kuin writeSnapshot():ssa — jos tämä hajoaa, CLV-data katoaa.
  const stampOf = (generatedAt: string) => `${generatedAt.slice(0, 16).replace(':', '')}Z`;

  it('sisältää kellonajan, ei pelkkää päivämäärää', () => {
    expect(stampOf('2026-08-14T15:58:27.727Z')).toBe('2026-08-14T1558Z');
  });

  it('saman päivän kaksi ajoa saavat eri nimen — avauslinja ei ylikirjoitu', () => {
    const morning = stampOf('2026-08-14T08:00:00.000Z');
    const afternoon = stampOf('2026-08-14T14:00:00.000Z');
    expect(morning).not.toBe(afternoon);
    expect(morning).toBe('2026-08-14T0800Z');
    expect(afternoon).toBe('2026-08-14T1400Z');
  });

  it('nimet järjestyvät aakkosellisesti aikajärjestykseen', () => {
    const stamps = ['2026-08-14T14:00:00.000Z', '2026-08-14T08:00:00.000Z', '2026-08-15T08:00:00.000Z'].map(stampOf);
    expect([...stamps].sort()).toEqual(['2026-08-14T0800Z', '2026-08-14T1400Z', '2026-08-15T0800Z']);
  });

  it('nimi kelpaa tiedostonimeksi (ei kaksoispisteitä)', () => {
    expect(stampOf('2026-08-14T15:58:27.727Z')).not.toContain(':');
  });
});

describe('Esimerkkisnapshot (mock)', () => {
  const snap = buildMockSnapshot();

  it('läpäisee validoinnin', () => {
    expect(validateSnapshot(snap)).toEqual([]);
  });

  it('on merkitty mockiksi jotta UI voi varoittaa', () => {
    expect(snap.source).toBe('mock');
  });

  it('sisältää otteluita molemmista sarjoista', () => {
    expect(snap.leagues).toContain('Valioliiga');
    expect(snap.leagues).toContain('Veikkausliiga');
  });

  it('on deterministinen — sama tulos joka ajolla', () => {
    expect(JSON.stringify(buildMockSnapshot())).toBe(JSON.stringify(snap));
  });

  it('jokaisella ottelulla on kertoimet, malli ja analyysi', () => {
    for (const m of snap.matches) {
      expect(m.odds.length).toBeGreaterThan(0);
      expect(m.analysis.edges).toHaveLength(3);
      expect(m.model.top_scores.length).toBeGreaterThan(0);
    }
  });

  it('loukkaantumisuutinen tuottaa näkyvän λ-säädön', () => {
    const withInjury = snap.matches.find((m) => m.news.some((n) => n.event_type === 'injury'));
    expect(withInjury?.model.adjustments.length).toBeGreaterThan(0);
  });
});
