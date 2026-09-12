// Kierroskortit kasin syotetyista kertoimista
//
// Tama ajo on ainoa reitti korttiin silloin kun ODDS_API_KEYta ei ole, joten
// sen valinnat (mitka ottelut paasevat mukaan) nakyvat suoraan siina mita
// kayttaja nakee. Kaksi saantoa on lukittava: vain ALKAMATTOMAT ottelut
// aikaikkunassa, ja vain ne joille on HINTA.

import { describe, it, expect } from 'vitest';
import { asOddsEvent, upcomingFixtures } from '../publish/manual-snapshot.js';
import { applyManualOdds, parseManualOdds } from '../ingest/odds-manual.js';
import type { FixtureMatch, FixturesFile } from '../publish/fixtures.js';

const NOW = new Date('2026-09-11T20:00:00.000Z');

function fx(over: Partial<FixtureMatch> = {}): FixtureMatch {
  return {
    espn_id: 'e1',
    match_id: null,
    date: '2026-09-12',
    kickoff: '2026-09-12T14:00:00.000Z',
    sport_key: 'soccer_epl',
    league: 'Valioliiga',
    home: 'Chelsea',
    away: 'Hull City',
    status: 'upcoming',
    home_score: null,
    away_score: null,
    has_odds: false,
    ...over,
  };
}

function calendar(matches: FixtureMatch[]): FixturesFile {
  return {
    schema_version: 1,
    generated_at: NOW.toISOString(),
    range: { from: '2026-09-01', to: '2026-10-01' },
    days: [],
    matches,
  };
}

describe('upcomingFixtures', () => {
  it('ottaa alkamattomat ottelut aikaikkunasta', () => {
    const list = upcomingFixtures(calendar([fx(), fx({ espn_id: 'e2', home: 'Liverpool', away: 'Fulham' })]), NOW);
    expect(list).toHaveLength(2);
  });

  it('MENNYT OTTELU EI PAASE MUKAAN vaikka kasisyotossa olisi rivi', () => {
    const past = fx({ date: '2026-09-09', kickoff: '2026-09-09T14:00:00.000Z', status: 'finished' });
    expect(upcomingFixtures(calendar([past]), NOW)).toHaveLength(0);
  });

  it('alkanut ottelu jatetaan pois — hinta ei ole enaa pelattavissa', () => {
    const live = fx({ kickoff: '2026-09-11T19:00:00.000Z', status: 'live' });
    expect(upcomingFixtures(calendar([live]), NOW)).toHaveLength(0);
  });

  it('aikaikkunan ULKOPUOLELLA oleva ottelu rajautuu pois', () => {
    const far = fx({ date: '2026-09-30', kickoff: '2026-09-30T14:00:00.000Z' });
    expect(upcomingFixtures(calendar([far]), NOW)).toHaveLength(0);
    expect(upcomingFixtures(calendar([far]), NOW, 30)).toHaveLength(1);
  });

  it('kelvoton aika ei kaada eika paase mukaan', () => {
    expect(upcomingFixtures(calendar([fx({ kickoff: 'ei-aika' })]), NOW)).toHaveLength(0);
  });

  it('jarjestaa aikajarjestykseen', () => {
    const list = upcomingFixtures(
      calendar([
        fx({ espn_id: 'myohemmin', kickoff: '2026-09-12T19:00:00.000Z' }),
        fx({ espn_id: 'aiemmin', kickoff: '2026-09-12T14:00:00.000Z' }),
      ]),
      NOW
    );
    expect(list.map((m) => m.espn_id)).toEqual(['aiemmin', 'myohemmin']);
  });
});

describe('asOddsEvent', () => {
  it('aloittaa TYHJALLA kerroinlistalla — se on valitila jonka kasisyotto tayttaa', () => {
    expect(asOddsEvent(fx()).odds).toEqual([]);
  });

  it('sailyttaa sarjan, ajan ja joukkueet kalenterista', () => {
    const e = asOddsEvent(fx());
    expect(e.sportKey).toBe('soccer_epl');
    expect(e.kickoff).toBe('2026-09-12T14:00:00.000Z');
    expect(e.home.name).toBe('Chelsea');
    expect(e.away.name).toBe('Hull City');
  });
});

describe('kasisyoton tasmaytys kalenterin otteluihin', () => {
  const file = parseManualOdds({
    bookmaker: 'Veikkaus',
    key: 'veikkaus',
    link: 'https://example.test',
    source: 'testi',
    entered_at: NOW.toISOString(),
    note: 'testi',
    events: [
      { sportKey: 'soccer_epl', date: '2026-09-12', home: 'Chelsea', away: 'Hull City', odds: [1.22, 6.75, 12.0] },
      { sportKey: 'soccer_epl', date: '2026-09-12', home: 'Bournemouth', away: 'Brentford', odds: [2.54, 3.7, 2.58] },
    ],
  });

  it('tasmaava rivi tayttaa hinnat', () => {
    const events = [asOddsEvent(fx())];
    expect(applyManualOdds(events, file)).toBe(1);
    expect(events[0].odds[0].home).toBe(1.22);
    expect(events[0].odds[0].away).toBe(12.0);
  });

  // MUUTTUNUT TIKETISSA #105. Aiemmin jalkapallolla oli oma kevyt
  // normalisointinsa (vain valimerkkien poisto), ja tama testi vahvisti etta
  // "Bournemouth" EI osu kalenterin "AFC Bournemouthiin" — sita pidettiin
  // tarkoituksellisena tiukkuutena.
  //
  // Kaytannossa se oli hiljainen vika. The Odds API kirjoittaa "Bournemouth"
  // ja "Brighton and Hove Albion", kalenteri "AFC Bournemouth" ja
  // "Brighton & Hove Albion" — joten kahdelta Valioliigan ottelulta putosi
  // seka Veikkauksen hinta etta kasin syotetty ottelukonteksti, eika mikaan
  // kertonut siita: kortilla oli vain yksi toimisto vahemman.
  //
  // Nyt kaytossa on sama `normalizeClubName` kuin muualla putkessa (#57).
  it('SEURAMUOTO EI ENAA ESTA TASMAYSTA — "Bournemouth" osuu "AFC Bournemouthiin"', () => {
    const events = [asOddsEvent(fx({ home: 'AFC Bournemouth', away: 'Brentford' }))];
    expect(applyManualOdds(events, file)).toBe(1);
    expect(events[0].odds[0].home).toBe(2.54);
  });

  // Sama korjaus toiseen suuntaan: & ja "and" ovat sama sana.
  it('"&" ja "and" tasmaavat toisiinsa', () => {
    const ampersand = parseManualOdds({
      bookmaker: 'Veikkaus',
      key: 'veikkaus',
      link: null,
      source: 'testi',
      entered_at: NOW.toISOString(),
      note: null,
      events: [
        { sportKey: 'soccer_epl', date: '2026-09-12', home: 'Coventry City', away: 'Brighton & Hove Albion', odds: [3.65, 3.65, 1.98] },
      ],
    });
    const events = [asOddsEvent(fx({ home: 'Coventry City', away: 'Brighton and Hove Albion' }))];
    expect(applyManualOdds(events, ampersand)).toBe(1);
  });

  // EROTTELEVAT sanat jaavat paikoilleen: normalisointi ei saa yhdistaa
  // kahta eri seuraa, mika olisi pahempi virhe kuin tasmaamatta jaanyt rivi.
  it('kaksi eri joukkuetta EIVAT yhdisty', () => {
    const wrong = parseManualOdds({
      bookmaker: 'Veikkaus',
      key: 'veikkaus',
      link: null,
      source: 'testi',
      entered_at: NOW.toISOString(),
      note: null,
      events: [
        { sportKey: 'soccer_epl', date: '2026-09-12', home: 'Manchester City', away: 'Brentford', odds: [1.5, 4.0, 6.0] },
      ],
    });
    const events = [asOddsEvent(fx({ home: 'Manchester United', away: 'Brentford' }))];
    expect(applyManualOdds(events, wrong)).toBe(0);
  });

  it('vaara paiva ei osu vaikka joukkueet tasmaavat', () => {
    const events = [asOddsEvent(fx({ date: '2026-09-13', kickoff: '2026-09-13T14:00:00.000Z' }))];
    expect(applyManualOdds(events, file)).toBe(0);
  });

  it('hinnaton ottelu jaa tyhjaksi eika saa korttia', () => {
    const events = [asOddsEvent(fx({ home: 'Leeds United', away: 'Newcastle United' }))];
    applyManualOdds(events, file);
    expect(events.filter((e) => e.odds.length)).toHaveLength(0);
  });
});
