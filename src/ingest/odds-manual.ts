// Tiketti #103: käsin syötetyt kertoimet (Veikkaus)
//
// ONGELMA JOTA TÄMÄ RATKAISEE: kerroinlista vertaili hintoja joita
// suomalainen käyttäjä ei voi pelata. The Odds API ei kata Veikkausta eikä
// Veikkaus tarjoa julkista kerroinrajapintaa, joten sen hinnat eivät tule
// putkeen mistään — ja juuri se on se toimisto jolla veto tosiasiassa
// lyödään.
//
// RATKAISU on tarkoituksella tylsä: kertoimet luetaan versioidusta
// JSON-tiedostosta (`data/veikkaus-odds-manual.json`), joka on käsin
// ylläpidetty. Scrapaus olisi hauras ja kyseenalainen; käsisyöttö on
// rehellinen ja näkyy sellaisena myös kortilla.
//
// KOLME SÄÄNTÖÄ jotka pitävät tämän turvallisena:
//
//   1. Rivi merkitään `manual: true`. Merkintä kulkee kortille asti, koska
//      käsin syötetty hinta voi olla vanhentunut tavalla jota haettu ei voi
//      olla — käyttäjän ei kuulu joutua arvaamaan kumpi on kyseessä.
//   2. Rivi lisätään VAIN jos ottelu täsmää (sarja + päivä + molemmat
//      joukkueet). Vanhentunut rivi ei osu mihinkään eikä tee vahinkoa.
//   3. Rajapinnasta tullut sama toimisto VOITTAA aina. Jos Veikkaus joskus
//      ilmestyy API:in, käsisyöttö väistyy itsestään eikä samaa toimistoa
//      lasketa kahdesti markkinamediaaniin.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BookmakerOdds } from '../types-football.js';
import { normalizeLiigaName } from '../analyze/liiga-priors.js';

export const MANUAL_ODDS_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/veikkaus-odds-manual.json'
);

export interface ManualOddsEvent {
  sportKey: string;
  /** Ottelupäivä UTC:ssä, muodossa YYYY-MM-DD */
  date: string;
  home: string;
  away: string;
  /** [1, X, 2] */
  odds: [number, number, number];
}

export interface ManualOddsFile {
  bookmaker: string;
  key: string;
  /** Toimiston kerroinsivu — sama linkki kaikille riveille */
  link: string | null;
  source: string;
  /** Milloin luvut on syötetty; näytetään kortilla `fetched_at`:na */
  entered_at: string;
  note: string | null;
  events: ManualOddsEvent[];
}

/**
 * Joukkuenimien normalisointi täsmäytystä varten.
 *
 * Jääkiekolle käytetään Liigan omaa aliaskarttaa (`normalizeLiigaName`),
 * koska juuri siellä nimet eroavat lähteittäin eniten — Veikkaus kirjoittaa
 * "K-Espoo", liiga.fi "Kiekko-Espoo". Muille lajeille riittää välimerkkien
 * ja diakriittien poisto: aggressiivisempi normalisointi voisi yhdistää
 * kaksi eri joukkuetta, mikä on pahempi virhe kuin täsmäämättä jäänyt rivi.
 */
export function matchKeyFor(sportKey: string, name: string): string {
  if (sportKey.startsWith('icehockey_')) return normalizeLiigaName(name);
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

/** Ottelun tunniste täsmäytystä varten: sarja + päivä + joukkueet */
export function eventKey(sportKey: string, isoKickoff: string, home: string, away: string): string {
  const day = isoKickoff.slice(0, 10);
  return `${sportKey}|${day}|${matchKeyFor(sportKey, home)}|${matchKeyFor(sportKey, away)}`;
}

/** Kelvollinen 1X2-kerroin. Alle 1.01 tai yli 100 on syöttövirhe, ei hinta. */
function isUsableOdds(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1.01 && n <= 100;
}

/**
 * Jäsennä ja validoi käsisyöttötiedosto.
 *
 * Kelvoton rivi PUDOTETAAN varoituksella eikä kaada koko tiedostoa: yksi
 * kirjoitusvirhe ei saa viedä kuutta oikeaa riviä mukanaan. Kelvoton
 * tiedosto sen sijaan palauttaa null — silloin rakenne on muuttunut, ja
 * hiljainen jatkaminen piilottaisi sen.
 */
export function parseManualOdds(json: unknown, label = MANUAL_ODDS_FILE): ManualOddsFile | null {
  const raw = json as Partial<ManualOddsFile> | null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) {
    console.warn(`[Kasisyotto] ${label}: odottamaton rakenne — kertoimia ei lisata`);
    return null;
  }
  if (!raw.bookmaker || !raw.key) {
    console.warn(`[Kasisyotto] ${label}: bookmaker tai key puuttuu — kertoimia ei lisata`);
    return null;
  }

  const events: ManualOddsEvent[] = [];
  for (const e of raw.events as Array<Partial<ManualOddsEvent>>) {
    const odds: unknown[] = Array.isArray(e?.odds) ? e.odds : [];
    if (!e?.sportKey || !e?.date || !e?.home || !e?.away || odds.length !== 3) {
      console.warn(`[Kasisyotto] ${label}: puutteellinen rivi ohitettu (${e?.home ?? '?'} vs ${e?.away ?? '?'})`);
      continue;
    }
    const [h, d, a] = odds;
    if (!isUsableOdds(h) || !isUsableOdds(d) || !isUsableOdds(a)) {
      console.warn(`[Kasisyotto] ${label}: kelvoton kerroin ohitettu (${e.home} vs ${e.away}: ${odds.join('/')})`);
      continue;
    }
    events.push({ sportKey: e.sportKey, date: e.date, home: e.home, away: e.away, odds: [h, d, a] });
  }

  return {
    bookmaker: raw.bookmaker,
    key: raw.key,
    link: raw.link ?? null,
    source: raw.source ?? raw.bookmaker,
    entered_at: raw.entered_at ?? new Date(0).toISOString(),
    note: raw.note ?? null,
    events,
  };
}

let cache: ManualOddsFile | null | undefined;

/** Lue käsisyöttötiedosto levyltä. null jos sitä ei ole tai se ei kelpaa. */
export function loadManualOdds(file: string = MANUAL_ODDS_FILE): ManualOddsFile | null {
  if (file === MANUAL_ODDS_FILE && cache !== undefined) return cache;

  let parsed: ManualOddsFile | null = null;
  try {
    parsed = parseManualOdds(JSON.parse(readFileSync(file, 'utf8')), file);
  } catch (err) {
    // Puuttuva tiedosto on normaali tila: käsisyöttö on lisä, ei ehto.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') console.warn(`[Kasisyotto] ${file} ei luettavissa: ${(err as Error).message}`);
    parsed = null;
  }

  if (file === MANUAL_ODDS_FILE) cache = parsed;
  return parsed;
}

/** Vain testejä varten */
export function resetManualOddsCache(): void {
  cache = undefined;
}

/** Yksi käsisyötetty rivi `BookmakerOdds`-muodossa */
export function manualRow(file: ManualOddsFile, e: ManualOddsEvent): BookmakerOdds {
  return {
    bookmaker: file.bookmaker,
    key: file.key,
    market: '1X2',
    home: e.odds[0],
    draw: e.odds[1],
    away: e.odds[2],
    // Kasisyotto ei ole porssi: ei komissiota.
    commission: 0,
    fetched_at: file.entered_at,
    link: file.link,
    manual: true,
    note: file.note,
  };
}

export interface ManualOddsTarget {
  sportKey: string;
  kickoff: string;
  home: { name: string };
  away: { name: string };
  odds: BookmakerOdds[];
}

/**
 * Lisää käsisyötetyt kertoimet niihin otteluihin joihin ne täsmäävät.
 *
 * Muokkaa tapahtumien `odds`-listoja PAIKALLAAN ja palauttaa lisättyjen
 * rivien määrän, jotta kutsuja voi kertoa lähteen käyttäjälle vain kun
 * riviä oikeasti käytettiin. "Veikkaus (käsin syötetty)" lähdelistassa
 * ilman yhtäkään riviä olisi väärä väite.
 */
export function applyManualOdds<T extends ManualOddsTarget>(events: T[], file: ManualOddsFile | null): number {
  if (!file?.events.length) return 0;

  const byKey = new Map(file.events.map((e) => [eventKey(e.sportKey, e.date, e.home, e.away), e]));
  let added = 0;

  for (const ev of events) {
    const manual = byKey.get(eventKey(ev.sportKey, ev.kickoff, ev.home.name, ev.away.name));
    if (!manual) continue;

    // Rajapinta voittaa: sama toimisto kahdesti vaaristaisi mediaanin
    if (ev.odds.some((o) => o.key === file.key)) continue;

    ev.odds.push(manualRow(file, manual));
    added++;
  }

  return added;
}

/**
 * Täsmäämättä jääneet rivit.
 *
 * Vanhentunut rivi on odotettu (eilinen kierros), mutta rivi joka EI täsmää
 * vaikka ottelu on listalla on kirjoitusvirhe joukkuenimessä — ja se jäisi
 * muuten huomaamatta, koska hiljainen ohitus näyttää samalta kuin
 * "kertoimia ei ollut". `npm run odds:manual` raportoi nämä.
 */
export function unmatchedEvents<T extends ManualOddsTarget>(
  events: T[],
  file: ManualOddsFile | null
): ManualOddsEvent[] {
  if (!file?.events.length) return [];
  const present = new Set(events.map((ev) => eventKey(ev.sportKey, ev.kickoff, ev.home.name, ev.away.name)));
  return file.events.filter((e) => !present.has(eventKey(e.sportKey, e.date, e.home, e.away)));
}
