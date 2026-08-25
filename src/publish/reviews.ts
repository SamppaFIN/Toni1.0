// Tiketti #76: Kierrosarviointi — mikä meni oikein, mikä pieleen, ja oliko
// kohde edes elossa
//
// Osumatarkkuus kertoo kuinka usein malli oli oikeassa. Se ei kerro MIKSI se
// oli väärässä, eikä erota kahta täysin eri tilannetta:
//
//   A) Malli liputti kotivoiton, koti johti 78 minuuttia ja päästi 2 maalia
//      lopussa. Analyysi oli järkevä, lopputulos oli epäonnea.
//
//   B) Malli liputti vierasvoiton kertoimella 21.00, vieras ei johtanut
//      yhtenäkään minuuttina ja hävisi 0-3. Analyysi oli väärässä ottelusta,
//      ei epäonninen.
//
// Nämä näyttävät mittarissa identtisiltä (molemmat "pieleen") mutta vaativat
// päinvastaiset toimenpiteet: A:lle ei tehdä mitään, B on merkki rikkinäisestä
// mallista. Tämä moduuli erottaa ne maaliaikajanan avulla.
//
// TÄRKEÄ RAJAUS: jalkapallossa mikään tulos ei ole matemaattisesti mahdoton
// ennen loppuvihellystä — 0-3 on käännetty. Siksi tämä EI väitä mittaavansa
// "mahdollisuutta" vaan sitä kuinka kauan kohde oli VOITOLLA. Se on
// havaittava suure; "mahdollisuus" olisi tulkinta jota data ei tue.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { MarketSide, SideProbs } from '../types-football.js';
import { OddsHistoryFile, OddsTimeline } from './odds-history.js';
import { FixturesFile } from './fixtures.js';

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

/** Varsinainen peliaika. Lisäaika lasketaan mukaan jos maaleja tulee sen jälkeen. */
export const FULL_TIME = 90;
/** Minuutti josta alkaen johtoasemassa oleminen lasketaan "loppuvaiheeksi" */
export const LATE_GAME = 70;

export interface Goal {
  minute: number;
  side: 'home' | 'away';
}

export type Verdict =
  /** Kohde voitti */
  | 'osui'
  /** Kohde johti loppuvaiheessa mutta kaatui */
  | 'kaatui_lopussa'
  /** Kohde oli jossain vaiheessa voitolla mutta hävisi */
  | 'oli_voitolla'
  /** Kohde ei ollut voitolla yhtenäkään minuuttina */
  | 'ei_koskaan_voitolla'
  /** Maaliaikajanaa ei saatu — ei voida sanoa oliko kohde voitolla */
  | 'ei_tietoa';

export interface PickReview {
  side: MarketSide;
  odds: number;
  book: string | null;
  edge: number;
  flag: string;
  stake: number;
  won: boolean;
  /** Minuutteja joina kohde oli voimassa oleva lopputulos */
  minutes_leading: number;
  /** Osuus ottelusta, 0–1 */
  share_leading: number;
  /** Viimeinen minuutti jolloin kohde oli voitolla, null jos ei koskaan */
  last_lead_minute: number | null;
  verdict: Verdict;
  /** Paperitulos: 1 yksikkö panostettuna */
  profit_units: number;
}

export interface MatchReview {
  match_id: string;
  league: string;
  sport_key: string;
  kickoff: string;
  home: string;
  away: string;
  score: string;
  outcome: MarketSide;
  /** Mallin arvio avaushavainnosta */
  model: SideProbs;
  /** Markkinan arvio avaushavainnosta */
  implied: SideProbs;
  /** Osuiko mallin todennäköisin kohde */
  model_correct: boolean;
  /** Osuiko markkinan todennäköisin kohde */
  market_correct: boolean;
  goals: Goal[];
  /** Onko maaliaikajana käytettävissä — ilman sitä verdiktit ovat epäluotettavia */
  has_timeline: boolean;
  picks: PickReview[];
}

export interface RoundReview {
  /** Kierroksen tunniste = päivä */
  date: string;
  matches: MatchReview[];
  summary: {
    matches: number;
    model_correct: number;
    market_correct: number;
    picks: number;
    picks_won: number;
    profit_units: number;
    /** Liputetut kohteet jotka eivät olleet voitolla kertaakaan */
    never_leading: number;
  };
}

export interface ReviewsFile {
  schema_version: 1;
  generated_at: string;
  rounds: RoundReview[];
}

// ─── Maaliaikajana ────────────────────────────────────────────────────────

/**
 * Kuinka monta minuuttia kukin lopputulos oli voimassa.
 *
 * Ottelu alkaa 0-0, eli tasapeli on voimassa ensimmäisestä minuutista siihen
 * asti kun ensimmäinen maali tulee. Loppuhetki on 90 tai viimeinen maali,
 * kumpi on myöhemmin — lisäajalla tehty maali ei saa jäädä nollan mittaiseksi.
 */
export function leadingMinutes(goals: Goal[]): Record<MarketSide, number> {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  const end = Math.max(FULL_TIME, ...sorted.map((g) => g.minute));
  const out: Record<MarketSide, number> = { home: 0, draw: 0, away: 0 };

  let h = 0;
  let a = 0;
  let at = 0;

  const standing = (): MarketSide => (h > a ? 'home' : a > h ? 'away' : 'draw');

  for (const g of sorted) {
    const minute = Math.min(Math.max(g.minute, 0), end);
    out[standing()] += Math.max(0, minute - at);
    at = minute;
    if (g.side === 'home') h++;
    else a++;
  }

  out[standing()] += Math.max(0, end - at);
  return out;
}

/** Viimeinen minuutti jolloin annettu kohde oli voimassa oleva lopputulos */
export function lastLeadMinute(goals: Goal[], side: MarketSide): number | null {
  const sorted = [...goals].sort((a, b) => a.minute - b.minute);
  const end = Math.max(FULL_TIME, ...sorted.map((g) => g.minute));

  let h = 0;
  let a = 0;
  let last: number | null = null;
  let at = 0;

  const standing = (): MarketSide => (h > a ? 'home' : a > h ? 'away' : 'draw');

  for (const g of sorted) {
    if (standing() === side && g.minute > at) last = g.minute;
    at = g.minute;
    if (g.side === 'home') h++;
    else a++;
  }

  if (standing() === side) last = end;
  return last;
}

/**
 * Arvio yhdelle kohteelle.
 *
 * Ilman maaliaikajanaa (`hasTimeline` = false) verdikti on pelkkä osui/ei —
 * minuuttiluvut jätetään nolliksi eikä niistä pääteltäisi mitään. Nolla joka
 * tarkoittaa "ei dataa" olisi luettu "ei ollut voitolla kertaakaan", mikä on
 * eri väite.
 */
export function reviewPick(
  side: MarketSide,
  outcome: MarketSide,
  odds: number,
  goals: Goal[],
  hasTimeline: boolean
): Pick<PickReview, 'won' | 'minutes_leading' | 'share_leading' | 'last_lead_minute' | 'verdict' | 'profit_units'> {
  const won = side === outcome;
  const profit_units = won ? odds - 1 : -1;

  if (!hasTimeline) {
    return {
      won,
      minutes_leading: 0,
      share_leading: 0,
      last_lead_minute: null,
      // EI 'oli_voitolla': se olisi väite jota data ei tue. Puuttuva
      // aikajana sanotaan puuttuvaksi.
      verdict: won ? 'osui' : 'ei_tietoa',
      profit_units,
    };
  }

  const minutes = leadingMinutes(goals);
  const total = Object.values(minutes).reduce((s, n) => s + n, 0) || FULL_TIME;
  const leading = minutes[side];
  const last = lastLeadMinute(goals, side);

  const verdict: Verdict = won
    ? 'osui'
    : leading === 0
      ? 'ei_koskaan_voitolla'
      : last !== null && last >= LATE_GAME
        ? 'kaatui_lopussa'
        : 'oli_voitolla';

  return {
    won,
    minutes_leading: leading,
    share_leading: leading / total,
    last_lead_minute: last,
    verdict,
    profit_units,
  };
}

// ─── ESPN: maalit aikoineen ───────────────────────────────────────────────

interface KeyEvent {
  clock?: { displayValue?: string; value?: number };
  team?: { id?: string; displayName?: string };
  scoringPlay?: boolean;
  shootout?: boolean;
  text?: string;
  type?: { text?: string };
}

/**
 * Minuutti ESPN:n kellosta.
 *
 * `clock.value` on SEKUNTEJA (874 = 15. minuutti) eikä minuutteja — sen
 * käyttäminen sellaisenaan merkitsisi maalin 874. minuutille ja rikkoisi
 * koko aikajanan hiljaa. `displayValue` on jo minuutteina ("15'", "90'+3'"),
 * joten se on ensisijainen.
 */
export function parseMinute(display: string | undefined, value: number | undefined): number | null {
  const m = String(display ?? '').match(/(\d+)/);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.max(1, Math.round(value / 60));
  }
  return null;
}

/**
 * Maalin jälkeinen pistetilanne tapahtuman tekstistä.
 *
 * ESPN kirjoittaa "Goal! Arsenal 1, Coventry City 0. ..." — luku on
 * yksiselitteinen ja immuuni omien maalien tulkinnalle, toisin kuin
 * `team.id`, joka omassa maalissa osoittaa tekijän joukkueeseen eikä siihen
 * jonka hyväksi maali meni. Siksi teksti on ensisijainen lähde ja team.id
 * varalla.
 */
export function scoreFromText(text: string | undefined, home: string, away: string): { h: number; a: number } | null {
  const t = String(text ?? '');
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${esc(home)}\\s+(\\d+),\\s*${esc(away)}\\s+(\\d+)`);
  const m = t.match(re);
  if (!m) return null;
  return { h: Number(m[1]), a: Number(m[2]) };
}

/**
 * Poimi maalit ESPN:n summary-vastauksesta.
 *
 * Rangaistuspotkukilpailun maalit (`shootout`) EI lasketa: 1X2 ratkeaa
 * varsinaisen peliajan mukaan, mikä on sama sääntö kuin muualla projektissa.
 */
export function parseGoals(
  data: unknown,
  homeTeamId: string | null,
  homeName = '',
  awayName = ''
): Goal[] {
  const events = (data as { keyEvents?: KeyEvent[] })?.keyEvents;
  if (!Array.isArray(events)) return [];

  const out: Goal[] = [];
  let h = 0;
  let a = 0;

  for (const ev of events) {
    if (!ev.scoringPlay || ev.shootout) continue;
    const minute = parseMinute(ev.clock?.displayValue, ev.clock?.value);
    if (minute === null) continue;

    let side: 'home' | 'away' | null = null;

    const after = scoreFromText(ev.text, homeName, awayName);
    if (after) {
      if (after.h > h) side = 'home';
      else if (after.a > a) side = 'away';
      h = after.h;
      a = after.a;
    } else if (homeTeamId && ev.team?.id) {
      side = String(ev.team.id) === homeTeamId ? 'home' : 'away';
      if (side === 'home') h++;
      else a++;
    }

    if (side) out.push({ minute, side });
  }

  return out.sort((x, y) => x.minute - y.minute);
}

async function fetchGoals(espnCode: string, espnId: string): Promise<Goal[] | null> {
  try {
    const res = await fetch(`${BASE}/${espnCode}/summary?event=${espnId}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      header?: {
        competitions?: Array<{
          competitors?: Array<{ homeAway?: string; team?: { id?: string; displayName?: string } }>;
        }>;
      };
    };
    const comps = data.header?.competitions?.[0]?.competitors ?? [];
    const home = comps.find((c) => c.homeAway === 'home');
    const away = comps.find((c) => c.homeAway === 'away');
    return parseGoals(
      data,
      home?.team?.id ? String(home.team.id) : null,
      home?.team?.displayName ?? '',
      away?.team?.displayName ?? ''
    );
  } catch {
    return null;
  }
}

// ─── Kokoaminen ───────────────────────────────────────────────────────────

function argmax(probs: SideProbs): MarketSide {
  return (['home', 'draw', 'away'] as MarketSide[]).reduce((best, s) =>
    (probs[s] ?? 0) > (probs[best] ?? 0) ? s : best
  );
}

/** Rakenna yhden ottelun arvio aikasarjasta ja maaleista */
export function buildMatchReview(t: OddsTimeline, goals: Goal[] | null): MatchReview | null {
  if (!t.result || !t.points.length) return null;

  // Ennuste luetaan AVAUSHAVAINNOSTA: sulkeutumislinjaa vasten arviointi
  // hyödyttäisi mallia tiedolla joka syntyi vasta ennusteen jälkeen.
  const opening = t.points[0];
  const hasTimeline = Array.isArray(goals) && goals.length > 0;
  const list = goals ?? [];

  const picks: PickReview[] = [];
  for (const side of ['home', 'draw', 'away'] as MarketSide[]) {
    const flag = opening.flag[side];
    const odds = opening.odds[side];
    if (!flag || flag === 'none' || !odds) continue;

    picks.push({
      side,
      odds,
      book: opening.book[side] ?? null,
      edge: opening.edge[side] ?? 0,
      flag,
      stake: opening.stake[side] ?? 0,
      ...reviewPick(side, t.result.outcome, odds, list, hasTimeline),
    });
  }

  return {
    match_id: t.match_id,
    league: t.league,
    sport_key: t.sport_key,
    kickoff: t.kickoff,
    home: t.home,
    away: t.away,
    score: `${t.result.home_score}–${t.result.away_score}`,
    outcome: t.result.outcome,
    model: opening.model,
    implied: opening.implied,
    model_correct: argmax(opening.model) === t.result.outcome,
    market_correct: argmax(opening.implied) === t.result.outcome,
    goals: list,
    has_timeline: hasTimeline,
    picks,
  };
}

/** Ryhmittele ottelut kierroksiksi = ottelupäiviksi, uusin ensin */
export function groupRounds(matches: MatchReview[]): RoundReview[] {
  const byDay = new Map<string, MatchReview[]>();
  for (const m of matches) {
    const day = m.kickoff.slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(m);
    else byDay.set(day, [m]);
  }

  return [...byDay.entries()]
    .map(([date, list]) => {
      const picks = list.flatMap((m) => m.picks);
      return {
        date,
        matches: list.sort((a, b) => a.kickoff.localeCompare(b.kickoff)),
        summary: {
          matches: list.length,
          model_correct: list.filter((m) => m.model_correct).length,
          market_correct: list.filter((m) => m.market_correct).length,
          picks: picks.length,
          picks_won: picks.filter((p) => p.won).length,
          profit_units: Number(picks.reduce((s, p) => s + p.profit_units, 0).toFixed(2)),
          never_leading: picks.filter((p) => p.verdict === 'ei_koskaan_voitolla').length,
        },
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function readJson<T>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function buildReviews(publicDir: string, now = new Date()): Promise<ReviewsFile> {
  const dataDir = path.join(publicDir, 'data');
  const history = readJson<OddsHistoryFile>(path.join(dataDir, 'odds-history.json'));
  const fixtures = readJson<FixturesFile>(path.join(dataDir, 'fixtures.json'));

  if (!history?.matches?.length) {
    console.warn('[Reviews] odds-history.json puuttuu tai on tyhjä — aja ensin npm run odds:history');
    return { schema_version: 1, generated_at: now.toISOString(), rounds: [] };
  }

  // ESPN-ID saadaan kalenterista, joka liittää ne normalisoiduilla nimillä.
  // Ilman kalenteria arviot rakennetaan silti — vain ilman maaliaikajanaa.
  const espnById = new Map<string, { espnId: string; code: string }>();
  const { leagueFor } = await import('../leagues.js');
  for (const f of fixtures?.matches ?? []) {
    if (!f.match_id) continue;
    const code = leagueFor(f.sport_key)?.espn;
    if (code) espnById.set(f.match_id, { espnId: f.espn_id, code });
  }

  const settled = history.matches.filter((m) => m.result);
  console.log(`[Reviews] ${settled.length} ratkennutta ottelua · ${espnById.size} ESPN-liitosta`);

  const reviews: MatchReview[] = [];
  let withTimeline = 0;

  for (const t of settled) {
    const ref = espnById.get(t.match_id);
    const goals = ref ? await fetchGoals(ref.code, ref.espnId) : null;
    if (goals?.length) withTimeline++;
    const review = buildMatchReview(t, goals);
    if (review) reviews.push(review);
  }

  console.log(`[Reviews] maaliaikajana ${withTimeline}/${reviews.length} ottelulle`);

  return { schema_version: 1, generated_at: now.toISOString(), rounds: groupRounds(reviews) };
}

export function writeReviews(publicDir: string, file: ReviewsFile): string {
  const dir = path.join(publicDir, 'data');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'reviews.json');
  writeFileSync(out, JSON.stringify(file) + '\n', 'utf8');
  return out;
}

const VERDICT_LABEL: Record<Verdict, string> = {
  osui: 'osui',
  kaatui_lopussa: 'johti loppuun asti, kaatui',
  oli_voitolla: 'oli voitolla',
  ei_koskaan_voitolla: 'EI KOSKAAN voitolla',
  ei_tietoa: 'ei aikajanaa',
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  buildReviews(publicDir)
    .then((file) => {
      const out = writeReviews(publicDir, file);
      for (const round of file.rounds) {
        const s = round.summary;
        console.log(
          `\n${round.date}  ${s.matches} ottelua · malli ${s.model_correct}/${s.matches} · markkina ${s.market_correct}/${s.matches}`
        );
        if (s.picks) {
          console.log(
            `  liputettuja ${s.picks} · osui ${s.picks_won} · tulos ${s.profit_units >= 0 ? '+' : ''}${s.profit_units} yks · ei kertaakaan voitolla: ${s.never_leading}`
          );
        }
        for (const m of round.matches) {
          for (const p of m.picks) {
            console.log(
              `    ${m.home}–${m.away} ${m.score}  ${p.side} @${p.odds}  ${VERDICT_LABEL[p.verdict]}` +
                (m.has_timeline ? ` (${p.minutes_leading} min voitolla)` : ' (ei aikajanaa)')
            );
          }
        }
      }
      console.log(`\n✓ ${out}`);
    })
    .catch((err) => {
      console.error('[Reviews]', err);
      process.exit(1);
    });
}
