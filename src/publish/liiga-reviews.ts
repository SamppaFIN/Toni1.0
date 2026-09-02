// Tiketti #105: Liigan kierrosarviointi
//
// Sama kysymys kuin jalkapallossa (#76): meninkö analyysissä pieleen vai
// kävikö huono tuuri? Osumatarkkuus ei erota niitä, mutta maaliaikajana
// erottaa.
//
// KOLME JÄÄKIEKKOKOHTAISTA EROA jalkapalloversioon:
//
//   1. PELIAIKA 60 MINUUTTIA, ei 90. Funktiot ovat samat, vain pituus
//      annetaan parametrina.
//
//   2. VARSINAINEN PELIAIKA RATKAISEE. Jatkoajalla tai voittomaalikilpailussa
//      päättynyt ottelu on 1X2:n kannalta TASAPELI, ja jatkoajan maalit
//      jätetään aikajanan ulkopuolelle. Sama sääntö kuin tilastoissa (#92)
//      ja Elossa (#104).
//
//   3. MAALIDATA LIIGA.FI:STÄ. `goalEvents[].gameTime` on SEKUNTEJA ottelun
//      alusta — sama sudenkuoppa kuin ESPN:n `clock.value` (#76), jossa 874
//      olisi merkitty 874. minuutille ilman muunnosta.
//
// VÄITTEET, ei pelkkä osuma. Jokaiselle ottelulle kirjataan mihin mallin luku
// perustui, jotta jälkikäteen voi kysyä MIKÄ meni pieleen eikä vain että
// meni. Kolme väitettä ovat mitattavia:
//   - tasapelikorjaus: sanoiko malli tasapelistä enemmän kuin markkina
//   - kausiennakon sija: voittiko ennakon suosikki
//   - kotietu: toteutuiko kotivoitto-osuus jota malli odotti

import { MarketSide, SideProbs } from '../types-football.js';
import { leadingMinutes, lastLeadMinute, HOCKEY_FULL_TIME, type Goal, type Verdict } from './reviews.js';
import { regulationScore, type LiigaApiGame } from '../ingest/stats-liiga.js';
import { effectiveRank, normalizeLiigaName, TEAM_PRIORS } from '../analyze/liiga-priors.js';

export interface ClaimResult {
  /** Väitteen nimi, näytetään sellaisenaan */
  claim: string;
  /** Mitä malli sanoi */
  model: string;
  /** Mitä tapahtui */
  actual: string;
  /** Osuiko väite tässä ottelussa. null = ei testattavissa tällä ottelulla. */
  hit: boolean | null;
  /** Miksi, yhdellä lauseella */
  note: string;
}

export interface LiigaMatchReview {
  /**
   * Liiga.fi-pohjainen oletustunniste. liiga-reviews-build.ts korvaa tämän
   * kerroinhistorian match_id:llä (today.json:in korttitunniste) ennen
   * kirjoitusta, jotta selain voi liittää arvion kortille suoralla
   * merkkijonovertailulla.
   */
  matchId: string;
  date: string;
  home: string;
  away: string;
  /** Varsinaisen peliajan lukema */
  regulationScore: string;
  /** Loppulukema, eri kuin yllä jos meni jatkoajalle */
  finalScore: string;
  wentToOvertime: boolean;
  outcome: MarketSide;

  model: SideProbs | null;
  market: SideProbs | null;
  modelPick: MarketSide | null;
  marketPick: MarketSide | null;
  modelCorrect: boolean | null;
  marketCorrect: boolean | null;

  goals: Goal[];
  /** Minuutteja joina mallin valinta oli voimassa oleva tulos */
  minutesLeading: number;
  verdict: Verdict;

  claims: ClaimResult[];
}

/** Liiga.fi antaa maaliajan SEKUNTEINA — sama sudenkuoppa kuin ESPN:llä */
export function goalMinute(gameTimeSeconds: unknown): number | null {
  const s = Number(gameTimeSeconds);
  if (!Number.isFinite(s) || s < 0) return null;
  return Math.max(1, Math.round(s / 60));
}

/**
 * Maalit varsinaiselta peliajalta.
 *
 * Jatkoajan maalit (yli 60 min) jätetään pois: 1X2 ratkeaa 60 minuutissa,
 * eikä jatkoajan maali kuulu siihen aikajanaan.
 */
export function extractGoals(game: LiigaApiGame): Goal[] {
  const kerää = (events: unknown, side: 'home' | 'away'): Goal[] =>
    (Array.isArray(events) ? events : [])
      .map((e) => goalMinute((e as { gameTime?: unknown })?.gameTime))
      .filter((m): m is number => m !== null && m <= HOCKEY_FULL_TIME)
      .map((minute) => ({ minute, side }));

  return [
    ...kerää((game.homeTeam as { goalEvents?: unknown })?.goalEvents, 'home'),
    ...kerää((game.awayTeam as { goalEvents?: unknown })?.goalEvents, 'away'),
  ].sort((a, b) => a.minute - b.minute);
}

const argmax = (p: SideProbs): MarketSide =>
  (['home', 'draw', 'away'] as MarketSide[]).reduce((b, s) => (p[s] > p[b] ? s : b), 'home');

/** Kausiennakon sija; 99 jos joukkue ei ole ennakossa */
function priorRank(team: string): number {
  const key = normalizeLiigaName(team);
  const p = TEAM_PRIORS.find((t) => normalizeLiigaName(t.team) === key);
  return p ? effectiveRank(p) : 99;
}

/**
 * Väitteet yhdelle ottelulle.
 *
 * Jokainen väite on MITATTAVA: se sanoo mitä malli odotti ja mitä tapahtui.
 * Väite jota tämä ottelu ei testaa saa `hit: null` — arvattu osuma olisi
 * pahempi kuin puuttuva, koska se vääristäisi yhteenvedon.
 */
export function buildClaims(
  model: SideProbs | null,
  market: SideProbs | null,
  outcome: MarketSide,
  home: string,
  away: string
): ClaimResult[] {
  const claims: ClaimResult[] = [];

  // 1. Tasapelikorjaus (#93)
  if (model && market) {
    const ero = model.draw - market.draw;
    const korotti = ero > 0.005;
    claims.push({
      claim: 'Tasapelikorjaus',
      model: `${(model.draw * 100).toFixed(1)} %`,
      actual: outcome === 'draw' ? 'tasapeli' : 'ratkesi',
      hit: korotti ? outcome === 'draw' : null,
      note: korotti
        ? `Malli nosti tasapelia ${(ero * 100).toFixed(1)} pp markkinan yli`
        : 'Malli ei poikennut markkinasta tasapelissa — ei testattavissa',
    });
  }

  // 2. Kausiennakon sija
  const kr = priorRank(home);
  const vr = priorRank(away);
  if (kr < 99 && vr < 99) {
    const ennakonVoittaja: MarketSide = kr < vr ? 'home' : 'away';
    claims.push({
      claim: 'Kausiennakon sija',
      model: `${kr < vr ? home : away} parempi (${Math.min(kr, vr)}. vs ${Math.max(kr, vr)}.)`,
      actual: outcome === 'draw' ? 'tasapeli' : outcome === 'home' ? home : away,
      hit: outcome === 'draw' ? null : ennakonVoittaja === outcome,
      note: outcome === 'draw' ? 'Tasapeli ei testaa sijajarjestysta' : 'Ennakon parempi joukkue',
    });
  }

  // 3. Kotietu
  if (model) {
    claims.push({
      claim: 'Kotietu',
      model: `koti ${(model.home * 100).toFixed(1)} %`,
      actual: outcome === 'home' ? 'kotivoitto' : outcome === 'draw' ? 'tasapeli' : 'vierasvoitto',
      hit: model.home > 0.5 ? outcome === 'home' : null,
      note:
        model.home > 0.5
          ? 'Malli piti kotivoittoa todennakoisimpana yli 50 %:lla'
          : 'Malli ei pitanyt kotivoittoa selvana suosikkina — ei testattavissa',
    });
  }

  return claims;
}

/** Yhden ottelun arvio */
export function reviewGame(
  game: LiigaApiGame,
  model: SideProbs | null,
  market: SideProbs | null
): LiigaMatchReview | null {
  const home = game.homeTeam?.teamName?.trim();
  const away = game.awayTeam?.teamName?.trim();
  const hg = game.homeTeam?.goals;
  const ag = game.awayTeam?.goals;
  if (!home || !away || game.ended !== true || !Number.isFinite(hg) || !Number.isFinite(ag)) return null;

  const reg = regulationScore(hg as number, ag as number, game.finishedType);
  const outcome: MarketSide = reg.wentToOvertime ? 'draw' : reg.home > reg.away ? 'home' : 'away';

  const goals = extractGoals(game);
  const modelPick = model ? argmax(model) : null;
  const marketPick = market ? argmax(market) : null;

  const minutes = leadingMinutes(goals, HOCKEY_FULL_TIME);
  const leading = modelPick ? minutes[modelPick] : 0;
  const last = modelPick ? lastLeadMinute(goals, modelPick, HOCKEY_FULL_TIME) : null;

  const verdict: Verdict = !modelPick
    ? 'ei_tietoa'
    : modelPick === outcome
      ? 'osui'
      : leading === 0
        ? 'ei_koskaan_voitolla'
        : last !== null && last >= HOCKEY_FULL_TIME * 0.75
          ? 'kaatui_lopussa'
          : 'oli_voitolla';

  return {
    matchId: `icehockey_liiga:${String(game.start ?? '').slice(0, 10)}:${home}-${away}`,
    date: String(game.start ?? '').slice(0, 10),
    home,
    away,
    regulationScore: `${reg.home}–${reg.away}`,
    finalScore: `${hg}–${ag}`,
    wentToOvertime: reg.wentToOvertime,
    outcome,
    model,
    market,
    modelPick,
    marketPick,
    modelCorrect: modelPick ? modelPick === outcome : null,
    marketCorrect: marketPick ? marketPick === outcome : null,
    goals,
    minutesLeading: leading,
    verdict,
    claims: buildClaims(model, market, outcome, home, away),
  };
}

export interface LiigaRoundReview {
  date: string;
  matches: LiigaMatchReview[];
  summary: {
    matches: number;
    modelCorrect: number;
    marketCorrect: number;
    /** Väitteittäin: montako osui / montako oli testattavissa */
    claims: Record<string, { hit: number; tested: number }>;
    /** Mallin valinta ei ollut voitolla kertaakaan — analyysivirhe, ei epäonni */
    neverLeading: number;
  };
}

/** Kokoa kierroksen arvio */
export function buildRoundReview(reviews: LiigaMatchReview[], date: string): LiigaRoundReview {
  const claims: Record<string, { hit: number; tested: number }> = {};
  for (const r of reviews) {
    for (const c of r.claims) {
      if (c.hit === null) continue;
      claims[c.claim] ??= { hit: 0, tested: 0 };
      claims[c.claim].tested++;
      if (c.hit) claims[c.claim].hit++;
    }
  }

  return {
    date,
    matches: reviews,
    summary: {
      matches: reviews.length,
      modelCorrect: reviews.filter((r) => r.modelCorrect).length,
      marketCorrect: reviews.filter((r) => r.marketCorrect).length,
      claims,
      neverLeading: reviews.filter((r) => r.verdict === 'ei_koskaan_voitolla').length,
    },
  };
}
