import { describe, it, expect } from 'vitest';
import {
  calculateSeasonElo,
  expectedScore,
  goalDifferenceMultiplier,
  eloProbabilities,
  toEloMap,
  STARTING_ELO,
  DEFAULT_K,
  HOME_ADVANTAGE,
} from '../analyze/season-elo.js';
import { parseSeasonResults, normalizeTeam, SeasonMatch } from '../ingest/results-veikkausliiga.js';

function match(date: string, home: string, hs: number, away: string, as: number): SeasonMatch {
  return { date, home, away, homeScore: hs, awayScore: as, outcome: hs > as ? 'home' : hs < as ? 'away' : 'draw' };
}

describe('Odotusarvo', () => {
  it('tasavahvat → 0.5', () => {
    expect(expectedScore(1500, 1500)).toBeCloseTo(0.5, 6);
  });

  it('400 pisteen ero → 10:1 suosikki', () => {
    expect(expectedScore(1900, 1500)).toBeCloseTo(10 / 11, 4);
  });

  it('symmetrinen: molempien odotusarvot summautuvat ykköseen', () => {
    expect(expectedScore(1600, 1400) + expectedScore(1400, 1600)).toBeCloseTo(1, 6);
  });
});

describe('Maalieron painotus', () => {
  it('yhden maalin voitto on perustaso', () => {
    expect(goalDifferenceMultiplier(1)).toBe(1);
    expect(goalDifferenceMultiplier(-1)).toBe(1);
    expect(goalDifferenceMultiplier(0)).toBe(1);
  });

  it('kahden maalin voitto painaa enemmän', () => {
    expect(goalDifferenceMultiplier(2)).toBe(1.5);
  });

  it('kasvaa maalieron myötä mutta vaimenee', () => {
    const m3 = goalDifferenceMultiplier(3);
    const m5 = goalDifferenceMultiplier(5);
    expect(m5).toBeGreaterThan(m3);
    // 5–0 ei ole viisi kertaa niin vakuuttava kuin 1–0
    expect(m5).toBeLessThan(5);
  });

  it('suunta ei vaikuta — vain itseisarvo', () => {
    expect(goalDifferenceMultiplier(3)).toBe(goalDifferenceMultiplier(-3));
  });
});

describe('Kausi-Elo — kaikki alkavat 1500:sta', () => {
  it('ilman otteluita kaikki ovat lähtötasolla', () => {
    const r = calculateSeasonElo([]);
    expect(r.ratings).toHaveLength(0);
    expect(r.matchesProcessed).toBe(0);
  });

  it('yksi ottelu: voittaja nousee, häviäjä laskee saman verran', () => {
    const r = calculateSeasonElo([match('2026-04-01', 'A', 2, 'B', 1)]);
    const a = r.ratings.find((x) => x.team === 'A')!;
    const b = r.ratings.find((x) => x.team === 'B')!;
    expect(a.elo).toBeGreaterThan(STARTING_ELO);
    expect(b.elo).toBeLessThan(STARTING_ELO);
    // Nollasummapeli: siirtymä on yhtä suuri molempiin suuntiin
    expect(a.elo - STARTING_ELO).toBeCloseTo(STARTING_ELO - b.elo, 6);
  });

  it('kotietu: kotivoitto nostaa vähemmän kuin vierasvoitto', () => {
    const homeWin = calculateSeasonElo([match('2026-04-01', 'A', 1, 'B', 0)]);
    const awayWin = calculateSeasonElo([match('2026-04-01', 'B', 0, 'A', 1)]);
    const gainAtHome = homeWin.ratings.find((x) => x.team === 'A')!.elo - STARTING_ELO;
    const gainAway = awayWin.ratings.find((x) => x.team === 'A')!.elo - STARTING_ELO;
    expect(gainAway).toBeGreaterThan(gainAtHome);
  });

  it('tasapeli tasavahvojen välillä siirtää lukua vain kotiedun verran', () => {
    const r = calculateSeasonElo([match('2026-04-01', 'A', 1, 'B', 1)]);
    const a = r.ratings.find((x) => x.team === 'A')!;
    // Kotijoukkueen odotettiin voittavan (kotietu), joten tasapeli laskee sitä
    expect(a.elo).toBeLessThan(STARTING_ELO);
    expect(Math.abs(a.elo - STARTING_ELO)).toBeLessThan(DEFAULT_K);
  });

  it('murskavoitto siirtää lukua enemmän kuin tiukka voitto', () => {
    const narrow = calculateSeasonElo([match('2026-04-01', 'A', 1, 'B', 0)]);
    const blowout = calculateSeasonElo([match('2026-04-01', 'A', 5, 'B', 0)]);
    const narrowGain = narrow.ratings.find((x) => x.team === 'A')!.elo - STARTING_ELO;
    const blowoutGain = blowout.ratings.find((x) => x.team === 'A')!.elo - STARTING_ELO;
    expect(blowoutGain).toBeGreaterThan(narrowGain);
  });

  it('koko liigan summa säilyy — Elo on nollasummapeli', () => {
    const matches = [
      match('2026-04-01', 'A', 2, 'B', 0),
      match('2026-04-08', 'B', 1, 'C', 1),
      match('2026-04-15', 'C', 3, 'A', 2),
      match('2026-04-22', 'A', 0, 'C', 1),
    ];
    const r = calculateSeasonElo(matches);
    const total = r.ratings.reduce((s, x) => s + x.elo, 0);
    expect(total).toBeCloseTo(STARTING_ELO * r.ratings.length, 4);
  });

  it('järjestys on merkitsevä — ottelut käsitellään kronologisesti', () => {
    const chronological = [match('2026-04-01', 'A', 3, 'B', 0), match('2026-05-01', 'A', 0, 'B', 1)];
    const shuffled = [chronological[1], chronological[0]];
    // Sama lopputulos kummassakin järjestyksessä, koska funktio lajittelee itse
    const a1 = calculateSeasonElo(chronological).ratings.find((x) => x.team === 'A')!.elo;
    const a2 = calculateSeasonElo(shuffled).ratings.find((x) => x.team === 'A')!.elo;
    expect(a1).toBeCloseTo(a2, 6);
  });

  it('kirjaa ottelutilastot oikein', () => {
    const r = calculateSeasonElo([
      match('2026-04-01', 'A', 2, 'B', 1),
      match('2026-04-08', 'A', 1, 'C', 1),
      match('2026-04-15', 'B', 3, 'A', 0),
    ]);
    const a = r.ratings.find((x) => x.team === 'A')!;
    expect(a.played).toBe(3);
    expect(a.won).toBe(1);
    expect(a.drawn).toBe(1);
    expect(a.lost).toBe(1);
    expect(a.goalsFor).toBe(3); // 2 + 1 + 0
    expect(a.goalsAgainst).toBe(5); // 1 + 1 + 3
  });

  it('change on aina elo − lähtötaso', () => {
    const r = calculateSeasonElo([match('2026-04-01', 'A', 2, 'B', 0)]);
    for (const rating of r.ratings) {
      expect(rating.change).toBeCloseTo(rating.elo - STARTING_ELO, 6);
    }
  });

  it('aikajana tallentaa jokaisen ottelun jälkeisen lukeman', () => {
    const r = calculateSeasonElo([match('2026-04-01', 'A', 2, 'B', 0), match('2026-04-08', 'A', 1, 'B', 0)]);
    expect(r.timeline.get('A')).toHaveLength(2);
    expect(r.timeline.get('A')![0].date).toBe('2026-04-01');
  });

  it('lajittelu: paras Elo ensin', () => {
    const r = calculateSeasonElo([match('2026-04-01', 'A', 3, 'B', 0)]);
    expect(r.ratings[0].team).toBe('A');
  });

  it('K-kerroin säätää herkkyyttä', () => {
    const soft = calculateSeasonElo([match('2026-04-01', 'A', 2, 'B', 0)], { k: 10 });
    const hard = calculateSeasonElo([match('2026-04-01', 'A', 2, 'B', 0)], { k: 40 });
    const softGain = soft.ratings.find((x) => x.team === 'A')!.change;
    const hardGain = hard.ratings.find((x) => x.team === 'A')!.change;
    expect(hardGain).toBeCloseTo(softGain * 4, 4);
  });
});

describe('Elo → 1X2-todennäköisyydet', () => {
  it('summautuvat ykköseen', () => {
    const p = eloProbabilities(1500, 1500);
    expect(p.home + p.draw + p.away).toBeCloseTo(1, 6);
  });

  it('tasavahvoilla koti on suosikki kotiedun takia', () => {
    const p = eloProbabilities(1500, 1500);
    expect(p.home).toBeGreaterThan(p.away);
  });

  it('vahvempi joukkue saa suuremman todennäköisyyden', () => {
    const p = eloProbabilities(1700, 1300);
    expect(p.home).toBeGreaterThan(0.6);
    expect(p.away).toBeLessThan(0.2);
  });

  it('tasapeli on todennäköisin tasaerossa ja harvinaisin isossa erossa', () => {
    const even = eloProbabilities(1500, 1500).draw;
    const lopsided = eloProbabilities(1900, 1300).draw;
    expect(even).toBeGreaterThan(lopsided);
  });

  it('tasapelin osuus pysyy jalkapallolle uskottavalla välillä', () => {
    for (const [h, a] of [[1500, 1500], [1600, 1400], [1900, 1200]] as const) {
      const p = eloProbabilities(h, a);
      expect(p.draw).toBeGreaterThan(0.10);
      expect(p.draw).toBeLessThan(0.32);
    }
  });
});

describe('Elo-kartta', () => {
  it('palauttaa hakukelpoisen kartan', () => {
    const r = calculateSeasonElo([match('2026-04-01', 'A', 2, 'B', 0)]);
    const map = toEloMap(r);
    expect(map.get('A')).toBeGreaterThan(STARTING_ELO);
    expect(map.size).toBe(2);
  });
});

describe('Joukkuenimien normalisointi', () => {
  it('kääntää lähdesivun nimet kerroinlähteen nimiksi', () => {
    expect(normalizeTeam('HJK Helsingfors')).toBe('HJK Helsinki');
    expect(normalizeTeam('Turun Palloseura')).toBe('TPS Turku');
    expect(normalizeTeam('Seinajoen JK')).toBe('SJK Seinäjoki');
    expect(normalizeTeam('Gnistan')).toBe('IF Gnistan');
    expect(normalizeTeam('FF Jaro')).toBe('Jaro');
  });

  it('tuntematon nimi palautuu sellaisenaan', () => {
    expect(normalizeTeam('Jokin Uusi Seura')).toBe('Jokin Uusi Seura');
  });
});

describe('Ottelutulosten parsinta', () => {
  // Aito rakenne veikkausliigapelit.fi:stä (tagien välit säilytetty)
  const html = `<section id="matchschema">
    ${Array.from({ length: 25 }, (_, i) => {
      const day = String((i % 28) + 1).padStart(2, '0');
      return `<div><span>2026-05-${day}</span><span>${i + 1}.5.2026</span><span>KuPS</span><span>${i % 4}-${i % 3}</span><span>HJK Helsingfors</span><span>Kuopio Football Stadium</span></div>`;
    }).join('')}
    <div><span>2026-08-31</span><span>31.8.2026</span><span>VPS</span><span>19:00</span><span>FC Lahti</span><span>Elisa Stadion</span></div>
  </section>`;

  it('jäsentää pelatut ottelut ja ohittaa tulevat', () => {
    const matches = parseSeasonResults(html);
    expect(matches).toHaveLength(25); // tuleva (kellonaika) jätetään pois
  });

  it('normalisoi joukkuenimet', () => {
    const matches = parseSeasonResults(html);
    expect(matches[0].home).toBe('KuPS Kuopio');
    expect(matches[0].away).toBe('HJK Helsinki');
  });

  it('päättelee lopputuloksen maaleista', () => {
    const matches = parseSeasonResults(html);
    for (const m of matches) {
      const expected = m.homeScore > m.awayScore ? 'home' : m.homeScore < m.awayScore ? 'away' : 'draw';
      expect(m.outcome).toBe(expected);
    }
  });

  it('palauttaa vanhin ensin', () => {
    const matches = parseSeasonResults(html);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].date >= matches[i - 1].date).toBe(true);
    }
  });

  it('heittää selkeän virheen jos ankkuria ei löydy', () => {
    expect(() => parseSeasonResults('<div>ei taulua</div>')).toThrow(/rakenne on muuttunut/);
  });

  it('heittää virheen jos tuloksia jäsentyi liian vähän', () => {
    const thin = `<section id="matchschema"><div><span>2026-05-01</span><span>1.5.2026</span><span>KuPS</span><span>1-0</span><span>HJK Helsingfors</span></div></section>`;
    expect(() => parseSeasonResults(thin)).toThrow(/parsinta on rikki/);
  });
});
