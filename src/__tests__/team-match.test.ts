import { describe, it, expect } from 'vitest';
import { normalizeName, significantTokens, namesMatch, findTeam } from '../ingest/team-match.js';

describe('Nimen normalisointi', () => {
  it('poistaa diakriitit', () => {
    expect(normalizeName('Ässät')).toBe('assat');
    expect(normalizeName('Malmö FF')).toBe('malmo ff');
  });

  it('pienentää kirjaimet ja siivoaa välimerkit', () => {
    expect(normalizeName('HJK Helsinki')).toBe('hjk helsinki');
    expect(normalizeName('Brighton & Hove Albion')).toBe('brighton hove albion');
  });

  it('tiivistää välilyönnit', () => {
    expect(normalizeName('  FC   Inter   Turku  ')).toBe('fc inter turku');
  });
});

describe('Erottelevat sanat', () => {
  it('pudottaa seuraetuliitteet', () => {
    expect(significantTokens('FC Inter Turku')).toEqual(['inter', 'turku']);
    expect(significantTokens('IF Gnistan')).toEqual(['gnistan']);
    expect(significantTokens('FF Jaro')).toEqual(['jaro']);
  });

  it('ei tyhjennä joukkoa kokonaan jos nimi on pelkkä etuliite', () => {
    expect(significantTokens('AC').length).toBeGreaterThan(0);
  });

  it('säilyttää merkitykselliset sanat kuten City ja United', () => {
    // Näiden pudottaminen sekoittaisi Manchester Cityn ja Manchester Unitedin
    expect(significantTokens('Manchester City')).toContain('city');
    expect(significantTokens('Manchester United')).toContain('united');
  });
});

describe('Nimien täsmäytys', () => {
  it('täsmää kun toinen nimi on toisen tarkennus', () => {
    expect(namesMatch('KuPS Kuopio', 'KuPS')).toBe(true);
    expect(namesMatch('HJK Helsinki', 'HJK')).toBe(true);
    expect(namesMatch('Ilves Tampere', 'Ilves')).toBe(true);
    expect(namesMatch('SJK Seinäjoki', 'SJK')).toBe(true);
  });

  it('täsmää yli erilaisten seuraetuliitteiden', () => {
    expect(namesMatch('Jaro', 'FF Jaro')).toBe(true);
    expect(namesMatch('FC Inter Turku', 'Inter Turku')).toBe(true);
    expect(namesMatch('FC Inter Turku', 'FC Inter')).toBe(true);
  });

  it('EI täsmää eri joukkueita jotka jakavat kaupungin', () => {
    // Tämä on se syy miksi pelkkä sanojen leikkaus ei riitä
    expect(namesMatch('FC Inter Turku', 'TPS Turku')).toBe(false);
    expect(namesMatch('Manchester City', 'Manchester United')).toBe(false);
  });

  it('täsmää skandien yli', () => {
    expect(namesMatch('SJK Seinäjoki', 'SJK Seinajoki')).toBe(true);
  });

  it('tyhjä nimi ei täsmää mihinkään', () => {
    expect(namesMatch('', 'HJK')).toBe(false);
  });
});

describe('Joukkueen etsintä listasta', () => {
  // Nimet aidosta Veikkausliigan taulukosta (Wikipedia)
  const STATS_TEAMS = [
    { name: 'KuPS', aliases: [] },
    { name: 'Inter Turku', aliases: [] },
    { name: 'HJK', aliases: [] },
    { name: 'VPS', aliases: [] },
    { name: 'AC Oulu', aliases: [] },
    { name: 'IF Gnistan', aliases: [] },
    { name: 'FC Lahti', aliases: [] },
    { name: 'TPS', aliases: [] },
    { name: 'Ilves', aliases: [] },
    { name: 'SJK', aliases: [] },
    { name: 'FF Jaro', aliases: [] },
    { name: 'IFK Mariehamn', aliases: [] },
  ];

  // Nimet aidosta The Odds API -vastauksesta
  const ODDS_NAMES = [
    'AC Oulu',
    'FC Inter Turku',
    'FC Lahti',
    'HJK Helsinki',
    'IF Gnistan',
    'IFK Mariehamn',
    'Ilves Tampere',
    'Jaro',
    'KuPS Kuopio',
    'SJK Seinäjoki',
    'TPS Turku',
    'VPS Vaasa',
  ];

  it('kaikki 12 Veikkausliigan joukkuetta täsmäytyvät oikein', () => {
    const expected: Record<string, string> = {
      'AC Oulu': 'AC Oulu',
      'FC Inter Turku': 'Inter Turku',
      'FC Lahti': 'FC Lahti',
      'HJK Helsinki': 'HJK',
      'IF Gnistan': 'IF Gnistan',
      'IFK Mariehamn': 'IFK Mariehamn',
      'Ilves Tampere': 'Ilves',
      Jaro: 'FF Jaro',
      'KuPS Kuopio': 'KuPS',
      'SJK Seinäjoki': 'SJK',
      'TPS Turku': 'TPS',
      'VPS Vaasa': 'VPS',
    };

    for (const oddsName of ODDS_NAMES) {
      const found = findTeam(STATS_TEAMS, oddsName);
      expect(found, `"${oddsName}" ei täsmännyt`).not.toBeNull();
      expect(found!.name, `"${oddsName}" täsmäsi väärään joukkueeseen`).toBe(expected[oddsName]);
    }
  });

  it('täsmää aliaksen kautta (football-data.orgin shortName)', () => {
    const pl = [
      { name: 'Manchester City FC', aliases: ['Man City', 'MCI'] },
      { name: 'Manchester United FC', aliases: ['Man United', 'MUN'] },
    ];
    expect(findTeam(pl, 'Manchester City')!.name).toBe('Manchester City FC');
    expect(findTeam(pl, 'Man City')!.name).toBe('Manchester City FC');
    expect(findTeam(pl, 'Manchester United')!.name).toBe('Manchester United FC');
  });

  it('palauttaa null kun joukkuetta ei ole', () => {
    expect(findTeam(STATS_TEAMS, 'Barcelona')).toBeNull();
  });

  it('palauttaa null kun täsmäytys on epäselvä (useampi osuma)', () => {
    // Väärän joukkueen arvaaminen laskisi analyysin vääristä luvuista —
    // parempi jättää ottelu market-only-tilaan
    const ambiguous = [
      { name: 'Inter', aliases: [] },
      { name: 'Inter Turku', aliases: [] },
    ];
    expect(findTeam(ambiguous, 'Inter')).not.toBeNull(); // tarkka osuma voittaa
    expect(findTeam(ambiguous, 'FC Inter')).toBeNull(); // epäselvä → null
  });

  it('tarkka osuma voittaa sanajoukkovertailun', () => {
    const teams = [
      { name: 'Ilves', aliases: [] },
      { name: 'Ilves Tampere', aliases: [] },
    ];
    expect(findTeam(teams, 'Ilves')!.name).toBe('Ilves');
  });
});
