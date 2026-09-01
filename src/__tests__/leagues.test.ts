// Tiketti #61: Sarjarekisteri
//
// Rekisterin koko tarkoitus on estaa listojen hajaantuminen. Nama testit
// lukitsevat sen: jos joku lisaa sarjan rekisteriin puutteellisesti tai
// johdetut listat eroavat siita, testit hajoavat.

import { describe, it, expect } from 'vitest';
import { LEAGUES, leagueFor, leagueName, leaguesWithStats, estimateQuota, quotaWarning, FREE_TIER_MONTHLY_CREDITS } from '../leagues.js';
import { ESPN_LEAGUE_CODES, hasEspnResults } from '../ingest/results-espn.js';
import { leagueLabel } from '../ingest/odds-football.js';

describe('Rekisterin eheys', () => {
  it('sarjatunnisteet ovat uniikkeja', () => {
    const keys = LEAGUES.map((l) => l.sportKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('jokaisella on nimi ja kausityyppi', () => {
    for (const l of LEAGUES) {
      expect(l.name, l.sportKey).toBeTruthy();
      expect(['autumn-spring', 'calendar']).toContain(l.season);
    }
  });

  it('sarjatunniste vastaa lajia — The Odds APIn muoto (tiketti #90)', () => {
    // Rekisteri ei ole enaa yksilajinen. Etuliite ja `sport`-kentta eivat saa
    // erota: vaara etuliite tarkoittaisi ettei kertoimia loydy lainkaan,
    // ja se epaonnistuisi hiljaa ajossa eika tassa.
    for (const l of LEAGUES) {
      const odotettu = (l.sport ?? 'football') === 'hockey' ? /^icehockey_/ : /^soccer_/;
      expect(l.sportKey, l.name).toMatch(odotettu);
    }
  });

  it('jokainen laji on tuettu arvo', () => {
    for (const l of LEAGUES) {
      expect(['football', 'hockey', undefined], l.name).toContain(l.sport);
    }
  });

  it('ESPN-koodit ovat uniikkeja — kaksi sarjaa ei voi osoittaa samaan', () => {
    const codes = LEAGUES.map((l) => l.espn).filter(Boolean);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('Johdetut listat eivat hajaannu', () => {
  it('ESPN_LEAGUE_CODES on tasmalleen rekisterin espn-kentat', () => {
    const expected = Object.fromEntries(LEAGUES.filter((l) => l.espn).map((l) => [l.sportKey, l.espn]));
    expect(ESPN_LEAGUE_CODES).toEqual(expected);
  });

  it('hasEspnResults vastaa rekisteria', () => {
    for (const l of LEAGUES) expect(hasEspnResults(l.sportKey), l.name).toBe(Boolean(l.espn));
  });

  it('leagueLabel palauttaa rekisterin nimen', () => {
    for (const l of LEAGUES) expect(leagueLabel(l.sportKey), l.sportKey).toBe(l.name);
  });
});

describe('Hakutoiminnot', () => {
  it('loytaa sarjan tunnisteella', () => {
    expect(leagueFor('soccer_epl')?.name).toBe('Valioliiga');
    expect(leagueFor('soccer_ei_olemassa')).toBeNull();
  });

  it('tuntematon nimi palautuu sellaisenaan', () => {
    expect(leagueName('soccer_ei_olemassa')).toBe('soccer_ei_olemassa');
  });

  it('tilastolliset sarjat ovat osajoukko', () => {
    const withStats = leaguesWithStats();
    expect(withStats.length).toBeGreaterThan(0);
    expect(withStats.length).toBeLessThan(LEAGUES.length);
    for (const l of withStats) expect(Boolean(l.footballData || l.wikipedia)).toBe(true);
  });

  it('Veikkausliiga on merkitty Wikipedia-lahteeksi', () => {
    expect(leagueFor('soccer_finland_veikkausliiga')?.wikipedia).toBe(true);
    expect(leagueFor('soccer_finland_veikkausliiga')?.season).toBe('calendar');
  });
});

describe('Kvoottalaskenta', () => {
  it('nykyinen kokoonpano (2 sarjaa) mahtuu ilmaistasolle', () => {
    const q = estimateQuota(2, 2);
    expect(q.creditsPerMonth).toBe(120);
    expect(q.withinFreeTier).toBe(true);
    expect(quotaWarning(2, 2)).toBeNull();
  });

  it('REGRESSIO: kaikki rekisterin sarjat EI mahdu ilmaistasolle', () => {
    // Tama on se rajoite joka estaa "kaikki Euroopan sarjat" -kytkimen
    const q = estimateQuota(LEAGUES.length, 2);
    expect(q.withinFreeTier).toBe(false);
    expect(quotaWarning(LEAGUES.length, 2)).toContain('ilmaistaso');
  });

  it('kertoo montako sarjaa mahtuisi', () => {
    const q = estimateQuota(20, 2);
    // 500 / (2 x 30) = 8
    expect(q.maxLeaguesOnFreeTier).toBe(8);
  });

  it('harvempi ajo sallii enemman sarjoja', () => {
    expect(estimateQuota(20, 1).maxLeaguesOnFreeTier).toBeGreaterThan(estimateQuota(20, 2).maxLeaguesOnFreeTier);
  });

  it('nollat ja negatiiviset eivat tuota roskaa', () => {
    expect(estimateQuota(0, 2).creditsPerMonth).toBe(0);
    expect(estimateQuota(-5, 2).creditsPerMonth).toBe(0);
    expect(estimateQuota(5, 0).creditsPerMonth).toBe(0);
  });

  it('ilmaistason raja on dokumentoitu vakio', () => {
    expect(FREE_TIER_MONTHLY_CREDITS).toBe(500);
  });
});
