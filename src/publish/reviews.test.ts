// Kierrosarviointi (tiketti #76)
//
// Ydinkysymys: erottaako moduuli epaonnen vaarasta analyysista? Testit on
// kirjoitettu niin etta kumpikin tapaus on nimetty omakseen -- jos raja
// liukuu, testi kertoo kumpaan suuntaan.

import { describe, it, expect } from 'vitest';
import {
  leadingMinutes,
  lastLeadMinute,
  reviewPick,
  stakeProfit,
  biggestFlag,
  parseMinute,
  parseGoals,
  scoreFromText,
  groupRounds,
  buildMatchReview,
  FULL_TIME,
  LATE_GAME,
  Goal,
  MatchReview,
} from './reviews.js';
import type { OddsTimeline, OddsPoint } from './odds-history.js';

const g = (minute: number, side: 'home' | 'away'): Goal => ({ minute, side });

describe('leadingMinutes', () => {
  it('maaliton ottelu on tasan koko ajan', () => {
    expect(leadingMinutes([])).toEqual({ home: 0, draw: FULL_TIME, away: 0 });
  });

  it('summa on ottelun pituus', () => {
    const m = leadingMinutes([g(15, 'home'), g(60, 'away'), g(80, 'home')]);
    expect(m.home + m.draw + m.away).toBe(FULL_TIME);
  });

  it('yksi kotimaali 15. minuutilla: tasan 15, koti 75', () => {
    expect(leadingMinutes([g(15, 'home')])).toEqual({ home: 75, draw: 15, away: 0 });
  });

  it('tasoitus palauttaa tasapelin', () => {
    const m = leadingMinutes([g(10, 'home'), g(40, 'away')]);
    expect(m).toEqual({ home: 30, draw: 60, away: 0 });
  });

  it('lisaajan maali pidentaa ottelua eika jaa nollaan', () => {
    const m = leadingMinutes([g(95, 'home')]);
    expect(m.draw).toBe(95);
    expect(m.home).toBe(0); // 95. minuutin maali, ottelu paattyy 95
    expect(m.home + m.draw + m.away).toBe(95);
  });

  it('jarjestamaton syote jarjestetaan', () => {
    expect(leadingMinutes([g(60, 'away'), g(15, 'home')])).toEqual(
      leadingMinutes([g(15, 'home'), g(60, 'away')])
    );
  });
});

describe('lastLeadMinute', () => {
  it('koko ottelun johtanut: viimeinen minuutti on loppu', () => {
    expect(lastLeadMinute([g(15, 'home')], 'home')).toBe(FULL_TIME);
  });

  it('ei koskaan johtanut -> null', () => {
    expect(lastLeadMinute([g(15, 'home')], 'away')).toBeNull();
  });

  it('johti 83 minuuttiin asti', () => {
    expect(lastLeadMinute([g(5, 'home'), g(88, 'away')], 'home')).toBe(88);
  });

  it('tasapeli maalittomassa ottelussa kestaa loppuun', () => {
    expect(lastLeadMinute([], 'draw')).toBe(FULL_TIME);
  });
});

describe('reviewPick — epaonni vs. vaara analyysi', () => {
  it('VAARA ANALYYSI: kohde ei ollut voitolla kertaakaan', () => {
    // Arsenal-Coventry 3-0, liputettuna vierasvoitto @21
    const r = reviewPick('away', 'home', 21, [g(15, 'home'), g(50, 'home'), g(70, 'home')], true);
    expect(r.verdict).toBe('ei_koskaan_voitolla');
    expect(r.minutes_leading).toBe(0);
    expect(r.won).toBe(false);
  });

  it('EPAONNI: johti loppuvaiheeseen asti ja kaatui', () => {
    // Newcastle-Liverpool 2-2, koti johti 83 minuuttia
    const r = reviewPick('home', 'draw', 4, [g(5, 'home'), g(88, 'away')], true);
    expect(r.verdict).toBe('kaatui_lopussa');
    expect(r.minutes_leading).toBeGreaterThan(80);
  });

  it('valimuoto: oli voitolla mutta ei loppuvaiheessa', () => {
    const r = reviewPick('home', 'away', 3, [g(5, 'home'), g(30, 'away'), g(50, 'away')], true);
    expect(r.verdict).toBe('oli_voitolla');
    expect(r.last_lead_minute).toBeLessThan(LATE_GAME);
  });

  it('osunut kohde on aina osui, riippumatta minuuteista', () => {
    const r = reviewPick('home', 'home', 2.5, [g(89, 'home')], true);
    expect(r.verdict).toBe('osui');
    expect(r.won).toBe(true);
  });

  it('ILMAN AIKAJANAA verdikti on ei_tietoa, EI oli_voitolla', () => {
    // Tama on koko pointti: puuttuvaa tietoa ei saa esittaa havaintona
    const r = reviewPick('away', 'home', 5, [], false);
    expect(r.verdict).toBe('ei_tietoa');
    expect(r.minutes_leading).toBe(0);
    expect(r.last_lead_minute).toBeNull();
  });

  it('share_leading on osuus valilla 0-1', () => {
    const r = reviewPick('home', 'away', 3, [g(5, 'home'), g(50, 'away')], true);
    expect(r.share_leading).toBeGreaterThan(0);
    expect(r.share_leading).toBeLessThanOrEqual(1);
  });

  it('hyvaksyy oman peliajan ja loppuvaiheen rajan (jaakiekon uudelleenkaytto)', () => {
    // Koti johtaa minuutista 5 minuuttiin 46 (>= 45 = jaakiekon oma
    // loppuvaiheraja), sitten vieras tasoittaa ja jaa johtoon lopun ajaksi
    const r = reviewPick('home', 'away', 3, [g(5, 'home'), g(46, 'away')], true, 60, 45);
    expect(r.verdict).toBe('kaatui_lopussa');
  });
});

describe('stakeProfit — paperitulos jos suositeltu panos olisi lyöty', () => {
  it('voitto = panos × (kerroin-1)', () => {
    expect(stakeProfit(true, 10, 2.5)).toBe(15);
  });

  it('havio = -panos', () => {
    expect(stakeProfit(false, 10, 2.5)).toBe(-10);
  });

  it('panos 0 -> tulos 0 riippumatta tuloksesta', () => {
    expect(stakeProfit(true, 0, 5)).toBe(0);
    expect(stakeProfit(false, 0, 5)).toBe(0);
  });
});

describe('biggestFlag — isoin liputettu kohde avaushavainnosta', () => {
  const point = (over: Record<string, unknown> = {}): OddsPoint =>
    ({
      at: 'T',
      odds: { home: 1.5, draw: 4, away: 6 },
      book: { home: 'A', draw: 'B', away: 'C' },
      model: { home: 0.5, draw: 0.25, away: 0.25 },
      implied: { home: 0.6, draw: 0.2, away: 0.2 },
      edge: { home: 0.02, draw: 0.08, away: 0.04 },
      flag: { home: 'none', draw: 'strong', away: 'candidate' },
      stake: { home: 0, draw: 3, away: 1 },
      ...over,
    }) as unknown as OddsPoint;

  it('valitsee suurimman edgen liputetuista, ei ensimmaisen eika viimeisen', () => {
    const best = biggestFlag(point())!;
    expect(best.side).toBe('draw');
    expect(best.edge).toBe(0.08);
    expect(best.stake).toBe(3);
  });

  it('ei liputettuja kohteita -> null', () => {
    expect(biggestFlag(point({ flag: { home: 'none', draw: 'none', away: 'none' } }))).toBeNull();
  });

  it('kertoimeton kohde ei kelpaa vaikka olisi liputettu', () => {
    const best = biggestFlag(point({ odds: { home: 1.5, away: 6 }, flag: { home: 'none', draw: 'strong', away: 'candidate' } }))!;
    // draw:lla ei ole kerrointa -> away voittaa vaikka pienempi edge
    expect(best.side).toBe('away');
  });
});

describe('parseMinute — clock.value on SEKUNTEJA', () => {
  it('displayValue on ensisijainen', () => {
    expect(parseMinute("15'", 874)).toBe(15);
  });

  it('sekunnit muunnetaan minuuteiksi kun displayValue puuttuu', () => {
    // 874 s = 14.6 min -> 15. Ilman muunnosta tama olisi 874. minuutti
    expect(parseMinute(undefined, 874)).toBe(15);
  });

  it('lisaaika luetaan ensimmaisesta luvusta', () => {
    expect(parseMinute("90'+3'", undefined)).toBe(90);
  });

  it('kelvoton -> null', () => {
    expect(parseMinute(undefined, undefined)).toBeNull();
    expect(parseMinute('', 0)).toBeNull();
  });
});

describe('scoreFromText', () => {
  it('lukee pistetilanteen ESPN:n tekstista', () => {
    expect(scoreFromText('Goal! Arsenal 1, Coventry City 0. Kai Havertz...', 'Arsenal', 'Coventry City')).toEqual({ h: 1, a: 0 });
  });

  it('erikoismerkit nimessa eivat riko hakua', () => {
    expect(scoreFromText('Goal! B. Mönchengladbach 2, F.C. Köln 1.', 'B. Mönchengladbach', 'F.C. Köln')).toEqual({ h: 2, a: 1 });
  });

  it('tuntematon muoto -> null', () => {
    expect(scoreFromText('Goal!', 'A', 'B')).toBeNull();
  });
});

describe('parseGoals', () => {
  const ev = (min: string, team: string, text: string, extra = {}) => ({
    scoringPlay: true,
    clock: { displayValue: min },
    team: { id: team },
    text,
    ...extra,
  });

  it('poimii maalit tekstin pistetilanteesta', () => {
    const goals = parseGoals(
      { keyEvents: [ev("15'", '359', 'Goal! Arsenal 1, Coventry City 0.'), ev("50'", '388', 'Goal! Arsenal 1, Coventry City 1.')] },
      '359',
      'Arsenal',
      'Coventry City'
    );
    expect(goals).toEqual([{ minute: 15, side: 'home' }, { minute: 50, side: 'away' }]);
  });

  it('OMA MAALI menee sille jonka hyvaksi se meni, ei tekijalle', () => {
    // team.id = 388 (vieras) mutta pistetilanne kertoo kotijoukkueen johtavan
    const goals = parseGoals(
      { keyEvents: [ev("30'", '388', 'Own Goal by X (Coventry City). Arsenal 1, Coventry City 0.')] },
      '359',
      'Arsenal',
      'Coventry City'
    );
    expect(goals).toEqual([{ minute: 30, side: 'home' }]);
  });

  it('rangaistuspotkukilpailu EI lasketa', () => {
    const goals = parseGoals(
      { keyEvents: [ev("120'", '359', 'Goal! A 1, B 0.', { shootout: true })] },
      '359',
      'A',
      'B'
    );
    expect(goals).toHaveLength(0);
  });

  it('ei-maalitapahtumat ohitetaan', () => {
    const goals = parseGoals(
      { keyEvents: [{ scoringPlay: false, clock: { displayValue: "10'" }, team: { id: '359' } }] },
      '359'
    );
    expect(goals).toHaveLength(0);
  });

  it('team.id varalla kun tekstia ei voi lukea', () => {
    const goals = parseGoals({ keyEvents: [ev("22'", '359', 'Goal!')] }, '359', 'A', 'B');
    expect(goals).toEqual([{ minute: 22, side: 'home' }]);
  });

  it('puuttuva keyEvents -> tyhja', () => {
    expect(parseGoals({}, '1')).toHaveLength(0);
    expect(parseGoals(null, '1')).toHaveLength(0);
  });
});

describe('buildMatchReview', () => {
  const timeline = (over: Partial<OddsTimeline> = {}): OddsTimeline => ({
    match_id: 'soccer_epl:2026-08-21:ARS-COV',
    league: 'Valioliiga',
    sport_key: 'soccer_epl',
    kickoff: '2026-08-21T19:00:00.000Z',
    home: 'Arsenal',
    away: 'Coventry City',
    points: [
      {
        at: '2026-08-19T08:00:00.000Z',
        odds: { home: 1.21, draw: 8.2, away: 21 },
        book: { away: 'Pinnacle' },
        model: { home: 0.5, draw: 0.25, away: 0.25 },
        implied: { home: 0.8, draw: 0.12, away: 0.08 },
        edge: { away: 0.848 },
        flag: { home: 'none', draw: 'none', away: 'strong' },
        stake: { away: 2 },
      },
    ],
    result: { outcome: 'home', home_score: 3, away_score: 0 },
    ...over,
  });

  it('rakentaa arvion liputetusta kohteesta', () => {
    const r = buildMatchReview(timeline(), [g(15, 'home'), g(50, 'home'), g(70, 'home')])!;
    expect(r.pick?.side).toBe('away');
    expect(r.pick?.verdict).toBe('ei_koskaan_voitolla');
    expect(r.pick?.profit).toBe(-2); // panos 2€, havisi -> -2€
    expect(r.score).toBe('3–0');
    expect(r.model_correct).toBe(true); // malli sanoi home 0.5
    expect(r.market_correct).toBe(true);
  });

  it('ilman tulosta ei arviota', () => {
    expect(buildMatchReview(timeline({ result: null }), [])).toBeNull();
  });

  it('ilman havaintoja ei arviota', () => {
    expect(buildMatchReview(timeline({ points: [] }), [])).toBeNull();
  });

  it('liputtamattomat kohteet eivat paady arvioon', () => {
    const t = timeline();
    t.points[0].flag = { home: 'none', draw: 'none', away: 'none' };
    expect(buildMatchReview(t, [])!.pick).toBeNull();
  });

  it('USEAMPI LIPUTETTU KOHDE: vain isoin edge paatyy arvioon', () => {
    const t = timeline();
    // home liputettu mutta pienemmalla edgella kuin away — vain away:n
    // pitaa nakya arviossa, ei molempia
    t.points[0].flag = { home: 'candidate', draw: 'none', away: 'strong' };
    t.points[0].edge = { home: 0.04, away: 0.848 };
    const r = buildMatchReview(t, [])!;
    expect(r.pick?.side).toBe('away');
  });

  it('arvio luetaan AVAUSHAVAINNOSTA eika viimeisesta', () => {
    const t = timeline();
    t.points.push({ ...t.points[0], at: '2026-08-21T14:00:00.000Z', flag: { home: 'strong' }, odds: { home: 1.24 } });
    const r = buildMatchReview(t, [])!;
    expect(r.pick?.side).toBe('away'); // avaus, ei sulku
  });

  it('model_extra periytyy avaushavainnon opening-kentasta', () => {
    const t = timeline({
      opening: {
        books: [],
        best: null,
        stats: null,
        edges: [],
        home_team: null,
        away_team: null,
        model_extra: {
          method: 'poisson', lambda_home: 1.4, lambda_away: 0.9, poisson_probs: null,
          blend_weight: 0.4, over25: null, btts: null, adjustments: [{ reason: 'testi' }],
        },
      },
    });
    const r = buildMatchReview(t, [])!;
    expect(r.model_extra?.adjustments).toEqual([{ reason: 'testi' }]);
  });

  it('ilman opening-kenttaa model_extra on null', () => {
    const r = buildMatchReview(timeline(), [])!;
    expect(r.model_extra).toBeNull();
  });
});

describe('groupRounds', () => {
  const m = (date: string, correct: boolean, pick: MatchReview['pick'] = null): MatchReview =>
    ({
      match_id: date + correct,
      kickoff: `${date}T15:00:00.000Z`,
      model_correct: correct,
      market_correct: false,
      pick,
    }) as unknown as MatchReview;

  const pick = (over: Partial<NonNullable<MatchReview['pick']>> = {}): NonNullable<MatchReview['pick']> =>
    ({
      side: 'home', odds: 2.5, book: null, edge: 0.05, flag: 'strong', stake: 10,
      won: true, minutes_leading: 90, share_leading: 1, last_lead_minute: 90,
      verdict: 'osui', profit: 15,
      ...over,
    }) as NonNullable<MatchReview['pick']>;

  it('ryhmittelee paivittain, uusin ensin', () => {
    const rounds = groupRounds([m('2026-08-21', true), m('2026-08-23', false), m('2026-08-22', true)]);
    expect(rounds.map((r) => r.date)).toEqual(['2026-08-23', '2026-08-22', '2026-08-21']);
  });

  it('yhteenveto laskee mallin ja markkinan erikseen', () => {
    const rounds = groupRounds([m('2026-08-21', true), m('2026-08-21', false)]);
    expect(rounds[0].summary).toMatchObject({ matches: 2, model_correct: 1, market_correct: 0 });
  });

  it('yhteenveto laskee panostetun ja tuoton picks-kentista, EI liputtamattomista otteluista', () => {
    const rounds = groupRounds([
      m('2026-08-21', true, pick({ stake: 10, profit: 15, won: true })),
      m('2026-08-21', true, pick({ stake: 5, profit: -5, won: false })),
      m('2026-08-21', true, null),
    ]);
    expect(rounds[0].summary.picks).toBe(2);
    expect(rounds[0].summary.picks_won).toBe(1);
    expect(rounds[0].summary.staked).toBe(15);
    expect(rounds[0].summary.profit).toBe(10);
    expect(rounds[0].summary.roi).toBeCloseTo(10 / 15, 4);
  });

  it('roi on null kun mitaan ei panostettu', () => {
    const rounds = groupRounds([m('2026-08-21', true, null)]);
    expect(rounds[0].summary.roi).toBeNull();
    expect(rounds[0].summary.staked).toBe(0);
  });

  it('tyhja syote -> tyhja tulos', () => {
    expect(groupRounds([])).toEqual([]);
  });
});
