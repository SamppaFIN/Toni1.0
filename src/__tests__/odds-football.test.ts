import { describe, it, expect } from 'vitest';
import {
  parseEventOdds,
  filterByAllowlist,
  commissionFor,
  teamRef,
  leagueLabel,
  DEFAULT_FOOTBALL_BOOKMAKERS,
  OddsApiEvent,
} from '../ingest/odds-football.js';

/** Aito vastauksen muoto The Odds API:sta (lyhennetty oikeasta Veikkausliiga-ajosta) */
const EVENT: OddsApiEvent = {
  id: 'abc123',
  sport_key: 'soccer_finland_veikkausliiga',
  commence_time: '2026-08-16T13:00:00Z',
  home_team: 'HJK Helsinki',
  away_team: 'Jaro',
  bookmakers: [
    {
      key: 'pinnacle',
      title: 'Pinnacle',
      last_update: '2026-08-14T15:00:00Z',
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: 'HJK Helsinki', price: 1.28 },
            { name: 'Jaro', price: 9.00 },
            { name: 'Draw', price: 5.60 },
          ],
        },
      ],
    },
    {
      key: 'betfair_ex_eu',
      title: 'Betfair',
      last_update: '2026-08-14T15:01:00Z',
      markets: [
        {
          key: 'h2h',
          outcomes: [
            { name: 'HJK Helsinki', price: 1.31 },
            { name: 'Jaro', price: 9.60 },
            { name: 'Draw', price: 5.90 },
          ],
        },
      ],
    },
    {
      key: 'unibet_se',
      title: 'Unibet (SE)',
      last_update: '2026-08-14T14:55:00Z',
      markets: [{ key: 'totals', outcomes: [{ name: 'Over', price: 1.8 }] }],
    },
  ],
};

describe('Kertoimien poiminta API-vastauksesta', () => {
  it('poimii 1X2-kertoimet tapahtuman joukkuenimien perusteella', () => {
    const rows = parseEventOdds(EVENT);
    const pin = rows.find((r) => r.key === 'pinnacle')!;
    expect(pin.home).toBe(1.28);
    expect(pin.draw).toBe(5.60);
    expect(pin.away).toBe(9.00);
  });

  it('KRIITTINEN: näyttönimi tulee title-kentästä eikä key-kentästä', () => {
    // Tämä on se bugi joka olisi pudottanut kaikki oikeat kertoimet hiljaa:
    // demo.html vertaa näyttönimiä tarkalla yhtäsuuruudella, ja
    // "unibet_se" !== "Unibet (SE)"
    const rows = parseEventOdds(EVENT);
    expect(rows.map((r) => r.bookmaker)).toContain('Betfair');
    expect(rows.map((r) => r.bookmaker)).not.toContain('betfair_ex_eu');
    // key säilyy silti tunnisteena
    expect(rows.map((r) => r.key)).toContain('betfair_ex_eu');
  });

  it('ohittaa toimistot joilta puuttuu h2h-markkina', () => {
    const rows = parseEventOdds(EVENT);
    expect(rows.find((r) => r.key === 'unibet_se')).toBeUndefined();
    expect(rows).toHaveLength(2);
  });

  it('merkitsee pörssin komission ja jättää kirjat nollaan', () => {
    const rows = parseEventOdds(EVENT);
    expect(rows.find((r) => r.key === 'betfair_ex_eu')!.commission).toBe(0.05);
    expect(rows.find((r) => r.key === 'pinnacle')!.commission).toBe(0);
  });

  it('ei sekoita kotia ja vierasta listan järjestyksestä', () => {
    // Tässä tapahtumassa "Draw" on outcomes-listan viimeisenä, ei keskellä
    const rows = parseEventOdds(EVENT);
    for (const r of rows) {
      expect(r.home).toBeLessThan(r.away); // HJK on suosikki
      expect(r.draw).toBeGreaterThan(r.home);
    }
  });

  it('hylkää kelvottomat kertoimet (<= 1)', () => {
    const broken: OddsApiEvent = {
      ...EVENT,
      bookmakers: [
        {
          key: 'rikki',
          title: 'Rikki',
          last_update: '2026-08-14T15:00:00Z',
          markets: [
            {
              key: 'h2h',
              outcomes: [
                { name: 'HJK Helsinki', price: 1.0 },
                { name: 'Jaro', price: 9.0 },
                { name: 'Draw', price: 5.0 },
              ],
            },
          ],
        },
      ],
    };
    expect(parseEventOdds(broken)).toHaveLength(0);
  });

  it('tyhjä toimistolista → tyhjä tulos, ei kaadu', () => {
    expect(parseEventOdds({ ...EVENT, bookmakers: [] })).toHaveLength(0);
  });
});

describe('Toimistojen allowlist', () => {
  const rows = parseEventOdds(EVENT);

  it('suodattaa avaimen perusteella, kirjainkoosta riippumatta', () => {
    expect(filterByAllowlist(rows, ['PINNACLE'])).toHaveLength(1);
    expect(filterByAllowlist(rows, ['pinnacle'])[0].bookmaker).toBe('Pinnacle');
  });

  it('tyhjä allowlist päästää kaikki läpi', () => {
    expect(filterByAllowlist(rows, [])).toHaveLength(rows.length);
  });

  it('oletuslistalla on vain yksi variantti per brändi', () => {
    // unibet_se, unibet_nl ja unibet_fr ovat sama brändi samoilla kertoimilla —
    // useampi variantti täyttäisi kortin kopioilla ja vesittäisi ⭐-merkinnän
    const unibetVariants = DEFAULT_FOOTBALL_BOOKMAKERS.filter((b) => b.startsWith('unibet'));
    expect(unibetVariants).toHaveLength(1);
  });

  it('oletuslista sisältää sharp-ankkurin', () => {
    expect(DEFAULT_FOOTBALL_BOOKMAKERS).toContain('pinnacle');
  });
});

describe('Komissiot', () => {
  it('tunnistaa pörssit', () => {
    expect(commissionFor('betfair_ex_eu')).toBe(0.05);
    expect(commissionFor('matchbook')).toBe(0.015);
  });

  it('tavallisilla kirjoilla ei komissiota', () => {
    expect(commissionFor('pinnacle')).toBe(0);
    expect(commissionFor('unibet_se')).toBe(0);
    expect(commissionFor('tuntematon_toimisto')).toBe(0);
  });

  it('ei välitä kirjainkoosta', () => {
    expect(commissionFor('BETFAIR_EX_EU')).toBe(0.05);
  });
});

describe('Joukkueviittaukset', () => {
  it('tunnetuille seuroille vakiintunut lyhenne', () => {
    expect(teamRef('HJK Helsinki').short).toBe('HJK');
    expect(teamRef('FC Inter Turku').short).toBe('INT');
    expect(teamRef('VPS Vaasa').short).toBe('VPS');
  });

  it('tuntemattomalle johdetaan lyhenne ja väri', () => {
    const ref = teamRef('Jokin Uusi Seura');
    expect(ref.name).toBe('Jokin Uusi Seura');
    expect(ref.short).toHaveLength(3);
    expect(ref.short).toBe(ref.short.toUpperCase());
    expect(ref.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('sama nimi tuottaa aina saman värin (deterministinen)', () => {
    expect(teamRef('Jokin Seura').color).toBe(teamRef('Jokin Seura').color);
  });

  it('pudottaa seuraetuliitteen lyhenteestä', () => {
    // "FC Lahti" → lyhenne Lahdesta, ei FC:stä
    expect(teamRef('FC Lahti').short).toBe('LAH');
  });

  it('kestää skandit ja lyhyet nimet', () => {
    expect(teamRef('Ässät').short).toHaveLength(3);
    expect(teamRef('AC').short.length).toBeGreaterThan(0);
  });
});

describe('Sarjojen nimet', () => {
  it('kääntää tunnetut sarjatunnisteet', () => {
    expect(leagueLabel('soccer_finland_veikkausliiga')).toBe('Veikkausliiga');
    expect(leagueLabel('soccer_epl')).toBe('Valioliiga');
  });

  it('kaantaa myos rekisterin uudemmat sarjat', () => {
    // Sarjarekisteri (tiketti #61) laajensi kattavuutta 8 -> 20 sarjaan
    expect(leagueLabel('soccer_norway_eliteserien')).toBe('Eliteserien');
    expect(leagueLabel('soccer_netherlands_eredivisie')).toBe('Eredivisie');
  });

  it('tuntemattomasta muodostetaan luettava nimi', () => {
    // Raaka tunniste siistitaan -- ja se on samalla merkki siita etta sarja
    // pitaisi lisata rekisteriin (src/leagues.ts).
    expect(leagueLabel('soccer_ei_olemassa_sarja')).toBe('ei olemassa sarja');
  });
});
