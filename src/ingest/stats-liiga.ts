// Tiketti #92: Liigan tilastot mallin syötteeksi
//
// Jalkapalloputki on lajiriippumaton kaikessa muussa paitsi siinä MISTÄ
// tilastot tulevat: Poisson, blendi, Kelly, kortti ja arkisto käsittelevät
// `LeagueSeasonStats`-rakennetta eivätkä tiedä lajista mitään. Tämä moduuli
// tuottaa sen rakenteen Liigalle, jolloin koko koneisto toimii jääkiekolle
// ilman haarautumista.
//
// LÄHDE: liiga.fi/api/v2. Tiketin #2 `api/v1` on kuollut — se palauttaa
// HTML:ää kommentilla "redirect old". Nykyinen versio kaivettiin sivuston
// omasta bundlesta (`assets/index-*.js`), samalla tavalla kuin Torneopalin
// rajapinta tiketissä #85. robots.txt on tyhjä (vain AWS-kommentti), joten
// rajoituksia ei ole.
//
// KAUSINUMEROINTI: kausi 2026-27 on rajapinnassa `2027` eli päättymisvuosi.
// Johdetaan päivämäärästä eikä kovakoodata, muuten kausi jää vaihtuessaan
// menneeseen — sama virhe joka vältettiin Veikkausliigassa (#85).
//
// KAUDEN ALKU: 1.9.2026 pelattuja otteluita on NOLLA. Nykyinen kausi on siis
// tyhjä ja koko voimalaskenta nojaa edelliseen kauteen ja kausiennakon
// prioriin (#89). Se on oikein eikä puute: keksitty luku näyttäisi
// mittaukselta.

import { LeagueSeasonStats, TeamSeasonStats } from '../types-football.js';
import { LeagueStatsPair } from './stats.js';
import { cached } from './cache.js';

const BASE = 'https://liiga.fi/api/v2';

/** Liiga pelaa syksystä kevääseen; kausi nimetään päättymisvuoden mukaan. */
export function seasonYear(now: Date): number {
  // Elokuusta eteenpäin ollaan jo seuraavan kevään kaudessa
  return now.getUTCMonth() >= 7 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

interface LiigaApiTeam {
  teamId?: string;
  teamName?: string;
  goals?: number;
}

interface LiigaApiGame {
  id?: number;
  season?: number;
  start?: string;
  ended?: boolean;
  started?: boolean;
  finishedType?: string;
  homeTeam?: LiigaApiTeam;
  awayTeam?: LiigaApiTeam;
}

/** Rajapinnan arvo varsinaisella peliajalla ratkenneelle ottelulle */
export const REGULATION = 'ENDED_DURING_REGULAR_GAME_TIME';

/**
 * Varsinaisen peliajan lopputulos.
 *
 * TÄMÄ ON JÄÄKIEKON TÄRKEIN ERO JALKAPALLOON. Liigassa ottelu ratkeaa aina:
 * tasatilanteesta mennään jatkoajalle ja tarvittaessa voittomaalikilpailuun.
 * Loppulukema sisältää siis voittomaalin, jota varsinaisella peliajalla ei
 * tehty.
 *
 * 1X2-markkina hinnoitellaan VARSINAISEN PELIAJAN mukaan, ja kaudella 2026
 * 104 ottelua 480:sta (22 %) jatkui sen yli. Jos korjausta ei tehdä:
 *   - tasapelejä ei syntyisi lainkaan, vaikka niitä on joka viides ottelu
 *   - maalikeskiarvot olisivat ~0.22 maalia liian korkeat
 *   - koti/vieras-jakauma vääristyisi voittomaalien suuntaan
 * Malli tuottaisi silloin tasapelille lähes nollan todennäköisyyden ja
 * valtavia valheellisia edgejä tasapelikohteisiin.
 *
 * Korjaus on yksinkertainen: jatkoajalle menneessä ottelussa tilanne oli
 * varsinaisen peliajan päättyessä tasan häviäjän maalimäärässä.
 */
export function regulationScore(
  homeGoals: number,
  awayGoals: number,
  finishedType: string | undefined
): { home: number; away: number; wentToOvertime: boolean } {
  if (finishedType && finishedType !== REGULATION) {
    const tie = Math.min(homeGoals, awayGoals);
    return { home: tie, away: tie, wentToOvertime: true };
  }
  return { home: homeGoals, away: awayGoals, wentToOvertime: false };
}

async function fetchGames(season: number): Promise<LiigaApiGame[]> {
  const url = `${BASE}/games?tournament=runkosarja&season=${season}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'BetTracker/1.0 (harrastusprojekti)' },
  });
  if (!res.ok) throw new Error(`Liiga ${season}: ${res.status} ${res.statusText}`);
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) throw new Error(`Liiga ${season}: odottamaton vastausmuoto`);
  return data as LiigaApiGame[];
}

interface Tally {
  name: string;
  played: number;
  won: number;
  draw: number;
  lost: number;
  gf: number;
  ga: number;
  /** Jatkoajalla tai voittomaalikilpailussa ratkenneet — Liigan pisteytystä varten */
  otWin: number;
  otLoss: number;
  home_played: number;
  home_gf: number;
  home_ga: number;
  away_played: number;
  away_gf: number;
  away_ga: number;
  /** Uusin viimeisenä */
  form: string[];
}

function blank(name: string): Tally {
  return {
    name,
    played: 0, won: 0, draw: 0, lost: 0, gf: 0, ga: 0, otWin: 0, otLoss: 0,
    home_played: 0, home_gf: 0, home_ga: 0,
    away_played: 0, away_gf: 0, away_ga: 0,
    form: [],
  };
}

/**
 * Laske joukkuekohtaiset summat pelatuista otteluista.
 *
 * VAIN PÄÄTTYNEET OTTELUT. Kesken oleva ottelu antaisi osittaisen tuloksen
 * joka näyttäisi lopputulokselta — sama periaate kuin kaikkialla muualla
 * tässä putkessa.
 *
 * KAIKKI LUVUT OVAT VARSINAISELTA PELIAJALTA (ks. regulationScore).
 * Jääkiekossa "tasapeli" tarkoittaa tasatilannetta 60 minuutin jälkeen, ja
 * juuri niin 1X2-markkina hinnoitellaan. Rajapinnan `finishedType` kertoo
 * ratkesiko ottelu varsinaisella peliajalla, joten tasapelit saadaan
 * oikein — toisin kuin pelkästä loppulukemasta, jossa niitä ei olisi
 * lainkaan.
 */
export function tallyGames(games: LiigaApiGame[]): { teams: Tally[]; homeGoals: number; awayGoals: number; matches: number } {
  const byName = new Map<string, Tally>();
  let homeGoals = 0;
  let awayGoals = 0;
  let matches = 0;

  const played = games
    .filter((g) => g.ended === true)
    .sort((a, b) => String(a.start ?? '').localeCompare(String(b.start ?? '')));

  for (const g of played) {
    const hn = g.homeTeam?.teamName?.trim();
    const an = g.awayTeam?.teamName?.trim();
    const hg = g.homeTeam?.goals;
    const ag = g.awayTeam?.goals;
    if (!hn || !an || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;

    const h = byName.get(hn) ?? blank(hn);
    const a = byName.get(an) ?? blank(an);
    byName.set(hn, h);
    byName.set(an, a);

    // Malli laskee VARSINAISEN peliajan mukaan, koska 1X2 hinnoitellaan niin
    const reg = regulationScore(hg as number, ag as number, g.finishedType);

    matches++;
    homeGoals += reg.home;
    awayGoals += reg.away;

    h.played++; h.gf += reg.home; h.ga += reg.away;
    h.home_played++; h.home_gf += reg.home; h.home_ga += reg.away;
    a.played++; a.gf += reg.away; a.ga += reg.home;
    a.away_played++; a.away_gf += reg.away; a.away_ga += reg.home;

    if (reg.wentToOvertime) {
      // Varsinaisella peliajalla tasan. Liigan pisteet: JA-voitosta 2,
      // JA-tappiosta 1 -- voittaja ratkeaa loppulukemasta.
      h.draw++; a.draw++; h.form.push('D'); a.form.push('D');
      if ((hg as number) > (ag as number)) { h.otWin++; a.otLoss++; }
      else { a.otWin++; h.otLoss++; }
    } else if (reg.home > reg.away) { h.won++; a.lost++; h.form.push('W'); a.form.push('L'); }
    else { a.won++; h.lost++; a.form.push('W'); h.form.push('L'); }
  }

  return { teams: [...byName.values()], homeGoals, awayGoals, matches };
}

/**
 * Liigan pisteet: varsinaisen peliajan voitosta 3, JA/VK-voitosta 2,
 * JA/VK-tappiosta 1, varsinaisen peliajan tappiosta 0.
 */
export function liigaPoints(t: Pick<Tally, 'won' | 'otWin' | 'otLoss'>): number {
  return t.won * 3 + t.otWin * 2 + t.otLoss;
}

/** Sarjataulukon sija: pisteet, sitten maaliero. */
function rankTeams(teams: Tally[]): Map<string, number> {
  const points = liigaPoints;
  const ordered = [...teams].sort((a, b) => points(b) - points(a) || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);
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
    points: liigaPoints(t),
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
 * Yhden kauden tilastot.
 *
 * Palauttaa rakenteen myös silloin kun otteluita ei ole pelattu yhtään —
 * tyhjä kausi on eri asia kuin epäonnistunut haku, ja kutsuja erottaa ne
 * `homeGoalsAvg`-arvosta ja joukkuelistan pituudesta.
 */
export function buildSeason(games: LiigaApiGame[], season: number): LeagueSeasonStats {
  const { teams, homeGoals, awayGoals, matches } = tallyGames(games);
  const ranks = rankTeams(teams);

  return {
    league: 'Liiga',
    season: String(season),
    teams: teams.map((t) => toTeamStats(t, ranks.get(t.name) ?? null)),
    // Nolla otteluta -> nolla keskiarvo. Kutsuja EI saa kayttaa sita
    // sellaisenaan; shrinkLeagueAverages (#48) hoitaa kutistuksen, ja
    // isUsableLambda (#48) on viimeinen portti.
    homeGoalsAvg: matches ? homeGoals / matches : 0,
    awayGoalsAvg: matches ? awayGoals / matches : 0,
    source: 'liiga.fi/api/v2',
    splitsEstimated: false,
  };
}

/**
 * Liigan tilastot: nykyinen kausi ja edellinen priorina.
 *
 * Välimuisti 6 h. Kauden alussa nykyinen kausi on tyhjä ja koko voima nojaa
 * edelliseen kauteen — juuri se tilanne jota varten kausiennakon priori
 * (#89) on olemassa uusille joukkueille joilla ei ole edellistäkään.
 */
export async function fetchLiigaStats(now = new Date()): Promise<LeagueStatsPair | null> {
  const year = seasonYear(now);

  let current: LeagueSeasonStats;
  try {
    const games = await cached(`liiga-games-${year}`, () => fetchGames(year), 6 * 3600_000);
    current = buildSeason(games, year);
  } catch (err) {
    console.warn(`[Liiga] kauden ${year} haku epäonnistui: ${(err as Error).message}`);
    console.warn('[Liiga] → malli jää market-only-tilaan');
    return null;
  }

  let previous: LeagueSeasonStats | null = null;
  try {
    const games = await cached(`liiga-games-${year - 1}`, () => fetchGames(year - 1), 24 * 3600_000);
    previous = buildSeason(games, year - 1);
  } catch (err) {
    // Edellisen kauden puuttuminen ei ole virhe — kutistus hoitaa varan
    console.warn(`[Liiga] edellistä kautta ei saatu: ${(err as Error).message}`);
  }

  const pelatut = current.teams.reduce((n, t) => n + t.played, 0) / 2;
  console.log(
    `[Liiga] kausi ${year}: ${current.teams.length} joukkuetta, ${Math.round(pelatut)} pelattua ottelua` +
      (previous ? ` · edellinen kausi ${previous.teams.length} joukkuetta priorina` : ' · ei edellistä kautta')
  );

  return { current, previous };
}
