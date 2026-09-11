// Sarjataulukko ESPN:n ottelutuloksista
//
// Tama on varalahde jota kaytetaan kun football-data.org ei vastaa (yleisimmin
// FOOTBALL_DATA_TOKEN puuttuu). Se laskee samat tunnusluvut joita ennen
// luettiin valmiista taulukosta, joten virhe tassa nakyisi suoraan mallin
// voimaluvuissa — ja voimaluvuista johdetaan lambda ja koko 1X2-jakauma.

import { describe, it, expect } from 'vitest';
import { tallyResults, buildSeasonFromResults, footballPoints, previousSeasonEnd } from '../ingest/stats-espn.js';
import type { SeasonMatch } from '../ingest/results-veikkausliiga.js';

function m(date: string, home: string, hs: number, as: number, away: string): SeasonMatch {
  return { date, home, away, homeScore: hs, awayScore: as, outcome: hs > as ? 'home' : as > hs ? 'away' : 'draw' };
}

// Pieni sarja jonka voi laskea kasin. A voittaa kotona, havia vieraissa,
// pelaa tasan kotona; B pelaa vain vieraissa.
const SARJA: SeasonMatch[] = [
  m('2026-08-01', 'A', 2, 0, 'B'),
  m('2026-08-08', 'C', 3, 1, 'A'),
  m('2026-08-15', 'A', 1, 1, 'C'),
  m('2026-08-22', 'C', 0, 2, 'B'),
];

describe('footballPoints', () => {
  it('voitosta 3, tasapelista 1', () => {
    expect(footballPoints({ won: 2, draw: 1 })).toBe(7);
    expect(footballPoints({ won: 0, draw: 0 })).toBe(0);
  });
});

describe('tallyResults', () => {
  it('summaa maalit ja ottelut oikein molemmille puolille', () => {
    const { teams, matches } = tallyResults(SARJA);
    expect(matches).toBe(4);

    const a = teams.find((t) => t.name === 'A')!;
    expect(a.played).toBe(3);
    expect(a.won).toBe(1);
    expect(a.draw).toBe(1);
    expect(a.lost).toBe(1);
    expect(a.gf).toBe(2 + 1 + 1); // 2 kotona, 1 vieraissa, 1 kotona
    expect(a.ga).toBe(0 + 3 + 1);
  });

  it('KOTI- JA VIERASSPLITIT ERIKSEEN — samat maalit eivat saa valua molempiin', () => {
    const a = tallyResults(SARJA).teams.find((t) => t.name === 'A')!;
    expect(a.home_played).toBe(2);
    expect(a.home_gf).toBe(3); // 2 + 1
    expect(a.home_ga).toBe(1); // 0 + 1
    expect(a.away_played).toBe(1);
    expect(a.away_gf).toBe(1);
    expect(a.away_ga).toBe(3);
    // Splittien summan on oltava sama kuin kokonaisluvun
    expect(a.home_gf + a.away_gf).toBe(a.gf);
    expect(a.home_ga + a.away_ga).toBe(a.ga);
    expect(a.home_played + a.away_played).toBe(a.played);
  });

  it('sarjan kotimaalit ja vierasmaalit summautuvat kaikkien otteluiden yli', () => {
    const { homeGoals, awayGoals } = tallyResults(SARJA);
    expect(homeGoals).toBe(2 + 3 + 1 + 0);
    expect(awayGoals).toBe(0 + 1 + 1 + 2);
  });

  it('form on aikajarjestyksessa uusin viimeisena', () => {
    const a = tallyResults(SARJA).teams.find((t) => t.name === 'A')!;
    expect(a.form.join('')).toBe('WLD');
  });

  it('syotteen jarjestys ei vaikuta tulokseen — form jarjestetaan paivamaaralla', () => {
    const sekoitettu = [SARJA[2], SARJA[0], SARJA[3], SARJA[1]];
    const a = tallyResults(sekoitettu).teams.find((t) => t.name === 'A')!;
    expect(a.form.join('')).toBe('WLD');
  });

  // Puuttuva maalimaara ei ole nolla maalia. Jos rivi nollattaisiin, se
  // nayttaisi maalittomalta ottelulta ja vaaristaisi sarjan keskiarvoa.
  it('kelvoton rivi ohitetaan eika nollata', () => {
    const rikki = [...SARJA, { date: '2026-08-29', home: 'A', away: 'B', homeScore: NaN, awayScore: 1, outcome: 'away' } as SeasonMatch];
    expect(tallyResults(rikki).matches).toBe(4);
  });

  it('tyhja lista -> tyhja tulos, ei kaadu', () => {
    expect(tallyResults([])).toEqual({ teams: [], homeGoals: 0, awayGoals: 0, matches: 0 });
  });
});

describe('buildSeasonFromResults', () => {
  it('sija maaraytyy pisteista, sitten maalierosta', () => {
    const s = buildSeasonFromResults(SARJA, 'Testiliiga', '2026', 'testi');
    const byName = Object.fromEntries(s.teams.map((t) => [t.name, t]));

    // A: V 2-0, H 1-3, T 1-1  -> 4 p, maalit 4-4
    // B: H 0-2, V 2-0         -> 3 p, maalit 2-2
    // C: V 3-1, T 1-1, H 0-2  -> 4 p, maalit 4-4
    expect(byName.A.points).toBe(4);
    expect(byName.B.points).toBe(3);
    expect(byName.C.points).toBe(4);

    // A ja C ovat tasan niin pisteissa, maalierossa kuin tehdyissakin;
    // vahemman pisteita saanut B jaa niiden alle.
    expect(byName.B.rank).toBe(3);
    expect([byName.A.rank, byName.C.rank].sort()).toEqual([1, 2]);
  });

  it('sijat ovat uniikkeja eivatka jata aukkoja', () => {
    const s = buildSeasonFromResults(SARJA, 'Testiliiga', '2026', 'testi');
    expect(s.teams.map((t) => t.rank).sort()).toEqual([1, 2, 3]);
  });

  it('sarjan maalikeskiarvot ovat per ottelu eivat per joukkue', () => {
    const s = buildSeasonFromResults(SARJA, 'Testiliiga', '2026', 'testi');
    expect(s.homeGoalsAvg).toBeCloseTo(6 / 4, 6);
    expect(s.awayGoalsAvg).toBeCloseTo(4 / 4, 6);
  });

  it('SPLITIT OVAT MITATTUJA — ottelun koti/vierasrooli tiedetaan aina', () => {
    expect(buildSeasonFromResults(SARJA, 'L', '2026', 'testi').splitsEstimated).toBe(false);
  });

  // Tyhja kausi on eri asia kuin epaonnistunut haku (#103). Rakenne on
  // palautettava, jotta kutsuja voi erottaa ne joukkuelistan pituudesta.
  it('tyhja kausi palauttaa rakenteen eika heita', () => {
    const s = buildSeasonFromResults([], 'Valioliiga', '2026', 'ESPN');
    expect(s.teams).toEqual([]);
    expect(s.homeGoalsAvg).toBe(0);
    expect(s.league).toBe('Valioliiga');
  });

  it('form on enintaan viisi viimeisinta', () => {
    const pitka = Array.from({ length: 8 }, (_, i) => m(`2026-08-0${i + 1}`, 'A', 1, 0, `X${i}`));
    const a = buildSeasonFromResults(pitka, 'L', '2026', 't').teams.find((t) => t.name === 'A')!;
    expect(a.form).toBe('WWWWW');
    expect(a.played).toBe(8);
  });
});

describe('previousSeasonEnd', () => {
  // Kausi 2026 alkaa 1.7.2026, joten edellinen paattyy 30.6.2026. Haku saa
  // taman "nyt"-hetkenaan, jolloin seasonStart osuu 1.7.2025:een.
  it('osuu edellisen kauden sisaan syksy-kevat-sarjassa', () => {
    const end = previousSeasonEnd(2026);
    expect(end.getUTCFullYear()).toBe(2026);
    expect(end.getUTCMonth()).toBe(5); // kesakuu
    expect(end.getUTCMonth()).toBeLessThan(6); // ENNEN heinakuuta — muuten haku osuisi vaaraan kauteen
  });
});
