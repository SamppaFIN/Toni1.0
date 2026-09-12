// Tiketti #105: kasin syotetty ottelukonteksti ("Ennakko"-pillerit)
//
// ONGELMA JOTA TAMA RATKAISEE: malli lukee maaleja ja markkinaa, ja
// RSS-uutispolku (#29) lukee otsikoita avainsanoilla. Kumpikaan ei nae sita
// mita kierroksen ennakoista, foorumeilta ja lehdistotilaisuuksista oikeasti
// selviaa: kuka on loukkaantunut ja kuinka pitkaksi, kuka juuri palasi, onko
// uusi hankinta jo mukana, onko putki nelja voittoa vai nelja tappiota.
//
// Avainsanaluokittelu EI saa saataa mallia (ks. nlp-football.ts), ja se on
// oikein: se ei ymmarra mitaan, se tunnistaa sanoja. Mutta silloin jaa
// aukko — kierroksen paras tieto on ihmisen luettavissa mutta ei mallin.
//
// TAMA TAYTTAA SEN AUKON KASIN. Sama ratkaisu kuin Veikkauksen kertoimilla
// (#103): tylsa, versioitu JSON-tiedosto jonka ihminen tayttaa ja joka
// sanoo itsestaan etta se on kasin syotetty.
//
// NELJA SAANTOA jotka pitavat taman rehellisena:
//
//   1. JOKAINEN TEKIJA SANOO LAHTEENSA. Rivi ilman lahdetta on mielipide
//      joka naytettaisiin havaintona. `sources` on pakollinen.
//   2. VAIKUTUS ON RAJATTU. Yksi tekija saa siirtaa maaliodotusta enintaan
//      MAX_FACTOR_DELTA:n verran ja kaikki tekijat yhteensa enintaan
//      MAX_SIDE_DELTA:n. Kasin syotetty luku ei saa jyrata mallia.
//   3. TEKIJALLA ON PYSYVA `id`. Kerroinlaskuri kytkee tekijoita pois
//      paalta id:n perusteella, ja juoksevasta numerosta johdettu tunniste
//      siirtaisi kayttajan valinnan vaaraan tekijaan seuraavassa ajossa.
//   4. TASMAAMATON RIVI SANOTAAN AANEEN. Hiljainen ohitus nayttaa tasan
//      samalta kuin "tekijoita ei ollut" — ks. unmatchedContext().

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventKey } from './odds-manual.js';
import { ContextFactor, ContextSource, MatchContext } from '../types-football.js';

export const CONTEXT_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/ottelukonteksti-manual.json'
);

/**
 * Yhden tekijan enimmaisvaikutus maaliodotukseen.
 *
 * 0.20 = 20 %. Se on suurempi kuin uutispolun suurin automaattinen korjaus
 * (injury −0.09), ja tarkoituksella: kasin syotetty tekija on luettu ja
 * varmistettu, automaattinen on paateltu. Mutta se ei saa olla niin suuri
 * etta yksi rivi maaraa lopputuloksen — 20 % siirtaa lambdaa, ei korvaa sita.
 */
export const MAX_FACTOR_DELTA = 0.2;

/**
 * Kaikkien tekijoiden yhteisvaikutus yhteen puoleen.
 *
 * Ilman kattoa kuusi pienta miinusta summautuisi −60 %:ksi, mika olisi
 * eri vaite kuin yksikaan niista erikseen. Katto on 0.35 eika 0.40, jotta
 * se puree ennen kuin yhteisvaikutus alkaa nayttaa mallin omalta luvulta.
 */
export const MAX_SIDE_DELTA = 0.35;

/** Tekijatyypit. `other` on sallittu mutta naytetaan neutraalina. */
export const FACTOR_TYPES = [
  'win_streak',
  'loss_streak',
  'goal_drought',
  'defence',
  'signing',
  'injury',
  'return',
  'suspension',
  'manager',
  'congestion',
  'motivation',
  'home_form',
  'away_form',
  'h2h',
  'other',
] as const;

export type FactorType = (typeof FACTOR_TYPES)[number];

/**
 * Tekijatyypit jotka POIKKEUKSETTA kertovat jotain mita malli lukee jo itse.
 *
 * VIKA JOTA TAMA ESTAA on kaksoislaskenta, ja se on salakavala koska tulos
 * nayttaa perustellulta. Ensimmaisessa ajossa Chelsea–Hull sai naista kaksi:
 * "Hull ei ole paastanyt maalia" (−10 % Chelsean lambdaan) ja "Chelsea
 * paastaa" (+8 % Hullin lambdaan). Molemmat ovat tosia — ja molemmat ovat
 * SAMA TIETO jonka Poisson oli jo lukenut sarjataulukon maaliluvuista.
 *
 * Lopputulos: Hullin vierasvoitto 14.00:lla nayttoi 60 %:n ylikertoimelta,
 * kun se ilman kaksoislaskentaa oli 37 % — ja sekin oli pelkastaan kolmen
 * ottelun otoksen tuottamaa kohinaa. Juuri tallaista pitkan hannan
 * vaaraa positiivista vastaan MIN_PROB_EDGE (snapshot.ts) on rakennettu,
 * ja kasin syotetty tekija paasi sen ohi.
 *
 * SAANTO: lambda-vaikutus annetaan vain sille mita malli EI nae —
 * loukkaantumiset, paluut, hankinnat, valmentajavaihdos, otteluruuhka,
 * cup-ottelut. Putket, maalimaarat ja sarjasijat naytetaan pillereina
 * ilman saatoa; ne ovat luettavaa kontekstia, eivat uutta syotetta.
 *
 * Varoitus eika hylkays: harvinainen perusteltu poikkeus on mahdollinen
 * (esim. kahden kauden yli ulottuva kotiputki, jota tama kausi ei kata).
 * Silloin luku nakyy lokissa ja sen voi perustella.
 */
export const TABLE_DERIVED_TYPES = new Set<string>([
  'win_streak',
  'loss_streak',
  'goal_drought',
  'defence',
  'home_form',
  'away_form',
]);

/** Yksi ottelu kasisyottotiedostossa */
export interface ContextEvent {
  sportKey: string;
  /** Ottelupaiva UTC:ssa, YYYY-MM-DD */
  date: string;
  home: string;
  away: string;
  factors: ContextFactor[];
}

export interface ContextFile {
  source: ContextSource;
  events: ContextEvent[];
}

/** Kelvollinen lambda-siirtyma: aarellinen luku rajojen sisalla */
function clampDelta(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return Math.max(-MAX_FACTOR_DELTA, Math.min(MAX_FACTOR_DELTA, v));
}

function clampConfidence(n: unknown): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : 0.5;
  return Math.max(0, Math.min(1, v));
}

/**
 * Jasenna yksi tekija. Palauttaa null kun rivi ei kelpaa.
 *
 * Puuttuva `id`, `label` tai `sources` PUDOTTAA rivin eika korjaa sita:
 * tekija ilman lahdetta esitettaisiin kortilla havaintona, ja tekija ilman
 * pysyvaa id:ta karkaisi kerroinlaskurin pois-kytkennasta.
 */
export function parseFactor(raw: unknown, label = CONTEXT_FILE): ContextFactor | null {
  const f = raw as Partial<ContextFactor> | null;
  if (!f || typeof f !== 'object') return null;

  if (!f.id || typeof f.id !== 'string') {
    console.warn(`[Konteksti] ${label}: tekija ilman id:ta ohitettu (${f?.label ?? '?'})`);
    return null;
  }
  if (!f.label || typeof f.label !== 'string') {
    console.warn(`[Konteksti] ${label}: tekija ${f.id} ilman otsikkoa — ohitettu`);
    return null;
  }
  const sources = Array.isArray(f.sources)
    ? f.sources.filter((s) => s && typeof s.name === 'string' && typeof s.url === 'string')
    : [];
  if (!sources.length) {
    console.warn(`[Konteksti] ${label}: tekija ${f.id} ilman lahdetta — ohitettu`);
    return null;
  }

  const type = (FACTOR_TYPES as readonly string[]).includes(String(f.type)) ? (f.type as FactorType) : 'other';
  const team = f.team === 'home' || f.team === 'away' ? f.team : null;

  const deltaHome = clampDelta(f.delta_home);
  const deltaAway = clampDelta(f.delta_away);
  if (deltaHome !== (f.delta_home ?? 0) || deltaAway !== (f.delta_away ?? 0)) {
    console.warn(
      `[Konteksti] ${label}: tekijan ${f.id} vaikutus rajattiin ±${MAX_FACTOR_DELTA} ` +
        `(${f.delta_home ?? 0}/${f.delta_away ?? 0} → ${deltaHome}/${deltaAway})`
    );
  }

  if (TABLE_DERIVED_TYPES.has(type) && (deltaHome !== 0 || deltaAway !== 0)) {
    console.warn(
      `[Konteksti] ${label}: tekija ${f.id} (${type}) saataa lambdaa ${deltaHome}/${deltaAway}, ` +
        'vaikka malli lukee saman jo sarjataulukosta — tarkista ettei tama ole kaksoislaskentaa'
    );
  }

  return {
    id: f.id,
    team,
    type,
    label: f.label,
    detail: typeof f.detail === 'string' ? f.detail : '',
    delta_home: deltaHome,
    delta_away: deltaAway,
    confidence: clampConfidence(f.confidence),
    sources,
  };
}

/**
 * Jasenna ja validoi koko tiedosto.
 *
 * Kelvoton YKSITTAINEN rivi pudotetaan varoituksella; kelvoton RAKENNE
 * palauttaa nullin. Sama jako kuin kasisyotetyissa kertoimissa: yksi
 * kirjoitusvirhe ei saa vieda yhdeksaa oikeaa ottelua mukanaan, mutta
 * muuttunut rakenne ei saa jatkua hiljaa.
 */
export function parseContextFile(json: unknown, label = CONTEXT_FILE): ContextFile | null {
  const raw = json as Partial<ContextFile> | null;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.events)) {
    console.warn(`[Konteksti] ${label}: odottamaton rakenne — kontekstia ei lisata`);
    return null;
  }

  const src = (raw.source ?? {}) as Partial<ContextSource>;
  const source: ContextSource = {
    name: src.name ?? 'Kasin syotetty ottelukonteksti',
    entered_at: src.entered_at ?? new Date(0).toISOString(),
    note: src.note ?? null,
  };

  const events: ContextEvent[] = [];
  for (const e of raw.events as Array<Partial<ContextEvent>>) {
    if (!e?.sportKey || !e?.date || !e?.home || !e?.away || !Array.isArray(e.factors)) {
      console.warn(`[Konteksti] ${label}: puutteellinen ottelurivi ohitettu (${e?.home ?? '?'} vs ${e?.away ?? '?'})`);
      continue;
    }
    const factors = e.factors.map((f) => parseFactor(f, label)).filter((f): f is ContextFactor => f !== null);
    if (!factors.length) continue;

    // Sama id kahdesti samassa ottelussa rikkoisi pois-kytkennan: kayttaja
    // sammuttaisi yhden ja toinen jaisi paalle nakymattomasti.
    const seen = new Set<string>();
    const unique = factors.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
    if (unique.length !== factors.length) {
      console.warn(`[Konteksti] ${label}: ${e.home} vs ${e.away} — kaksoiskappale-id:t pudotettu`);
    }

    events.push({ sportKey: e.sportKey, date: e.date, home: e.home, away: e.away, factors: unique });
  }

  return { source, events };
}

let cache: ContextFile | null | undefined;

/** Lue kasisyottotiedosto levylta. null jos sita ei ole tai se ei kelpaa. */
export function loadContextFile(file: string = CONTEXT_FILE): ContextFile | null {
  if (file === CONTEXT_FILE && cache !== undefined) return cache;

  let parsed: ContextFile | null = null;
  try {
    parsed = parseContextFile(JSON.parse(readFileSync(file, 'utf8')), file);
  } catch (err) {
    // Puuttuva tiedosto on normaali tila: konteksti on lisa, ei ehto.
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') console.warn(`[Konteksti] ${file} ei luettavissa: ${(err as Error).message}`);
    parsed = null;
  }

  if (file === CONTEXT_FILE) cache = parsed;
  return parsed;
}

/** Vain testeja varten */
export function resetContextCache(): void {
  cache = undefined;
}

/**
 * Yhden puolen tekijoiden yhteisvaikutus, katto mukaan luettuna.
 *
 * TAMAN FUNKTION VASTINE ON SELAIMESSA (public/app/football-calc.js:
 * `totalContextDelta`). Jos muutat toista, muuta toinen — parieetti on
 * testattu src/__tests__/context-manual.test.ts:ssa.
 */
export function totalContextDelta(factors: ContextFactor[], side: 'home' | 'away'): number {
  const sum = factors.reduce((s, f) => s + (side === 'home' ? f.delta_home : f.delta_away), 0);
  return Math.max(-MAX_SIDE_DELTA, Math.min(MAX_SIDE_DELTA, sum));
}

export interface ContextTarget {
  sportKey: string;
  kickoff: string;
  home: { name: string };
  away: { name: string };
}

/** Ottelun konteksti, tai null jos tiedostossa ei ole rivia talle ottelulle */
export function contextFor(target: ContextTarget, file: ContextFile | null): MatchContext | null {
  if (!file?.events.length) return null;
  const key = eventKey(target.sportKey, target.kickoff, target.home.name, target.away.name);
  const hit = file.events.find((e) => eventKey(e.sportKey, e.date, e.home, e.away) === key);
  if (!hit) return null;
  return { source: file.source, factors: hit.factors, lambda_base: null };
}

/**
 * Tasmaamatta jaaneet ottelurivit.
 *
 * Mennyt kierros ei tasmaa eika kuulukaan. Tulevan kierroksen rivi joka ei
 * tasmaa on kirjoitusvirhe joukkuenimessa — ja juuri se jaisi huomaamatta,
 * koska tyhja konteksti nayttaa samalta kuin "ei tekijoita".
 */
export function unmatchedContext(targets: ContextTarget[], file: ContextFile | null): ContextEvent[] {
  if (!file?.events.length) return [];
  const present = new Set(targets.map((t) => eventKey(t.sportKey, t.kickoff, t.home.name, t.away.name)));
  return file.events.filter((e) => !present.has(eventKey(e.sportKey, e.date, e.home, e.away)));
}
