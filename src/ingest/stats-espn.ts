// Tunnusluvut ESPN:n ottelutuloksista — varalähde kun football-data.org ei vastaa
//
// MIKSI TÄMÄ ON OLEMASSA:
//
// football-data.org on sarjataulukon ensisijainen lähde, mutta se vaatii
// FOOTBALL_DATA_TOKENin. Ilman sitä koko jalkapallopuoli putosi market-only-
// tilaan: ei voimalukuja, ei Poissonia, ei ennustetta — vaikka samat tulokset
// ovat ESPN:ssä ilmaiseksi ja Elo laskettiin niistä jo ennestään (#57).
//
// Vika oli siis se, että SAMA DATA riitti Eloon muttei tunnuslukuihin, koska
// tunnusluvut luettiin valmiista taulukosta eikä otteluista. Sarjataulukko on
// johdettavissa otteluista: pisteet, maalit, sija ja koti/vierassplitit ovat
// kaikki summia pelatuista otteluista.
//
// EDELLINEN KAUSI ON MUKANA, ja se on tässä koko jutun tärkein osa. Kolmen
// ottelun jälkeen kutistus vetää jokaisen joukkueen sarjan keskitasoon: ilman
// prioria Manchester Cityn hyökkäysvoima oli 0.97 vaikka se oli tehnyt 7 maalia
// kolmessa ottelussa. Malli olisi siis sanonut kaikista otteluista lähes samaa.
// Edellinen kausi haetaan antamalla haulle "nyt"-hetkeksi sen kauden loppu,
// jolloin ESPN palauttaa sen 380 ottelua kokonaisuudessaan.
//
// SPLITIT OVAT MITATTUJA EIVÄTKÄ ESTIMOITUJA: jokainen ottelu tiedetään
// koti- tai vieraspeliksi, joten `splitsEstimated` on false.

import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';
import { SeasonMatch } from './results-veikkausliiga.js';
import { fetchSeasonResultsEspn, hasEspnResults } from './results-espn.js';
import { leagueName } from '../leagues.js';

interface Tally {
  name: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  gf: number;
  ga: number;
  home_played: number;
  home_gf: number;
  home_ga: number;
  away_played: number;
  away_gf: number;
  away_ga: number;
  form: string[];
}

function blank(name: string): Tally {
  return {
    name,
    played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0,
    home_played: 0, home_gf: 0, home_ga: 0,
    away_played: 0, away_gf: 0, away_ga: 0,
    form: [],
  };
}

/** Jalkapallon pisteet: voitosta 3, tasapelistä 1. Ei jatkoaikaa sarjapelissä. */
export function footballPoints(t: Pick<Tally, 'won' | 'draw'>): number {
  return t.won * 3 + t.draw;
}

/**
 * Summaa ottelutulokset joukkuekohtaisiksi tunnusluvuiksi.
 *
 * Ottelut oletetaan päättyneiksi: `fetchSeasonResultsEspn` palauttaa vain
 * `state === 'post'` -tapahtumia. Kelvottomat rivit (puuttuva nimi tai
 * maalimäärä) ohitetaan sen sijaan että ne nollattaisiin — nolla maalia on
 * oikea tulos ja puuttuva luku on eri asia.
 */
export function tallyResults(matches: SeasonMatch[]): {
  teams: Tally[];
  homeGoals: number;
  awayGoals: number;
  matches: number;
} {
  const byName = new Map<string, Tally>();
  let homeGoals = 0;
  let awayGoals = 0;
  let played = 0;

  // Järjestys ratkaisee `form`-kentän: viimeisimmät viisi otetaan lopusta
  const ordered = [...matches].sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (const m of ordered) {
    const hn = m.home?.trim();
    const an = m.away?.trim();
    if (!hn || !an || !Number.isFinite(m.homeScore) || !Number.isFinite(m.awayScore)) continue;

    const h = byName.get(hn) ?? blank(hn);
    const a = byName.get(an) ?? blank(an);
    byName.set(hn, h);
    byName.set(an, a);

    played++;
    homeGoals += m.homeScore;
    awayGoals += m.awayScore;

    h.played++; h.gf += m.homeScore; h.ga += m.awayScore;
    h.home_played++; h.home_gf += m.homeScore; h.home_ga += m.awayScore;
    a.played++; a.gf += m.awayScore; a.ga += m.homeScore;
    a.away_played++; a.away_gf += m.awayScore; a.away_ga += m.homeScore;

    if (m.homeScore > m.awayScore) { h.won++; a.lost++; h.form.push('W'); a.form.push('L'); }
    else if (m.awayScore > m.homeScore) { a.won++; h.lost++; a.form.push('W'); h.form.push('L'); }
    else { h.draw++; a.draw++; h.form.push('D'); a.form.push('D'); }
  }

  return { teams: [...byName.values()], homeGoals, awayGoals, matches: played };
}

/** Sarjataulukon sija: pisteet, maaliero, tehdyt maalit. */
function rankTeams(teams: Tally[]): Map<string, number> {
  const ordered = [...teams].sort(
    (a, b) => footballPoints(b) - footballPoints(a) || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf
  );
  return new Map(ordered.map((t, i) => [t.name, i + 1]));
}

function toTeamStats(t: Tally, rank: number | null): TeamSeasonStats {
  return {
    name: t.name,
    aliases: [t.name],
    rank,
    played: t.played,
    won: t.won,
    draw: t.draw,
    lost: t.lost,
    gf: t.gf,
    ga: t.ga,
    points: footballPoints(t),
    home_played: t.home_played,
    home_gf: t.home_gf,
    home_ga: t.home_ga,
    away_played: t.away_played,
    away_gf: t.away_gf,
    away_ga: t.away_ga,
    form: t.form.slice(-5).join('') || null,
  };
}

/**
 * Kauden tunnusluvut ottelutuloksista.
 *
 * Palauttaa rakenteen myös tyhjälle listalle: tyhjä kausi on eri asia kuin
 * epäonnistunut haku, ja `buildCard` erottaa ne joukkuelistan pituudesta
 * (#103). Nollakeskiarvoa ei saa käyttää sellaisenaan — shrinkLeagueAverages
 * (#48) kutistaa sen ja isUsableLambda on viimeinen portti.
 */
export function buildSeasonFromResults(
  matches: SeasonMatch[],
  league: string,
  season: string,
  source: string
): LeagueSeasonStats {
  const { teams, homeGoals, awayGoals, matches: played } = tallyResults(matches);
  const ranks = rankTeams(teams);

  return {
    league,
    season,
    teams: teams.map((t) => toTeamStats(t, ranks.get(t.name) ?? null)),
    homeGoalsAvg: played ? homeGoals / played : 0,
    awayGoalsAvg: played ? awayGoals / played : 0,
    source,
    splitsEstimated: false,
  };
}

export function hasEspnStats(sportKey: string): boolean {
  return hasEspnResults(sportKey);
}

/** Sarjan tunnusluvut ESPN:n tuloksista. Heittää jos sarjalle ei ole koodia. */
export async function fetchEspnSeasonStats(sportKey: string, season: number, now = new Date()): Promise<LeagueSeasonStats> {
  const results = await fetchSeasonResultsEspn(sportKey, now);
  return buildSeasonFromResults(results, leagueName(sportKey), String(season), 'ESPN (tuloksista johdettu)');
}

/**
 * Edellisen kauden päättymishetki syksy–kevät-sarjassa.
 *
 * Kausi `year` alkaa 1.7.`year`, joten edellinen päättyy 30.6.`year`. Tämä
 * annetaan hakuun "nyt"-hetkenä, jolloin `seasonStart` osuu edellisen kauden
 * alkuun ja haku kattaa sen kokonaan.
 */
export function previousSeasonEnd(year: number): Date {
  return new Date(Date.UTC(year, 5, 30));
}

/**
 * Nykyinen kausi ja edellinen priorina — sama muoto kuin football-data.orgilla.
 *
 * Edellisen kauden puuttuminen EI ole virhe: se on lisä, ja ilman sitä
 * kutistus sarjan keskitasoon on varamenetelmä. Siksi sen haku on oman
 * try/catchinsa takana eikä kaada nykyisen kauden hakua.
 */
export async function fetchEspnStatsPair(
  sportKey: string,
  year: number,
  now = new Date()
): Promise<{ current: LeagueSeasonStats; previous: LeagueSeasonStats | null }> {
  const current = await fetchEspnSeasonStats(sportKey, year, now);

  let previous: LeagueSeasonStats | null = null;
  try {
    const end = previousSeasonEnd(year);
    const results = await fetchSeasonResultsEspn(sportKey, end);
    const built = buildSeasonFromResults(results, leagueName(sportKey), String(year - 1), 'ESPN (tuloksista johdettu)');
    if (built.teams.length) previous = built;
  } catch (err) {
    console.log(`[Stats] ${sportKey}: edellistä kautta ei saatu ESPN:stä — ${(err as Error).message}`);
  }

  return { current, previous };
}
