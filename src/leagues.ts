// Tiketti #61: Sarjarekisteri — yksi totuus siitä mitä sarjoja tuetaan
//
// MIKSI TÄMÄ ON OLEMASSA:
// Sarjalistaa ylläpidettiin kolmessa paikassa erikseen — tilastolähteet
// (ingest/stats.ts), tuloslähteet (ingest/results-espn.ts) ja näyttönimet
// (ingest/odds-football.ts). Listat pääsivät hajaantumaan hiljaa: sarja
// saattoi olla tuettu kertoimissa muttei tilastoissa, jolloin se putosi
// market-only-tilaan ilman että kukaan huomasi miksi.
//
// Nyt lisäys tehdään TÄHÄN, ja kaikki kolme johdetaan siitä.
//
// ESPN-koodit on VARMISTETTU kutsumalla (24.8.2026). Puolan Ekstraklasa
// puuttuu tarkoituksella: `pol.1` palauttaa 400, eikä toimivaa koodia
// arvattu — arvattu koodi näyttäisi tuelta muttei toimisi.

export interface LeagueDef {
  /** The Odds APIn sarjatunniste — kertoimien haku */
  sportKey: string;
  /** Näyttönimi käyttöliittymässä */
  name: string;
  /** ESPN-sarjakoodi: ottelutulokset (Elo) ja live-tilastot. null = ei tuettu. */
  espn: string | null;
  /**
   * football-data.orgin sarjakoodi: sarjataulukko joukkuevoimia varten.
   * null tarkoittaa ettei ilmaista tilastolähdettä ole — malli jää
   * market-only-tilaan, mutta Elo lasketaan silti ESPN-tuloksista.
   */
  footballData: string | null;
  /** Veikkausliiga on erikoistapaus: tilastot Wikipediasta (ks. stats-wikipedia.ts) */
  wikipedia?: boolean;
  /** Kausityyppi vaikuttaa siihen mikä vuosi on "nykyinen kausi" */
  season: 'autumn-spring' | 'calendar';
}

export const LEAGUES: LeagueDef[] = [
  // ── Viisi suurta: kertoimet, tilastot ja tulokset kaikki saatavilla ──
  { sportKey: 'soccer_epl', name: 'Valioliiga', espn: 'eng.1', footballData: 'PL', season: 'autumn-spring' },
  { sportKey: 'soccer_spain_la_liga', name: 'La Liga', espn: 'esp.1', footballData: 'PD', season: 'autumn-spring' },
  { sportKey: 'soccer_italy_serie_a', name: 'Serie A', espn: 'ita.1', footballData: 'SA', season: 'autumn-spring' },
  { sportKey: 'soccer_germany_bundesliga', name: 'Bundesliga', espn: 'ger.1', footballData: 'BL1', season: 'autumn-spring' },
  { sportKey: 'soccer_france_ligue_one', name: 'Ligue 1', espn: 'fra.1', footballData: 'FL1', season: 'autumn-spring' },

  // ── Muut joilla on football-data.orgin ilmaistilastot ──
  { sportKey: 'soccer_efl_champ', name: 'Championship', espn: 'eng.2', footballData: 'ELC', season: 'autumn-spring' },
  { sportKey: 'soccer_netherlands_eredivisie', name: 'Eredivisie', espn: 'ned.1', footballData: 'DED', season: 'autumn-spring' },
  { sportKey: 'soccer_portugal_primeira_liga', name: 'Primeira Liga', espn: 'por.1', footballData: 'PPL', season: 'autumn-spring' },
  { sportKey: 'soccer_uefa_champs_league', name: 'Mestarien liiga', espn: 'uefa.champions', footballData: 'CL', season: 'autumn-spring' },

  // ── Kotimainen: tilastot Wikipediasta, kalenterikausi ──
  { sportKey: 'soccer_finland_veikkausliiga', name: 'Veikkausliiga', espn: 'fin.1', footballData: null, wikipedia: true, season: 'calendar' },

  // ── Sarjat joilla EI ole ilmaista tilastolähdettä ──
  // Malli jää market-only-tilaan, mutta Elo lasketaan ESPN-tuloksista ja
  // hintavertailu toimii normaalisti. Tämä on tarkoituksellinen degradaatio.
  { sportKey: 'soccer_belgium_first_div', name: 'Jupiler Pro League', espn: 'bel.1', footballData: null, season: 'autumn-spring' },
  { sportKey: 'soccer_turkey_super_league', name: 'Süper Lig', espn: 'tur.1', footballData: null, season: 'autumn-spring' },
  { sportKey: 'soccer_switzerland_superleague', name: 'Super League', espn: 'sui.1', footballData: null, season: 'autumn-spring' },
  { sportKey: 'soccer_austria_bundesliga', name: 'Itävallan Bundesliiga', espn: 'aut.1', footballData: null, season: 'autumn-spring' },
  { sportKey: 'soccer_spl', name: 'Skotlannin Valioliiga', espn: 'sco.1', footballData: null, season: 'autumn-spring' },
  { sportKey: 'soccer_greece_super_league', name: 'Kreikan Super League', espn: 'gre.1', footballData: null, season: 'autumn-spring' },
  { sportKey: 'soccer_uefa_europa_league', name: 'Eurooppa-liiga', espn: 'uefa.europa', footballData: null, season: 'autumn-spring' },

  // ── Pohjoismaat: kalenterikausi ──
  { sportKey: 'soccer_denmark_superliga', name: 'Superliga', espn: 'den.1', footballData: null, season: 'autumn-spring' },
  { sportKey: 'soccer_norway_eliteserien', name: 'Eliteserien', espn: 'nor.1', footballData: null, season: 'calendar' },
  { sportKey: 'soccer_sweden_allsvenskan', name: 'Allsvenskan', espn: 'swe.1', footballData: null, season: 'calendar' },
];

const BY_KEY = new Map(LEAGUES.map((l) => [l.sportKey, l]));

export function leagueFor(sportKey: string): LeagueDef | null {
  return BY_KEY.get(sportKey) ?? null;
}

export function leagueName(sportKey: string): string {
  return BY_KEY.get(sportKey)?.name ?? sportKey;
}

/** Sarjat joilla on jokin tilastolähde — muut jäävät market-only-tilaan */
export function leaguesWithStats(): LeagueDef[] {
  return LEAGUES.filter((l) => l.footballData || l.wikipedia);
}

// ─── Kvootta ──────────────────────────────────────────────────────────────
//
// The Odds APIn ilmaistaso on 500 krediittiä kuukaudessa. Kerroinhaku maksaa
// 1 krediitin PER SARJA, joten hinta kasvaa lineaarisesti sarjojen määrässä.
// Tämä on se rajoite joka estää "kaikki Euroopan sarjat" -kytkimen: 20 sarjaa
// kahdesti vuorokaudessa olisi 1200 krediittiä kuukaudessa.

export const FREE_TIER_MONTHLY_CREDITS = 500;

export interface QuotaEstimate {
  leagues: number;
  runsPerDay: number;
  creditsPerDay: number;
  creditsPerMonth: number;
  withinFreeTier: boolean;
  /** Kuinka monta sarjaa mahtuisi ilmaistasolle tällä ajotiheydellä */
  maxLeaguesOnFreeTier: number;
}

/**
 * Arvioi kerroinhaun kuukausikulutus.
 *
 * Tuloshaku (/scores) ei ole mukana: se ajetaan kerran vuorokaudessa ja
 * maksaa 2 krediittiä per sarja, mutta ESPN korvasi sen Elo-laskennassa
 * (tiketti #57) — jäljellä oleva käyttö on pieni ja vakio.
 */
export function estimateQuota(leagueCount: number, runsPerDay = 2, daysPerMonth = 30): QuotaEstimate {
  const creditsPerDay = Math.max(0, leagueCount) * Math.max(0, runsPerDay);
  const creditsPerMonth = creditsPerDay * daysPerMonth;
  const perLeagueMonthly = Math.max(1, runsPerDay * daysPerMonth);
  return {
    leagues: leagueCount,
    runsPerDay,
    creditsPerDay,
    creditsPerMonth,
    withinFreeTier: creditsPerMonth <= FREE_TIER_MONTHLY_CREDITS,
    maxLeaguesOnFreeTier: Math.floor(FREE_TIER_MONTHLY_CREDITS / perLeagueMonthly),
  };
}

/**
 * Varoita jos konfiguroidut sarjat ylittävät ilmaistason.
 *
 * Ei estä ajoa: käyttäjä voi olla maksavalla tasolla. Vuorokausikatto
 * (ODDS_DAILY_CREDIT_BUDGET) on se joka oikeasti pysäyttää putken.
 */
export function quotaWarning(leagueCount: number, runsPerDay = 2): string | null {
  const q = estimateQuota(leagueCount, runsPerDay);
  if (q.withinFreeTier) return null;
  return (
    `${q.leagues} sarjaa × ${q.runsPerDay} ajoa/vrk = ${q.creditsPerMonth} krediittiä/kk, ` +
    `mutta ilmaistaso on ${FREE_TIER_MONTHLY_CREDITS}. ` +
    `Ilmaistasolle mahtuu ${q.maxLeaguesOnFreeTier} sarjaa tällä ajotiheydellä.`
  );
}
