// Tiketti #105: kasin syotetty ottelukonteksti
//
// TAMA TESTI SUOJAA KOLMEA ASIAA, jotka kaikki ovat sellaisia etta niiden
// rikkoutuminen NAYTTAISI TOIMIVALTA:
//
//   1. Lahteeton tekija ei paase lapi. Ilman tarkistusta kortille paatyisi
//      mielipide joka nayttaa havainnolta — eika mikaan muu kohta putkessa
//      huomaisi sita.
//   2. Vaikutus pysyy katossa. Kuusi pienta miinusta summautuu helposti
//      luvuksi joka vaittaa enemman kuin yksikaan niista erikseen.
//   3. `lambda_base` on TODELLA lambda ennen saatoa. Jos se karkaa, selaimen
//      pois-kytkenta laskee vaarin — ja vaarin nimenomaan hiljaa, koska
//      tulos on edelleen uskottavan nakoinen luku.

import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppeja, tuodaan tarkoituksella
import * as browser from '../../public/app/football-calc.js';
import {
  parseFactor,
  parseContextFile,
  TABLE_DERIVED_TYPES,
  contextFor,
  unmatchedContext,
  totalContextDelta,
  MAX_FACTOR_DELTA,
  MAX_SIDE_DELTA,
  ContextFile,
} from '../ingest/context-manual.js';
import { buildCard } from '../publish/live-snapshot.js';
import { rebuildCard } from '../publish/manual-odds.js';
import type { FootballOddsEvent } from '../ingest/odds-football.js';
import type { ContextFactor, LeagueSeasonStats } from '../types-football.js';
import type { LeagueStatsPair } from '../ingest/stats.js';

const source = [{ name: 'Sports Mole', url: 'https://www.sportsmole.co.uk/' }];

function factor(over: Partial<ContextFactor> = {}): ContextFactor {
  return {
    id: 'f1',
    team: 'home',
    type: 'injury',
    label: 'Avainhyokkaaja poissa',
    detail: 'Vahvistettu lehdistotilaisuudessa',
    delta_home: -0.1,
    delta_away: 0,
    confidence: 0.9,
    sources: source,
    ...over,
  };
}

describe('parseFactor — rivi joka ei kelpaa ei paase kortille', () => {
  it('hyvaksyy taydellisen rivin sellaisenaan', () => {
    expect(parseFactor(factor(), 'testi')).toEqual(factor());
  });

  it('PUDOTTAA tekijan jolla ei ole lahdetta', () => {
    expect(parseFactor(factor({ sources: [] }), 'testi')).toBeNull();
  });

  it('pudottaa tekijan jolta puuttuu id tai otsikko', () => {
    expect(parseFactor(factor({ id: '' }), 'testi')).toBeNull();
    expect(parseFactor(factor({ label: '' }), 'testi')).toBeNull();
  });

  it('rajaa yksittaisen vaikutuksen MAX_FACTOR_DELTA:aan', () => {
    const f = parseFactor(factor({ delta_home: -0.9, delta_away: 0.7 }), 'testi')!;
    expect(f.delta_home).toBe(-MAX_FACTOR_DELTA);
    expect(f.delta_away).toBe(MAX_FACTOR_DELTA);
  });

  it('tuntematon tyyppi ei kaada rivia vaan muuttuu neutraaliksi', () => {
    expect(parseFactor(factor({ type: 'ufo' }), 'testi')!.type).toBe('other');
  });

  // KAKSOISLASKENTA on taman ominaisuuden pahin yksittainen riski, ja se
  // nayttaa perustellulta: "Hull ei ole paastanyt maalia" on tosi havainto,
  // mutta malli on jo lukenut sen sarjataulukosta. Kun se annettiin viela
  // lambda-siirtymana, Hullin vierasvoitto 14.00:lla nayttoi 60 %:n
  // ylikertoimelta 37 %:n sijaan. Varoitus on se joka tekee siita nakyvan.
  it('VAROITTAA kun taulukosta luettava tyyppi saataa lambdaa', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseFactor(factor({ type: 'goal_drought', delta_home: -0.1 }), 'testi');
    expect(warn.mock.calls.flat().join(' ')).toContain('kaksoislaskentaa');
    warn.mockRestore();
  });

  it('ei varoita kun sama tyyppi jatetaan nollaan', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    parseFactor(factor({ type: 'goal_drought', delta_home: 0, delta_away: 0 }), 'testi');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ei varoita mallin ulkopuolisista tyypeista', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const type of ['injury', 'return', 'signing', 'manager', 'congestion']) {
      expect(TABLE_DERIVED_TYPES.has(type)).toBe(false);
      parseFactor(factor({ type, delta_home: -0.15 }), 'testi');
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('parseContextFile', () => {
  it('kelvoton rakenne palauttaa nullin', () => {
    expect(parseContextFile({ events: 'ei lista' }, 'testi')).toBeNull();
    expect(parseContextFile(null, 'testi')).toBeNull();
  });

  it('yksi kelvoton tekija ei vie muita mukanaan', () => {
    const file = parseContextFile(
      {
        source: { name: 'Kierrosennakot', entered_at: '2026-09-12T06:00:00.000Z', note: null },
        events: [
          {
            sportKey: 'soccer_epl',
            date: '2026-09-12',
            home: 'Chelsea',
            away: 'Hull City',
            factors: [factor({ id: 'a' }), factor({ id: 'b', sources: [] }), factor({ id: 'c' })],
          },
        ],
      },
      'testi'
    );
    expect(file!.events[0].factors.map((f) => f.id)).toEqual(['a', 'c']);
  });

  it('kaksoiskappale-id pudotetaan — muuten pois-kytkenta jattaisi toisen paalle', () => {
    const file = parseContextFile(
      {
        source: {},
        events: [{ sportKey: 'soccer_epl', date: '2026-09-12', home: 'A', away: 'B', factors: [factor({ id: 'x' }), factor({ id: 'x' })] }],
      },
      'testi'
    );
    expect(file!.events[0].factors).toHaveLength(1);
  });
});

describe('totalContextDelta — katto ja pariteetti selaimen kanssa', () => {
  const many = [
    factor({ id: '1', delta_home: -0.2 }),
    factor({ id: '2', delta_home: -0.2 }),
    factor({ id: '3', delta_home: -0.2 }),
  ];

  it('summa rajataan MAX_SIDE_DELTA:aan', () => {
    expect(totalContextDelta(many, 'home')).toBe(-MAX_SIDE_DELTA);
  });

  it('selain laskee saman luvun kuin palvelin', () => {
    expect(browser.MAX_SIDE_DELTA).toBe(MAX_SIDE_DELTA);
    for (const side of ['home', 'away'] as const) {
      expect(browser.totalContextDelta(many, side)).toBe(totalContextDelta(many, side));
      expect(browser.totalContextDelta([factor({ delta_home: 0.07, delta_away: -0.03 })], side)).toBeCloseTo(
        totalContextDelta([factor({ delta_home: 0.07, delta_away: -0.03 })], side),
        12
      );
    }
  });
});

// ─── Tasmaytys ────────────────────────────────────────────────────────────

const file: ContextFile = {
  source: { name: 'Kierrosennakot ja uutiset', entered_at: '2026-09-12T06:00:00.000Z', note: null },
  events: [
    {
      sportKey: 'soccer_epl',
      date: '2026-09-12',
      home: 'Chelsea',
      away: 'Hull City',
      factors: [
        factor({ id: 'che-caicedo', team: 'home', delta_home: -0.06, delta_away: 0.04 }),
        factor({ id: 'hul-clean-sheets', team: 'away', type: 'defence', delta_home: -0.08, delta_away: 0 }),
      ],
    },
    { sportKey: 'soccer_epl', date: '2026-09-12', home: 'Kirjoitus', away: 'Virhe', factors: [factor({ id: 'z' })] },
  ],
};

describe('contextFor', () => {
  const target = { sportKey: 'soccer_epl', kickoff: '2026-09-12T14:00:00.000Z', home: { name: 'Chelsea' }, away: { name: 'Hull City' } };

  it('loytaa ottelun sarjan, paivan ja joukkueiden perusteella', () => {
    expect(contextFor(target, file)!.factors).toHaveLength(2);
  });

  it('ei osu vaaraan paivaan', () => {
    expect(contextFor({ ...target, kickoff: '2026-09-13T14:00:00.000Z' }, file)).toBeNull();
  });

  it('lambda_base on aluksi null — sen tayttaa vasta malli', () => {
    expect(contextFor(target, file)!.lambda_base).toBeNull();
  });

  it('TASMAAMATON RIVI SANOTAAN — kirjoitusvirhe ei saa kadota hiljaa', () => {
    const missed = unmatchedContext([target], file);
    expect(missed.map((e) => e.home)).toEqual(['Kirjoitus']);
  });
});

// ─── Koko ketju: kortti, lambda ja selaimen peruminen ─────────────────────

const season: LeagueSeasonStats = {
  league: 'Valioliiga',
  season: '2026',
  teams: [
    { name: 'Chelsea', aliases: [], rank: 4, played: 3, won: 2, draw: 0, lost: 1, gf: 8, ga: 7, home_played: 2, home_gf: 5, home_ga: 3, away_played: 1, away_gf: 3, away_ga: 4, form: 'WWL', points: 6 },
    { name: 'Hull City', aliases: [], rank: 3, played: 3, won: 2, draw: 1, lost: 0, gf: 3, ga: 0, home_played: 2, home_gf: 2, home_ga: 0, away_played: 1, away_gf: 1, away_ga: 0, form: 'WWD', points: 7 },
  ],
  homeGoalsAvg: 1.5,
  awayGoalsAvg: 1.2,
  source: 'ESPN (testi)',
  splitsEstimated: false,
};

const stats: LeagueStatsPair = { current: season, previous: null };

const event: FootballOddsEvent = {
  eventId: 'che-hul',
  sportKey: 'soccer_epl',
  league: 'Valioliiga',
  kickoff: '2026-09-12T14:00:00.000Z',
  home: { name: 'Chelsea', short: 'CHE', color: '#000' },
  away: { name: 'Hull City', short: 'HUL', color: '#fff' },
  odds: [
    { bookmaker: 'Veikkaus', key: 'veikkaus', market: '1X2', home: 1.22, draw: 6.75, away: 12.0, commission: 0, fetched_at: '2026-09-12T06:00:00.000Z' },
    { bookmaker: 'Pinnacle', key: 'pinnacle', market: '1X2', home: 1.25, draw: 6.5, away: 11.0, commission: 0, fetched_at: '2026-09-12T06:00:00.000Z' },
  ],
  totals: [],
};

describe('buildCard — konteksti saataa mallia ja sailyttaa lahtoluvun', () => {
  const withCtx = buildCard(event, stats, null, {}, null, null, file);
  const without = buildCard(event, stats, null, {}, null, null, null);

  it('pillerit kulkevat kortille', () => {
    expect(withCtx.context!.factors.map((f) => f.id)).toEqual(['che-caicedo', 'hul-clean-sheets']);
    expect(without.context).toBeUndefined();
  });

  it('LAMBDA SIIRTYY — juuri tama muuttaa vetosuosituksen', () => {
    expect(withCtx.model.lambda_home).toBeLessThan(without.model.lambda_home!);
    expect(withCtx.model.lambda_away).toBeGreaterThan(without.model.lambda_away!);
  });

  it('lambda_base on saatamaton luku eli sama kuin ilman kontekstia', () => {
    expect(withCtx.context!.lambda_base!.home).toBeCloseTo(without.model.lambda_home!, 3);
    expect(withCtx.context!.lambda_base!.away).toBeCloseTo(without.model.lambda_away!, 3);
  });

  it('jokainen pilleri nakyy mallin perusteluissa lahteineen', () => {
    const reasons = withCtx.model.adjustments.filter((a) => a.reason.startsWith('📋'));
    expect(reasons).toHaveLength(2);
    expect(reasons[0].reason).toContain('Sports Mole');
  });

  it('SELAIN PAASEE TAKAISIN LAHTOLUKUUN kun kaikki pillerit kytketaan pois', () => {
    const off = withCtx.context!.factors.map((f) => f.id);
    const r = browser.recalculate(withCtx, [], 100, off);
    expect(r.lambdaHome).toBeCloseTo(without.model.lambda_home!, 6);
    expect(r.lambdaAway).toBeCloseTo(without.model.lambda_away!, 6);
  });

  // Tarkkuus on 2 desimaalia eika 3, ja se on oikea vaatimus: snapshot
  // pyoristaa SEKA `lambda_base`:n ETTA lopullisen lambdan kolmeen
  // desimaaliin erikseen, joten selain laskee pyoristetysta lahtoluvusta.
  // Jaljelle jaa ~5e-4 ero, joka on pyoristysta eika eriytymista — todellinen
  // eriytyminen (eri kaava, eri katto) nakyisi kertaluokkaa suurempana.
  it('kaikki pillerit paalla selain paatyy samaan lukuun kuin palvelin', () => {
    const r = browser.recalculate(withCtx, [], 100, []);
    expect(r.lambdaHome).toBeCloseTo(withCtx.model.lambda_home!, 2);
    expect(r.lambdaAway).toBeCloseTo(withCtx.model.lambda_away!, 2);
  });

  // CRONIN JARJESTYS: `snapshot:live` rakentaa kortit ja `odds:manual` ajaa
  // heti perassa. Jos jalkimmainen pudottaisi `context`-kentan, pillerit
  // katoaisivat jokaiselta kortilta juuri ennen julkaisua — ja kortti
  // nayttaisi tasan samalta kuin jos kontekstia ei olisi syotetty lainkaan.
  it('odds:manual -uudelleenrakennus SAILYTTAA pillerit ja lahtoluvun', () => {
    const uudelleen = rebuildCard(withCtx, 100);
    expect(uudelleen.context!.factors.map((f) => f.id)).toEqual(['che-caicedo', 'hul-clean-sheets']);
    expect(uudelleen.context!.lambda_base).toEqual(withCtx.context!.lambda_base);
    expect(uudelleen.model.lambda_home).toBeCloseTo(withCtx.model.lambda_home!, 3);
  });

  it('yhden pillerin poisto jattaa toisen voimaan', () => {
    const r = browser.recalculate(withCtx, [], 100, ['hul-clean-sheets']);
    expect(r.lambdaHome).toBeGreaterThan(withCtx.model.lambda_home!);
    expect(r.lambdaHome).toBeLessThan(without.model.lambda_home!);
  });
});
