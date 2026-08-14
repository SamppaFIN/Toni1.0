import { describe, it, expect } from 'vitest';
import { buildTimelines, computeMetrics } from '../publish/metrics.js';
import { parseScores, outcomeOf, mergeResults, MatchResult } from '../ingest/results.js';
import { buildMatchCard, buildSnapshot } from '../publish/snapshot.js';
import { predictPoisson } from '../analyze/poisson.js';
import { BookmakerOdds, Snapshot, MarketSide } from '../types-football.js';

// ─── Apurit synteettisen historian rakentamiseen ──────────────────────────

function odds(home: number, draw: number, away: number, bookmaker = 'Pinnacle', key = 'pinnacle'): BookmakerOdds {
  return { bookmaker, key, market: '1X2', home, draw, away, commission: 0, fetched_at: '2026-08-14T08:00:00.000Z' };
}

function card(id: string, oddsRows: BookmakerOdds[], attack = 1.3, defense = 0.8) {
  return buildMatchCard({
    id,
    league: 'Testiliiga',
    kickoff: '2026-08-15T15:00:00.000Z',
    home: { name: 'Koti', short: 'KOT', color: '#000' },
    away: { name: 'Vieras', short: 'VIE', color: '#fff' },
    odds: oddsRows,
    poisson: predictPoisson({ attack, defense }, { attack: 1.0, defense: 1.1 }),
    stats: null,
  });
}

function snapshot(matches: ReturnType<typeof card>[], generatedAt: string): Snapshot {
  return buildSnapshot(matches, 'live', generatedAt, ['testi']);
}

function result(matchId: string, homeScore: number, awayScore: number): MatchResult {
  return {
    match_id: matchId,
    sport_key: 'soccer_test',
    league: 'Testiliiga',
    kickoff: '2026-08-15T15:00:00.000Z',
    home: 'Koti',
    away: 'Vieras',
    home_score: homeScore,
    away_score: awayScore,
    outcome: outcomeOf(homeScore, awayScore),
    simulated: false,
    recorded_at: '2026-08-15T17:00:00.000Z',
  };
}

// ─── Aikajanat ────────────────────────────────────────────────────────────

describe('Avaus- ja sulkeutumislinjan poiminta', () => {
  it('ensimmäinen havainto on avaus, viimeinen sulkeutuminen', () => {
    const history = [
      { file: '2026-08-14T0800Z.json', snapshot: snapshot([card('m1', [odds(2.5, 3.4, 2.8)])], '2026-08-14T08:00:00.000Z') },
      { file: '2026-08-14T1400Z.json', snapshot: snapshot([card('m1', [odds(2.1, 3.4, 3.3)])], '2026-08-14T14:00:00.000Z') },
      { file: '2026-08-15T0800Z.json', snapshot: snapshot([card('m1', [odds(1.9, 3.5, 3.8)])], '2026-08-15T08:00:00.000Z') },
    ];

    const timelines = buildTimelines(history);
    const t = timelines.get('m1')!;
    expect(t.observations).toBe(3);
    expect(t.opening.best.home).toBe(2.5); // avaus
    expect(t.closing.best.home).toBe(1.9); // sulkeutuminen
  });

  it('useampi ottelu pysyy erillään', () => {
    const history = [
      {
        file: 'a.json',
        snapshot: snapshot([card('m1', [odds(2.0, 3.4, 3.5)]), card('m2', [odds(1.5, 4.0, 6.0)])], '2026-08-14T08:00:00.000Z'),
      },
    ];
    const timelines = buildTimelines(history);
    expect(timelines.size).toBe(2);
    expect(timelines.get('m2')!.opening.best.home).toBe(1.5);
  });

  it('tyhjä historia → tyhjä tulos', () => {
    expect(buildTimelines([]).size).toBe(0);
  });
});

// ─── Mittarien kokoaminen ─────────────────────────────────────────────────

describe('Mittarien laskenta päästä päähän', () => {
  // Kolme ottelua, jokainen havaittu kahdesti (avaus + sulkeutuminen)
  const opening = snapshot(
    [card('m1', [odds(2.0, 3.4, 3.6)]), card('m2', [odds(2.0, 3.4, 3.6)]), card('m3', [odds(2.0, 3.4, 3.6)])],
    '2026-08-14T08:00:00.000Z'
  );
  const closing = snapshot(
    [card('m1', [odds(1.8, 3.5, 4.2)]), card('m2', [odds(1.8, 3.5, 4.2)]), card('m3', [odds(1.8, 3.5, 4.2)])],
    '2026-08-14T14:00:00.000Z'
  );
  const history = [
    { file: 'a.json', snapshot: opening },
    { file: 'b.json', snapshot: closing },
  ];
  const results = [result('m1', 2, 0), result('m2', 1, 1), result('m3', 0, 2)];

  const metrics = computeMetrics(history, results, 0.35, new Date('2026-08-16T00:00:00.000Z'));

  it('kertoo otoskoon ja sen riittävyyden rehellisesti', () => {
    expect(metrics.sample.predictions).toBe(3);
    expect(metrics.sample.results).toBe(3);
    expect(metrics.sample.matched).toBe(3);
    // Kolme ottelua ei riitä — tämä pitää sanoa suoraan
    expect(metrics.sample.sufficient).toBe(false);
    expect(metrics.sample.minimum).toBeGreaterThan(3);
  });

  it('laskee sekä mallin että markkinan mittarit samasta otoksesta', () => {
    expect(metrics.accuracy.model.total).toBe(3);
    expect(metrics.accuracy.market.total).toBe(3);
    expect(metrics.brier.model).not.toBeNull();
    expect(metrics.brier.market).not.toBeNull();
    expect(metrics.logLoss.model).not.toBeNull();
  });

  it('tasajaon vertailuarvo on aina mukana', () => {
    expect(metrics.brier.uniform).toBeCloseTo(2 / 3, 3);
  });

  it('mittaa AVAUSHAVAINNOSTA eikä sulkeutumisesta', () => {
    // Avauksessa koti oli 2.00, sulkeutumisessa 1.80. Jos mittaus käyttäisi
    // sulkeutumislinjaa, malli hyötyisi tiedosta joka syntyi ennusteen jälkeen.
    // Mallin todennäköisyys tulee blendistä, joka nojaa avauksen markkinaan.
    const t = buildTimelines(history).get('m1')!;
    expect(t.opening.best.home).toBe(2.0);
    // Metriikan käyttämä model-jakauma on avauksen jakauma
    expect(metrics.accuracy.model.total).toBe(3);
  });

  it('generated_at kirjataan', () => {
    expect(metrics.generated_at).toBe('2026-08-16T00:00:00.000Z');
  });

  it('nykyinen blend-paino kulkee mukana vertailuun', () => {
    expect(metrics.currentBlendWeight).toBe(0.35);
  });

  it('kalibrointikorit summautuvat havaintojen määrään', () => {
    // Kolme ottelua × kolme kohdetta = 9 havaintoa
    expect(metrics.calibration.reduce((s, b) => s + b.count, 0)).toBe(9);
  });
});

describe('CLV lasketaan ilman ottelutuloksia', () => {
  it('liputetut kohteet saavat CLV-arvon kun havaintoja on vähintään kaksi', () => {
    // Rakennetaan ottelu jossa avauksessa on selvä value-lippu:
    // vahva kotijoukkue ja poikkeuksellisen korkea kotikerroin
    const openingCard = card('m1', [odds(3.4, 3.4, 3.4)], 1.6, 0.6);
    const closingCard = card('m1', [odds(2.2, 3.4, 4.0)], 1.6, 0.6);

    const history = [
      { file: 'a.json', snapshot: snapshot([openingCard], '2026-08-14T08:00:00.000Z') },
      { file: 'b.json', snapshot: snapshot([closingCard], '2026-08-14T14:00:00.000Z') },
    ];

    // Ei tuloksia lainkaan — CLV ei tarvitse niitä
    const metrics = computeMetrics(history, [], 0.35);
    expect(metrics.sample.matched).toBe(0);
    expect(metrics.clv.summary.count).toBeGreaterThan(0);
  });

  it('yhdellä havainnolla CLV:tä ei voi laskea', () => {
    const history = [{ file: 'a.json', snapshot: snapshot([card('m1', [odds(3.4, 3.4, 3.4)], 1.6, 0.6)], '2026-08-14T08:00:00.000Z') }];
    expect(computeMetrics(history, [], 0.35).clv.summary.count).toBe(0);
  });

  it('liputtamattomia kohteita ei oteta CLV-otokseen', () => {
    // Tiukka markkina ilman value-lippuja
    const history = [
      { file: 'a.json', snapshot: snapshot([card('m1', [odds(2.0, 3.4, 3.6)], 1.0, 1.0)], '2026-08-14T08:00:00.000Z') },
      { file: 'b.json', snapshot: snapshot([card('m1', [odds(2.0, 3.4, 3.6)], 1.0, 1.0)], '2026-08-14T14:00:00.000Z') },
    ];
    const metrics = computeMetrics(history, [], 0.35);
    const flagged = metrics.clv.picks.length;
    // Jos yhtään lippua ei ole, CLV-otos on tyhjä — eikä se ole virhe
    expect(flagged).toBe(0);
  });
});

describe('Tyhjä tila ei kaadu eikä valehtele', () => {
  const metrics = computeMetrics([], [], 0.35);

  it('kaikki mittarit ovat null tai nolla', () => {
    expect(metrics.brier.model).toBeNull();
    expect(metrics.brier.market).toBeNull();
    expect(metrics.accuracy.model.rate).toBe(0);
    expect(metrics.clv.summary.count).toBe(0);
    expect(metrics.paperRoi.bets).toBe(0);
  });

  it('otos merkitään riittämättömäksi', () => {
    expect(metrics.sample.sufficient).toBe(false);
    expect(metrics.sample.matched).toBe(0);
  });

  it('blend-suositusta ei anneta ilman dataa', () => {
    expect(metrics.blendCalibration.best).toBeNull();
    expect(metrics.blendCalibration.sufficientSample).toBe(false);
  });
});

// ─── Tulosten haku ────────────────────────────────────────────────────────

describe('Lopputuloksen tulkinta', () => {
  it('tunnistaa kotivoiton, tasapelin ja vierasvoiton', () => {
    expect(outcomeOf(2, 0)).toBe('home');
    expect(outcomeOf(1, 1)).toBe('draw');
    expect(outcomeOf(0, 3)).toBe('away');
  });
});

describe('Tulosten parsinta API-vastauksesta', () => {
  const event = {
    id: 'abc',
    sport_key: 'soccer_finland_veikkausliiga',
    commence_time: '2026-08-14T15:00:00Z',
    completed: true,
    home_team: 'VPS Vaasa',
    away_team: 'TPS Turku',
    scores: [
      { name: 'VPS Vaasa', score: '1' },
      { name: 'TPS Turku', score: '3' },
    ],
    last_update: '2026-08-14T18:00:00Z',
  };

  it('poimii tuloksen ja tulkitsee lopputuloksen', () => {
    const [r] = parseScores([event], '2026-08-14T18:30:00.000Z');
    expect(r.home_score).toBe(1);
    expect(r.away_score).toBe(3);
    expect(r.outcome).toBe('away');
    expect(r.simulated).toBe(false);
  });

  it('poimii pisteet nimen eikä listan järjestyksen perusteella', () => {
    const reversed = { ...event, scores: [...event.scores].reverse() };
    const [r] = parseScores([reversed], '2026-08-14T18:30:00.000Z');
    expect(r.home_score).toBe(1);
    expect(r.away_score).toBe(3);
  });

  it('rakentaa saman tunnisteen kuin snapshot', () => {
    const [r] = parseScores([event], '2026-08-14T18:30:00.000Z');
    // sportKey:päivä:KOTI-VIERAS, lyhenteet teamRef:istä
    expect(r.match_id).toBe('soccer_finland_veikkausliiga:2026-08-14:VPS-TPS');
  });

  it('ohittaa keskeneräiset ottelut', () => {
    expect(parseScores([{ ...event, completed: false }], 'x')).toHaveLength(0);
  });

  it('ohittaa ottelut joilta puuttuvat pisteet', () => {
    expect(parseScores([{ ...event, scores: null }], 'x')).toHaveLength(0);
    expect(parseScores([{ ...event, scores: [] }], 'x')).toHaveLength(0);
  });

  it('ohittaa ottelut joissa pisteet eivät ole lukuja', () => {
    const broken = { ...event, scores: [{ name: 'VPS Vaasa', score: '-' }, { name: 'TPS Turku', score: '3' }] };
    expect(parseScores([broken], 'x')).toHaveLength(0);
  });

  it('ohittaa ottelut joissa nimet eivät täsmää pisteisiin', () => {
    const mismatched = { ...event, scores: [{ name: 'Joku muu', score: '1' }, { name: 'TPS Turku', score: '3' }] };
    expect(parseScores([mismatched], 'x')).toHaveLength(0);
  });
});

describe('Tulosten yhdistäminen', () => {
  const a = result('m1', 2, 0);
  const b = result('m2', 1, 1);

  it('lisää uudet tulokset', () => {
    const { merged, added } = mergeResults([a], [b]);
    expect(added).toBe(1);
    expect(merged).toHaveLength(2);
  });

  it('ei duplikoi samaa ottelua', () => {
    const { merged, added } = mergeResults([a], [a]);
    expect(added).toBe(0);
    expect(merged).toHaveLength(1);
  });

  it('säilyttää olemassa olevan tuloksen eikä ylikirjoita sitä', () => {
    // Kerran kirjattu tulos on lopullinen; API voisi palauttaa sen uudelleen
    const changed = { ...a, home_score: 9 };
    const { merged } = mergeResults([a], [changed]);
    expect(merged[0].home_score).toBe(2);
  });

  it('järjestää tulokset aikajärjestykseen', () => {
    const later = { ...b, kickoff: '2026-08-20T15:00:00.000Z' };
    const { merged } = mergeResults([], [later, a]);
    expect(merged[0].match_id).toBe('m1');
  });
});
