// Tiketti #36: Kausi-Elo — kaikki alkavat 1500:sta
//
// Miksi tämä eikä ClubElo: ClubElo kattaa vain 4/12 Veikkausliigan seuraa,
// eikä niidenkään luku päivity kotimaisista otteluista (HJK:n arvo oli
// jäätynyt 1246,6:een 27.2.–14.8. välisen ajan, ~115 pelatun ottelun yli).
//
// Kun kaikki aloittavat samasta 1500:sta ja luku päivittyy jokaisesta kauden
// ottelusta, tulos kertoo TÄMÄN kauden voimasuhteet — ei historiaa. Se on
// juuri se mitä ottelupäivän ennuste tarvitsee.
//
// Rajoitus, joka on hyvä tietää: kauden alussa luvut ovat lähellä toisiaan
// eivätkä erottele mitään. Elo tarvitsee ~10 kierrosta ennen kuin se sanoo
// enemmän kuin sarjataulukko. Siksi tämä TÄYDENTÄÄ Poisson-mallia eikä
// korvaa sitä.

import { pathToFileURL } from 'node:url';
import { SeasonMatch } from '../ingest/results-veikkausliiga.js';

/** Kaikki aloittavat tästä — pyynnön mukaisesti */
export const STARTING_ELO = 1500;

/**
 * K-kerroin: kuinka voimakkaasti yksi ottelu siirtää lukua.
 * 20 on jalkapallon vakiintunut taso (jääkiekon 32 on aggressiivisempi).
 * Liian iso K heiluttaa lukua satunnaisen tuloksen mukana, liian pieni
 * ei ehdi reagoida kauden mittaan.
 */
export const DEFAULT_K = 20;

/**
 * Kotietu Elo-pisteinä. Vähennetään kotijoukkueen odotusarvosta, jotta
 * kotivoitto ei nosta lukua yhtä paljon kuin vierasvoitto.
 */
export const HOME_ADVANTAGE = 55;

export interface EloRating {
  team: string;
  elo: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** Elo-luvun muutos kauden alusta (aina elo − 1500) */
  change: number;
}

export interface EloTimelinePoint {
  date: string;
  elo: number;
}

export interface SeasonEloResult {
  ratings: EloRating[];
  /** Jokaisen joukkueen Elo-kehitys ajan yli — kuvaajaa varten */
  timeline: Map<string, EloTimelinePoint[]>;
  matchesProcessed: number;
}

/** Odotettu tulos Elo-erosta. 0.5 = tasavahvat. */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/**
 * Maalieron painotus: 3–0 siirtää lukua enemmän kuin 1–0.
 *
 * Ilman tätä murskavoitto ja tiukka voitto olisivat samanarvoisia, mikä
 * hukkaisi selvästi informatiivista signaalia. Kaava on FIFA:n
 * maailmanlistan käyttämä logaritminen vaimennus — 5–0 ei ole viisi kertaa
 * niin vakuuttava kuin 1–0.
 */
export function goalDifferenceMultiplier(goalDiff: number): number {
  const margin = Math.abs(goalDiff);
  if (margin <= 1) return 1;
  if (margin === 2) return 1.5;
  return (11 + margin) / 8;
}

/**
 * Laske kauden Elo-luvut nollasta.
 *
 * Ottelut käsitellään kronologisessa järjestyksessä — järjestys on
 * merkitsevä, koska jokainen ottelu käyttää sitä hetkeä edeltäviä lukuja.
 */
export function calculateSeasonElo(
  matches: SeasonMatch[],
  options: {
    k?: number;
    homeAdvantage?: number;
    startingElo?: number;
    /**
     * JOUKKUEKOHTAINEN lahto-Elo (tiketti #104).
     *
     * Veikkausliigassa kaikki aloittavat samasta luvusta, koska mitaan
     * ennakkotietoa ei kayteta. Liigassa lahtotaso tulee kausiennakosta
     * (#89/#96): Tappara 1620, Jukurit 1380. Ilman tata kauden ensimmaiset
     * kierrokset laskisivat Elon tyhjasta ja hukkaisivat sen ainoan
     * lahtotiedon joka on olemassa.
     *
     * Avain on normalisoitu joukkuenimi. Puuttuva joukkue saa `startingElo`n.
     *
     * HUOM: nollasummaisuus ei enaa pade jos lahtoarvot eroavat -- summa
     * sailyy, mutta se ei ole 17 x 1500. Testi tarkistaa sailymisen, ei
     * absoluuttista arvoa.
     */
    startingElos?: Map<string, number>;
    /** Nimien normalisointi lahtoarvokartan avaimiksi */
    normalizeKey?: (team: string) => string;
  } = {}
): SeasonEloResult {
  const k = options.k ?? DEFAULT_K;
  const homeAdvantage = options.homeAdvantage ?? HOME_ADVANTAGE;
  const startingElo = options.startingElo ?? STARTING_ELO;
  const normalize = options.normalizeKey ?? ((t: string) => t);

  const elo = new Map<string, number>();
  const stats = new Map<string, Omit<EloRating, 'elo' | 'change'>>();
  const timeline = new Map<string, EloTimelinePoint[]>();

  const ensure = (team: string) => {
    if (!elo.has(team)) {
      elo.set(team, options.startingElos?.get(normalize(team)) ?? startingElo);
      stats.set(team, { team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0 });
      timeline.set(team, []);
    }
  };

  const ordered = [...matches].sort((a, b) => a.date.localeCompare(b.date));

  for (const m of ordered) {
    ensure(m.home);
    ensure(m.away);

    const homeElo = elo.get(m.home)!;
    const awayElo = elo.get(m.away)!;

    // Kotietu lisätään vain odotusarvon laskentaan, ei itse lukuun
    const expectedHome = expectedScore(homeElo + homeAdvantage, awayElo);
    const actualHome = m.outcome === 'home' ? 1 : m.outcome === 'draw' ? 0.5 : 0;

    const multiplier = goalDifferenceMultiplier(m.homeScore - m.awayScore);
    const delta = k * multiplier * (actualHome - expectedHome);

    elo.set(m.home, homeElo + delta);
    elo.set(m.away, awayElo - delta); // nollasummapeli

    for (const [team, gf, ga, result] of [
      [m.home, m.homeScore, m.awayScore, m.outcome === 'home' ? 'w' : m.outcome === 'draw' ? 'd' : 'l'],
      [m.away, m.awayScore, m.homeScore, m.outcome === 'away' ? 'w' : m.outcome === 'draw' ? 'd' : 'l'],
    ] as Array<[string, number, number, string]>) {
      const s = stats.get(team)!;
      s.played++;
      s.goalsFor += gf;
      s.goalsAgainst += ga;
      if (result === 'w') s.won++;
      else if (result === 'd') s.drawn++;
      else s.lost++;
      timeline.get(team)!.push({ date: m.date, elo: elo.get(team)! });
    }
  }

  const ratings: EloRating[] = [...stats.values()]
    // Tiketti #104: muutos mitataan JOUKKUEEN OMASTA lahtoarvosta.
    //
    // Aiemmin tassa oli kiintea `startingElo`, mika oli oikein niin kauan
    // kuin kaikki aloittivat samasta luvusta. Joukkuekohtaisilla
    // lahtoarvoilla (Liigan kausiennakko) se mittasi etaisyytta 1500:sta
    // eika liiketta -- ja juuri liike on se mita kortilla halutaan nahda.
    .map((s) => ({
      ...s,
      elo: elo.get(s.team)!,
      change: elo.get(s.team)! - (options.startingElos?.get(normalize(s.team)) ?? startingElo),
    }))
    .sort((a, b) => b.elo - a.elo);

  return { ratings, timeline, matchesProcessed: ordered.length };
}

/** Elo-luvut hakukelpoisena karttana joukkuenimen perusteella */
export function toEloMap(result: SeasonEloResult): Map<string, number> {
  return new Map(result.ratings.map((r) => [r.team, r.elo]));
}

/**
 * 1X2-todennäköisyydet Elo-erosta.
 *
 * Tasapelin osuus kasvaa kun joukkueet ovat tasavahvoja — sama periaate kuin
 * jääkiekkopuolen predict.ts:ssä, mutta jalkapallon tasapeliosuudella (~26 %).
 */
export function eloProbabilities(
  homeElo: number,
  awayElo: number,
  homeAdvantage = HOME_ADVANTAGE
): { home: number; draw: number; away: number } {
  const diff = homeElo + homeAdvantage - awayElo;
  const rawHome = expectedScore(homeElo + homeAdvantage, awayElo);

  // Tasapelin osuus: suurin tasaerossa, pienenee eron kasvaessa
  const draw = Math.max(0.14, 0.28 - Math.abs(diff) / 1400);
  const home = rawHome * (1 - draw);
  const away = (1 - rawHome) * (1 - draw);

  const total = home + draw + away;
  return { home: home / total, draw: draw / total, away: away / total };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { fetchSeasonResults } = await import('../ingest/results-veikkausliiga.js');
  const matches = await fetchSeasonResults();
  const result = calculateSeasonElo(matches);

  console.log(`Veikkausliiga 2026 — Elo kauden alusta (kaikki aloittivat ${STARTING_ELO}:sta)`);
  console.log(`${result.matchesProcessed} ottelua käsitelty, K=${DEFAULT_K}, kotietu ${HOME_ADVANTAGE}\n`);
  console.log('  #  Joukkue            Elo   Muutos   O   V-T-H     TM-PM');
  result.ratings.forEach((r, i) => {
    const record = `${r.won}-${r.drawn}-${r.lost}`;
    console.log(
      `  ${String(i + 1).padStart(2)} ${r.team.padEnd(17)} ${r.elo.toFixed(0).padStart(4)}  ${(r.change >= 0 ? '+' : '') + r.change.toFixed(0)}`.padEnd(48) +
        `${String(r.played).padStart(2)}  ${record.padEnd(8)} ${r.goalsFor}-${r.goalsAgainst}`
    );
  });

  console.log('\nEsimerkki: kärki vs. jumbo');
  const top = result.ratings[0];
  const bottom = result.ratings[result.ratings.length - 1];
  const p = eloProbabilities(top.elo, bottom.elo);
  console.log(`  ${top.team} (koti) vs ${bottom.team}`);
  console.log(`  1: ${(p.home * 100).toFixed(1)} %  X: ${(p.draw * 100).toFixed(1)} %  2: ${(p.away * 100).toFixed(1)} %`);
}
