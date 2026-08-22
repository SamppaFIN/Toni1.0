import { describe, it, expect } from 'vitest';
import { parseWikipediaStandings } from '../ingest/stats-wikipedia.js';
import { parseStandings } from '../ingest/stats-footballdata.js';

/** Aito rakenne en.wikipedian sivulta "2026 Veikkausliiga" (lyhennetty) */
const WIKI_HTML = `
<div class="mw-parser-output">
<table class="wikitable" style="text-align:center">
<tr><th>Team</th><th>Home</th><th>Away</th></tr>
<tr><td>KuPS</td><td>2–1</td><td>0–0</td></tr>
</table>
<table class="wikitable sortable">
<tr><th>Pos</th><th>Team</th><th>Pld</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th><th>Qualification</th></tr>
<tr><td>1</td><td>KuPS (Q)</td><td>19</td><td>11</td><td>7</td><td>1</td><td>34</td><td>17</td><td>+17</td><td>40</td><td>Champions League</td></tr>
<tr><td>2</td><td>Inter Turku</td><td>19</td><td>9</td><td>8</td><td>2</td><td>25</td><td>14</td><td>+11</td><td>35</td><td></td></tr>
<tr><td>3</td><td>HJK</td><td>19</td><td>9</td><td>4</td><td>6</td><td>29</td><td>23</td><td>+6</td><td>31</td><td></td></tr>
<tr><td>4</td><td>VPS</td><td>19</td><td>8</td><td>6</td><td>5</td><td>27</td><td>18</td><td>+9</td><td>30</td><td></td></tr>
<tr><td>5</td><td>AC Oulu</td><td>19</td><td>9</td><td>3</td><td>7</td><td>22</td><td>22</td><td>0</td><td>30</td><td></td></tr>
<tr><td>6</td><td>IF Gnistan</td><td>19</td><td>8</td><td>5</td><td>6</td><td>29</td><td>24</td><td>+5</td><td>29</td><td></td></tr>
<tr><td>7</td><td>FC Lahti</td><td>19</td><td>7</td><td>5</td><td>7</td><td>22</td><td>16</td><td>+6</td><td>26</td><td></td></tr>
<tr><td>8</td><td>TPS</td><td>19</td><td>7</td><td>5</td><td>7</td><td>24</td><td>21</td><td>+3</td><td>26</td><td></td></tr>
<tr><td>9</td><td>Ilves[a]</td><td>19</td><td>7</td><td>4</td><td>8</td><td>31</td><td>31</td><td>0</td><td>25</td><td></td></tr>
<tr><td>10</td><td>SJK</td><td>19</td><td>4</td><td>6</td><td>9</td><td>24</td><td>29</td><td>−5</td><td>18</td><td></td></tr>
<tr><td>11</td><td>FF Jaro</td><td>19</td><td>3</td><td>6</td><td>10</td><td>18</td><td>38</td><td>−20</td><td>15</td><td></td></tr>
<tr><td>12</td><td>IFK Mariehamn (R)</td><td>19</td><td>1</td><td>3</td><td>15</td><td>9</td><td>41</td><td>−32</td><td>6</td><td>Relegation</td></tr>
</table>
</div>`;

describe('Wikipedian sarjataulukon parsinta', () => {
  const s = parseWikipediaStandings(WIKI_HTML, 'Veikkausliiga', '2026');

  it('löytää oikean taulukon useiden wikitable-taulukoiden joukosta', () => {
    expect(s.teams).toHaveLength(12);
  });

  it('lukee luvut oikein', () => {
    const kups = s.teams[0];
    expect(kups.name).toBe('KuPS');
    expect(kups.rank).toBe(1);
    expect(kups.played).toBe(19);
    expect(kups.won).toBe(11);
    expect(kups.draw).toBe(7);
    expect(kups.lost).toBe(1);
    expect(kups.gf).toBe(34);
    expect(kups.ga).toBe(17);
    expect(kups.points).toBe(40);
  });

  it('siivoaa karsinta- ja mestaruusmerkinnät nimestä', () => {
    expect(s.teams.map((t) => t.name)).toContain('KuPS');
    expect(s.teams.map((t) => t.name)).toContain('IFK Mariehamn');
    expect(s.teams.every((t) => !t.name.includes('('))).toBe(true);
  });

  it('siivoaa alaviitemerkinnät nimestä', () => {
    expect(s.teams.map((t) => t.name)).toContain('Ilves');
    expect(s.teams.every((t) => !t.name.includes('['))).toBe(true);
  });

  it('laskee sarjan maalikeskiarvon oikein', () => {
    // Maalit yhteensä 294, ottelut 12×19/2 = 114 → 2.58 maalia/ottelu
    const total = s.homeGoalsAvg + s.awayGoalsAvg;
    expect(total).toBeCloseTo(294 / 114, 4);
    // Kotietu: koti > vieras
    expect(s.homeGoalsAvg).toBeGreaterThan(s.awayGoalsAvg);
  });

  it('merkitsee splitit estimoiduiksi (taulukko ei erittele koti/vieras)', () => {
    expect(s.splitsEstimated).toBe(true);
    expect(s.teams[0].home_gf).toBeNull();
  });

  it('sarjataulukon summat täsmäävät: tehdyt = päästetyt', () => {
    // Jokainen maali on jonkun tekemä ja jonkun päästämä
    const gf = s.teams.reduce((a, t) => a + t.gf, 0);
    const ga = s.teams.reduce((a, t) => a + t.ga, 0);
    expect(gf).toBe(ga);
  });

  it('voitot ja häviöt täsmäävät', () => {
    const won = s.teams.reduce((a, t) => a + t.won, 0);
    const lost = s.teams.reduce((a, t) => a + t.lost, 0);
    expect(won).toBe(lost);
  });

  it('havaitsee väärin luetut sarakkeet: maalisummat eivät täsmää', () => {
    // Muutetaan yhden joukkueen tehdyt maalit → ΣTM ≠ ΣPM
    const broken = WIKI_HTML.replace('<td>34</td><td>17</td>', '<td>44</td><td>17</td>');
    expect(() => parseWikipediaStandings(broken, 'X', '2026')).toThrow(/tehdyt maalit .* ≠ päästetyt/);
  });

  it('havaitsee väärin luetut sarakkeet: voitot eivät täsmää häviöihin', () => {
    const broken = WIKI_HTML.replace('<td>11</td><td>7</td><td>1</td>', '<td>13</td><td>5</td><td>1</td>');
    expect(() => parseWikipediaStandings(broken, 'X', '2026')).toThrow(/voitot .* ≠ häviöt|V\+T\+H/);
  });

  it('heittää selkeän virheen jos taulukkoa ei löydy', () => {
    expect(() => parseWikipediaStandings('<div>ei taulukoita</div>', 'X', '2026')).toThrow(/rakenne on muuttunut/);
  });

  it('heittää virheen jos taulukossa on liian vähän joukkueita', () => {
    const tooFew = WIKI_HTML.replace(/<tr><td>[4-9]<\/td>[\s\S]*?<\/tr>/g, '').replace(/<tr><td>1[0-2]<\/td>[\s\S]*?<\/tr>/g, '');
    expect(() => parseWikipediaStandings(tooFew, 'X', '2026')).toThrow(/rakenne on muuttunut/);
  });
});

/** Aito rakenne football-data.orgin /standings-vastauksesta (lyhennetty) */
const FD_RESPONSE = {
  competition: { name: 'Premier League', code: 'PL' },
  season: { startDate: '2025-08-15', endDate: '2026-05-24' },
  standings: [
    {
      type: 'TOTAL' as const,
      table: [
        { position: 1, team: { id: 57, name: 'Arsenal FC', shortName: 'Arsenal', tla: 'ARS' }, playedGames: 38, won: 26, draw: 7, lost: 5, goalsFor: 71, goalsAgainst: 27, points: 85, form: 'W,W,W,W,W' },
        { position: 2, team: { id: 65, name: 'Manchester City FC', shortName: 'Man City', tla: 'MCI' }, playedGames: 38, won: 23, draw: 9, lost: 6, goalsFor: 77, goalsAgainst: 35, points: 78, form: 'L,D,W,W,D' },
      ],
    },
    {
      type: 'HOME' as const,
      table: [
        { position: 1, team: { id: 57, name: 'Arsenal FC' }, playedGames: 19, won: 15, draw: 3, lost: 1, goalsFor: 40, goalsAgainst: 12, points: 48 },
        { position: 2, team: { id: 65, name: 'Manchester City FC' }, playedGames: 19, won: 13, draw: 4, lost: 2, goalsFor: 44, goalsAgainst: 15, points: 43 },
      ],
    },
    {
      type: 'AWAY' as const,
      table: [
        { position: 1, team: { id: 57, name: 'Arsenal FC' }, playedGames: 19, won: 11, draw: 4, lost: 4, goalsFor: 31, goalsAgainst: 15, points: 37 },
        { position: 2, team: { id: 65, name: 'Manchester City FC' }, playedGames: 19, won: 10, draw: 5, lost: 4, goalsFor: 33, goalsAgainst: 20, points: 35 },
      ],
    },
  ],
};

describe('football-data.orgin sarjataulukon parsinta', () => {
  const s = parseStandings(FD_RESPONSE as never);

  it('kääntää sarjan nimen suomeksi', () => {
    expect(s.league).toBe('Valioliiga');
    expect(s.season).toBe('2025');
  });

  it('kokoaa aliakset täsmäytystä varten', () => {
    expect(s.teams[0].aliases).toContain('Arsenal');
    expect(s.teams[0].aliases).toContain('ARS');
  });

  it('yhdistää koti- ja vierastaulukot joukkue-ID:n perusteella', () => {
    const arsenal = s.teams[0];
    expect(arsenal.home_played).toBe(19);
    expect(arsenal.home_gf).toBe(40);
    expect(arsenal.away_gf).toBe(31);
    // Koti + vieras = kokonaismäärä
    expect(arsenal.home_gf! + arsenal.away_gf!).toBe(arsenal.gf);
  });

  it('splitit ovat mitattuja eikä estimoituja', () => {
    expect(s.splitsEstimated).toBe(false);
  });

  it('laskee sarjan koti/vierasmaalikeskiarvot mitatuista taulukoista', () => {
    // Mitattu: koti (40+44)/(19+19) = 2.21, vieras (31+33)/38 = 1.68.
    // Tiketti #48: luvut kutistetaan prioriin otoskoon mukaan, jotta yhden
    // ottelun otos ei tuota nollakeskiarvoa. 38 ottelulla mitattu data painaa
    // 79 % (K = 10), joten luku on lähellä mitattua muttei täsmälleen se.
    expect(s.homeGoalsAvg).toBeCloseTo((84 + 1.5 * 10) / 48, 4);
    expect(s.awayGoalsAvg).toBeCloseTo((64 + 1.2 * 10) / 48, 4);
    expect(s.homeGoalsAvg).toBeGreaterThan(s.awayGoalsAvg);
    // Mitattu data dominoi: luku on selvästi lähempänä mitattua kuin prioria
    expect(Math.abs(s.homeGoalsAvg - 84 / 38)).toBeLessThan(Math.abs(s.homeGoalsAvg - 1.5));
  });

  it('tiivistää formin muodosta "W,W,D" muotoon "WWD"', () => {
    expect(s.teams[0].form).toBe('WWWWW');
    expect(s.teams[1].form).toBe('LDWWD');
  });

  it('heittää virheen jos TOTAL-taulukko puuttuu', () => {
    const broken = { ...FD_RESPONSE, standings: [] };
    expect(() => parseStandings(broken as never)).toThrow(/TOTAL-taulukko puuttuu/);
  });

  it('toimii vaikka koti/vierastaulukot puuttuisivat', () => {
    const totalOnly = { ...FD_RESPONSE, standings: [FD_RESPONSE.standings[0]] };
    const r = parseStandings(totalOnly as never);
    expect(r.teams[0].home_gf).toBeNull();
    expect(r.splitsEstimated).toBe(true);
    expect(r.homeGoalsAvg).toBeGreaterThan(0);
  });
});
