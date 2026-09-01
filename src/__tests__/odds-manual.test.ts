// Tiketti #103: käsin syötetyt kertoimet (Veikkaus)
//
// Kaksi asiaa on lukittava:
//   1. KÄSIN SYÖTETTY EI SAA ESIINTYÄ HAETTUNA. `manual`-merkintä on ainoa
//      asia joka erottaa nämä kortilla, ja se on tarkoituksellinen.
//   2. Rivi ei saa osua väärään otteluun. Täsmäytys on nimien varassa, ja
//      väärään otteluun liitetty hinta olisi pahempi kuin puuttuva hinta.

import { describe, it, expect } from 'vitest';
import {
  parseManualOdds,
  applyManualOdds,
  unmatchedEvents,
  manualRow,
  eventKey,
  matchKeyFor,
  loadManualOdds,
  ManualOddsFile,
  ManualOddsTarget,
} from '../ingest/odds-manual.js';
import { BookmakerOdds } from '../types-football.js';

const RAW = {
  bookmaker: 'Veikkaus',
  key: 'veikkaus',
  link: 'https://www.veikkaus.fi/fi/vedonlyonti',
  source: 'kerroinsivu',
  entered_at: '2026-09-01T12:00:00.000Z',
  note: 'ei rajapintaa',
  events: [
    { sportKey: 'icehockey_liiga', date: '2026-09-01', home: 'Jukurit', away: 'HPK', odds: [2.82, 3.75, 2.37] },
    { sportKey: 'icehockey_liiga', date: '2026-09-01', home: 'K-Espoo', away: 'KalPa', odds: [2.08, 4.0, 3.2] },
  ],
};

const target = (home: string, away: string, kickoff = '2026-09-01T15:30:00.000Z', odds: BookmakerOdds[] = []): ManualOddsTarget => ({
  sportKey: 'icehockey_liiga',
  kickoff,
  home: { name: home },
  away: { name: away },
  odds,
});

const apiRow = (key: string): BookmakerOdds => ({
  bookmaker: key,
  key,
  market: '1X2',
  home: 2,
  draw: 3,
  away: 4,
  commission: 0,
  fetched_at: '2026-09-01T11:00:00.000Z',
});

describe('parseManualOdds', () => {
  it('lukee kelvollisen tiedoston', () => {
    const f = parseManualOdds(RAW)!;
    expect(f.bookmaker).toBe('Veikkaus');
    expect(f.events).toHaveLength(2);
  });

  it('kelvoton rivi pudotetaan MUTTA kelvolliset säilyvät', () => {
    // Yksi kirjoitusvirhe ei saa viedä kuutta oikeaa riviä mukanaan
    const f = parseManualOdds({
      ...RAW,
      events: [...RAW.events, { sportKey: 'icehockey_liiga', date: '2026-09-01', home: 'X', away: 'Y', odds: [0.5, 3, 4] }],
    })!;
    expect(f.events).toHaveLength(2);
  });

  it('puutteellinen rivi pudotetaan', () => {
    const f = parseManualOdds({ ...RAW, events: [{ sportKey: 'icehockey_liiga', date: '2026-09-01', home: 'X' }] })!;
    expect(f.events).toHaveLength(0);
  });

  it('rikkinäinen rakenne -> null, ei hiljaista jatkamista', () => {
    expect(parseManualOdds(null)).toBeNull();
    expect(parseManualOdds({ events: [] })).toBeNull();
    expect(parseManualOdds({ bookmaker: 'X', key: 'x' })).toBeNull();
  });
});

describe('täsmäytys', () => {
  it('Veikkauksen "K-Espoo" ja liiga.fi:n "Kiekko-Espoo" ovat sama joukkue', () => {
    expect(matchKeyFor('icehockey_liiga', 'K-Espoo')).toBe(matchKeyFor('icehockey_liiga', 'Kiekko-Espoo'));
  });

  it('ääkköset eivät estä täsmäystä', () => {
    expect(matchKeyFor('icehockey_liiga', 'Kärpät')).toBe(matchKeyFor('icehockey_liiga', 'Karpat'));
  });

  it('eri joukkueet EIVÄT normalisoidu samaksi', () => {
    expect(matchKeyFor('icehockey_liiga', 'HIFK')).not.toBe(matchKeyFor('icehockey_liiga', 'HPK'));
    expect(matchKeyFor('soccer_epl', 'Manchester United')).not.toBe(matchKeyFor('soccer_epl', 'Manchester City'));
  });

  it('avain sisältää sarjan, päivän ja molemmat joukkueet', () => {
    expect(eventKey('icehockey_liiga', '2026-09-01T15:30:00Z', 'Jukurit', 'HPK')).toBe(
      'icehockey_liiga|2026-09-01|jukurit|hpk'
    );
  });

  it('koti ja vieras eivät ole vaihdettavissa', () => {
    expect(eventKey('icehockey_liiga', '2026-09-01T15:30:00Z', 'A', 'B')).not.toBe(
      eventKey('icehockey_liiga', '2026-09-01T15:30:00Z', 'B', 'A')
    );
  });
});

describe('applyManualOdds', () => {
  const file = parseManualOdds(RAW)!;

  it('lisää rivin täsmäävään otteluun', () => {
    const events = [target('Jukurit', 'HPK')];
    expect(applyManualOdds(events, file)).toBe(1);
    expect(events[0].odds).toHaveLength(1);
    expect(events[0].odds[0].home).toBe(2.82);
  });

  it('rivi on merkitty käsin syötetyksi ja kantaa linkin', () => {
    const events = [target('Jukurit', 'HPK')];
    applyManualOdds(events, file);
    const row = events[0].odds[0];
    expect(row.manual).toBe(true);
    expect(row.key).toBe('veikkaus');
    expect(row.link).toBe('https://www.veikkaus.fi/fi/vedonlyonti');
    expect(row.fetched_at).toBe('2026-09-01T12:00:00.000Z');
    expect(row.commission).toBe(0);
  });

  it('EI lisää väärän päivän otteluun', () => {
    const events = [target('Jukurit', 'HPK', '2026-09-02T15:30:00.000Z')];
    expect(applyManualOdds(events, file)).toBe(0);
    expect(events[0].odds).toHaveLength(0);
  });

  it('EI lisää väärään otteluun vaikka toinen joukkue täsmää', () => {
    const events = [target('Jukurit', 'Tappara')];
    expect(applyManualOdds(events, file)).toBe(0);
  });

  it('RAJAPINTA VOITTAA: samaa toimistoa ei lisätä kahdesti', () => {
    const events = [target('Jukurit', 'HPK', '2026-09-01T15:30:00.000Z', [apiRow('veikkaus')])];
    expect(applyManualOdds(events, file)).toBe(0);
    expect(events[0].odds).toHaveLength(1);
    expect(events[0].odds[0].manual).toBeUndefined();
  });

  it('ajaminen kahdesti ei kahdenna riviä', () => {
    const events = [target('K-Espoo', 'KalPa')];
    applyManualOdds(events, file);
    applyManualOdds(events, file);
    expect(events[0].odds).toHaveLength(1);
  });

  it('puuttuva tiedosto ei tee mitään eikä kaada', () => {
    const events = [target('Jukurit', 'HPK')];
    expect(applyManualOdds(events, null)).toBe(0);
  });
});

describe('unmatchedEvents — kirjoitusvirhe ei saa jäädä huomaamatta', () => {
  const file = parseManualOdds(RAW)!;

  it('kertoo rivit jotka eivät osuneet mihinkään', () => {
    const miss = unmatchedEvents([target('Jukurit', 'HPK')], file);
    expect(miss.map((m) => m.home)).toEqual(['K-Espoo']);
  });

  it('tyhjä kun kaikki täsmäsivät', () => {
    expect(unmatchedEvents([target('Jukurit', 'HPK'), target('Kiekko-Espoo', 'KalPa')], file)).toEqual([]);
  });
});

describe('oikea käsisyöttötiedosto (data/veikkaus-odds-manual.json)', () => {
  const file = loadManualOdds();

  it('on luettavissa', () => {
    expect(file).not.toBeNull();
    expect(file!.key).toBe('veikkaus');
  });

  it('jokainen rivi on kelvollinen 1X2-kolmikko', () => {
    for (const e of file!.events) {
      expect(e.odds).toHaveLength(3);
      for (const o of e.odds) expect(o).toBeGreaterThan(1);
    }
  });

  it('linkki vie Veikkauksen kerroinsivulle', () => {
    expect(file!.link).toMatch(/^https:\/\/www\.veikkaus\.fi\//);
  });

  it('kate on uskottava — syöttövirhe näkyisi tässä', () => {
    // Vedonlyontitoimiston 1X2-kate on kaytannossa 2-15 %. Sen ulkopuolella
    // oleva luku tarkoittaa etta kerroin on kirjoitettu vaarin.
    for (const e of file!.events) {
      const summa = e.odds.reduce((s, o) => s + 1 / o, 0);
      expect(summa, `${e.home} vs ${e.away}`).toBeGreaterThan(1.01);
      expect(summa, `${e.home} vs ${e.away}`).toBeLessThan(1.16);
    }
  });

  it('sama ottelu ei esiinny kahdesti', () => {
    const avaimet = file!.events.map((e) => eventKey(e.sportKey, e.date, e.home, e.away));
    expect(new Set(avaimet).size).toBe(avaimet.length);
  });
});

describe('manualRow', () => {
  it('kääntää rivin BookmakerOdds-muotoon järjestyksessä 1/X/2', () => {
    const file = parseManualOdds(RAW) as ManualOddsFile;
    const row = manualRow(file, file.events[0]);
    expect([row.home, row.draw, row.away]).toEqual([2.82, 3.75, 2.37]);
    expect(row.market).toBe('1X2');
  });
});
