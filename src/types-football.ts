// Tiketti #23: today.json -snapshotin skeema (v1)
// Tämä tiedosto on KONTRAKTI Node-putken ja selaimen välillä.
// Putki kirjoittaa public/data/today.json, demo.html lukee sen.
// Jos muutat rakennetta, kasvata SCHEMA_VERSION — selain nollaa vanhentuneen tilan.

export const SCHEMA_VERSION = 1;

export type MarketSide = 'home' | 'draw' | 'away';
export type ValueFlagLevel = 'none' | 'candidate' | 'strong';

/** Yhden toimiston kertoimet yhteen otteluun */
export interface BookmakerOdds {
  bookmaker: string; // näyttönimi, esim. "Unibet"
  key: string; // API:n tunniste, esim. "unibet_eu"
  market: '1X2';
  /** Kerroin sellaisena kuin toimisto sen näyttää */
  home: number;
  draw: number;
  away: number;
  /**
   * Vedonvälityspörssin komissio voitosta (Betfair, Matchbook, Smarkets).
   * 0 tavallisille toimistoille. Pörssin näyttämä kerroin on aina liian hyvä:
   * komissio veloitetaan vasta voitosta, joten ilman tätä korjausta edge on
   * systemaattisesti yliarvioitu juuri niissä kohteissa jotka näyttävät parhailta.
   */
  commission: number;
  fetched_at: string;
}

/**
 * Paras saatavilla oleva kerroin per kohde kaikkien toimistojen yli.
 *
 * `home` on näytettävä hinta, `home_effective` komission jälkeen jäävä todellinen
 * hinta. Edge ja Kelly lasketaan AINA effective-hinnasta; käyttäjälle näytetään
 * se hinta jonka hän toimiston sivulla näkee.
 */
export interface BestOddsRow {
  home: number;
  draw: number;
  away: number;
  home_effective: number;
  draw_effective: number;
  away_effective: number;
  home_book: string | null;
  draw_book: string | null;
  away_book: string | null;
}

export interface SideProbs {
  home: number;
  draw: number;
  away: number;
}

export interface MarketView {
  /** Kirjanpitäjän kate parhaista kertoimista, esim. 0.042 = 4.2 % */
  margin: number;
  /** Devigattu markkinatodennäköisyys (kaikkien toimistojen mediaani) */
  implied: SideProbs;
  /** Devigattu sharp-ankkuri (Pinnacle jos saatavilla, muuten mediaani) */
  sharp: SideProbs | null;
  sharp_source: string | null;
}

export interface ModelAdjustment {
  reason: string;
  delta_lambda_home?: number;
  delta_lambda_away?: number;
}

export interface ScoreProb {
  score: string; // "2-1"
  p: number;
}

/**
 * Mallin tila. Kaikki Poisson-kentät ovat nullable, koska sarjoille joille ei ole
 * ilmaista tilastolähdettä (esim. Veikkausliiga) malli on pelkkä markkina-ankkuri.
 * Tämä on rehellisempää kuin keksiä joukkuevoimat tyhjästä.
 */
export type ModelMethod = 'poisson+sharp-blend' | 'poisson' | 'market-only';

export interface ModelView {
  method: ModelMethod;
  /** null kun tilastolähdettä ei ole → Poissonia ei voi laskea */
  lambda_home: number | null;
  lambda_away: number | null;
  /** Lopullinen malli — tämä on se jota vasten edge lasketaan */
  probs: SideProbs;
  /** Pelkkä Poisson ilman markkinaa — läpinäkyvyyden vuoksi näkyvissä */
  poisson_probs: SideProbs | null;
  blend_weight: number; // Poissonin paino blendissä; 0 = pelkkä markkina
  over25: number | null;
  btts: number | null;
  top_scores: ScoreProb[];
  adjustments: ModelAdjustment[];
}

export interface EdgeRow {
  side: MarketSide;
  /** Näytettävä kerroin */
  odds: number;
  /** Komission jälkeen jäävä kerroin — edge ja Kelly laskettu tästä */
  odds_effective: number;
  book: string | null;
  model_prob: number;
  implied_prob: number;
  edge: number;
  flag: ValueFlagLevel;
  kelly_fraction: number;
  stake_suggestion: number;
}

export interface AnalysisView {
  edges: EdgeRow[];
  /** Uutisikkuna: high-confidence-uutinen < 30 min JA kerroin ei liikkunut */
  news_window: boolean;
  bankroll_basis: number; // millä kassalla stake_suggestion laskettiin
}

export interface TeamStats {
  rank: number | null;
  played: number;
  form: string; // "WWDLW", uusin viimeisenä
  gf_pg: number;
  ga_pg: number;
  home_gf_pg: number | null;
  away_gf_pg: number | null;
  xg_pg: number | null;
  rest_days: number | null;
  ppg: number | null;
}

export interface H2HResult {
  date: string;
  score: string;
  venue: 'home' | 'away';
}

export interface MatchStats {
  home: TeamStats;
  away: TeamStats;
  h2h: H2HResult[];
}

/**
 * Yhden joukkueen kausitilastot sarjataulukosta.
 * Tämä on se muoto johon kaikki tilastolähteet normalisoidaan.
 */
export interface TeamSeasonStats {
  name: string;
  /** Vaihtoehtoiset kirjoitusasut täsmäytystä varten (shortName, lyhenne) */
  aliases: string[];
  rank: number | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  /** Tehdyt ja päästetyt maalit koko kaudella */
  gf: number;
  ga: number;
  /** Koti- ja vierassplitit — null jos lähde ei tarjoa niitä */
  home_played: number | null;
  home_gf: number | null;
  home_ga: number | null;
  away_played: number | null;
  away_gf: number | null;
  away_ga: number | null;
  /** Viimeisimmät tulokset, uusin viimeisenä, esim. "WWDLW" */
  form: string | null;
  points: number;
}

/** Sarjan tunnusluvut — nämä normalisoivat joukkuevoimat */
export interface LeagueSeasonStats {
  league: string;
  season: string;
  teams: TeamSeasonStats[];
  /** Kotijoukkueiden maalikeskiarvo sarjassa */
  homeGoalsAvg: number;
  /** Vierasjoukkueiden maalikeskiarvo sarjassa */
  awayGoalsAvg: number;
  /** Mistä luvut tulivat — näytetään käyttäjälle lähteenä */
  source: string;
  /** true jos koti/vierassplitit on estimoitu eikä mitattu */
  splitsEstimated: boolean;
}

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  published_at: string;
  event_type: string | null;
  team: string | null;
  player: string | null;
  confidence: number | null;
  impact: string | null;
}

export interface TeamRef {
  name: string;
  short: string;
  color: string;
}

export interface MatchCard {
  id: string; // "soccer_epl:2026-08-14:ARS-CHE"
  league: string;
  kickoff: string;
  home: TeamRef;
  away: TeamRef;
  odds: BookmakerOdds[];
  best: BestOddsRow;
  market: MarketView;
  model: ModelView;
  analysis: AnalysisView;
  /** null kun sarjalle ei ole ilmaista tilastolähdettä */
  stats: MatchStats | null;
  news: NewsItem[];
}

/**
 * `live` = oikeaa dataa rajapinnoista, `mock` = esimerkkidataa (UI varoittaa),
 * `manual` = käsin syötetyt kertoimet.
 */
export type SnapshotSource = 'live' | 'manual' | 'mock';

export interface Snapshot {
  schema_version: number;
  generated_at: string;
  sport: 'football';
  source: SnapshotSource;
  /** Käytetyt lähteet nimeltä — näytetään käyttäjälle, jotta luvut ovat jäljitettävissä */
  providers: string[];
  leagues: string[];
  matches: MatchCard[];
}
