// Tiketti #56: Live-tilastot ESPN:n julkisesta rajapinnasta
//
// MIKSI SELAIN HAKEE TÄMÄN ITSE:
// ESPN palvelee scoreboard- ja summary-päätteet ilman avainta ja lähettää
// `Access-Control-Allow-Origin: *`. Selain saa siis hakea ne suoraan myös
// GitHub Pagesista. Se on kolmella tavalla parempi kuin palvelinkierros:
// ei API-kvoottaa, ei cron-viivettä, ja tilanne päivittyy aidosti livenä.
// Tämä on poikkeus snapshot-arkkitehtuurista, ja syy on juuri tuo: kertoimet
// vaativat salaisen avaimen, tulokset eivät.
//
// REHELLINEN VARAUS: rajapinta on DOKUMENTOIMATON. Se voi muuttua tai kadota
// ilman varoitusta, eikä siihen ole tukisopimusta. Siksi jokainen haku on
// try/catchissa ja epäonnistuminen näkyy käyttäjälle tekstinä — live-osio ei
// saa kaataa muuta näkymää. Kyselyväli on tarkoituksella maltillinen
// (POLL_MS) eikä sitä saa kiristää: tämä on toisen palvelin.

const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';

/** Sarjamme → ESPN:n sarjakoodi. Tuntematon sarja jätetään hakematta. */
export const LEAGUE_CODES = {
  Valioliiga: 'eng.1',
  Veikkausliiga: 'fin.1',
  Championship: 'eng.2',
  'La Liga': 'esp.1',
  'Serie A': 'ita.1',
  Bundesliga: 'ger.1',
  'Ligue 1': 'fra.1',
};

/** Kyselyväli kun ottelu on käynnissä. Älä kiristä — tämä on toisen palvelin. */
export const POLL_MS = 30_000;

/**
 * Joukkueen nimen normalisointi täsmäytystä varten.
 * ESPN: "Brighton & Hove Albion", meillä: "Brighton and Hove Albion".
 * Myös AFC/FC/United-liitteet ja diakriitit vaihtelevat lähteiden välillä.
 */
export function normalizeTeam(name) {
  return String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/\b(afc|fc|cf|sc|ac|if|ifk|hjk)\b/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

async function getJson(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN ${res.status}`);
  return res.json();
}

/** Yhden sarjan ottelut tilanteineen */
export async function fetchScoreboard(leagueCode) {
  const data = await getJson(`${BASE}/${leagueCode}/scoreboard`);
  return (data.events ?? []).map(parseEvent).filter(Boolean);
}

export function parseEvent(event) {
  const comp = event?.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors?.find((c) => c.homeAway === 'home');
  const away = comp.competitors?.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const state = event.status?.type?.state; // 'pre' | 'in' | 'post'
  // Number(null) ja Number('') ovat 0, joten tyhja arvo pitaa hylata ENNEN
  // muunnosta: "0-0" ja "ei tietoa" ovat eri asioita, ja nolla vaarassa
  // paikassa nayttaisi tulokselta.
  const num = (v) => {
    if (v === null || v === undefined || String(v).trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  return {
    id: String(event.id),
    home: home.team?.displayName ?? '',
    away: away.team?.displayName ?? '',
    homeScore: num(home.score),
    awayScore: num(away.score),
    state: state ?? 'pre',
    inPlay: state === 'in',
    completed: state === 'post',
    clock: event.status?.displayClock ?? '',
    detail: event.status?.type?.description ?? '',
    kickoff: event.date ?? null,
  };
}

/** Tilastot joita näytämme. ESPN palauttaa paljon muutakin; nämä ovat ne joita katsoja lukee. */
export const STAT_ROWS = [
  { key: 'possessionPct', label: 'Pallonhallinta', suffix: ' %' },
  { key: 'totalShots', label: 'Laukaukset' },
  { key: 'shotsOnTarget', label: 'Laukaukset kohti' },
  { key: 'wonCorners', label: 'Kulmat' },
  { key: 'saves', label: 'Torjunnat' },
  { key: 'foulsCommitted', label: 'Rikkeet' },
  { key: 'yellowCards', label: 'Keltaiset' },
  { key: 'redCards', label: 'Punaiset' },
];

/** Ottelun tilastot ja maalitapahtumat */
export async function fetchSummary(leagueCode, eventId) {
  const data = await getJson(`${BASE}/${leagueCode}/summary?event=${encodeURIComponent(eventId)}`);
  return { stats: parseStats(data), events: parseKeyEvents(data) };
}

export function parseStats(data) {
  const teams = data?.boxscore?.teams;
  if (!Array.isArray(teams) || teams.length < 2) return null;

  const read = (t) => {
    const out = {};
    for (const s of t.statistics ?? []) {
      const n = Number(s.displayValue);
      out[s.name] = Number.isFinite(n) ? n : s.displayValue;
    }
    return out;
  };

  // boxscore.teams on [koti, vieras] vain jos homeAway kertoo sen — ei luoteta järjestykseen
  const home = teams.find((t) => t.homeAway === 'home') ?? teams[0];
  const away = teams.find((t) => t.homeAway === 'away') ?? teams[1];
  return { home: read(home), away: read(away) };
}

/** Maalit ja kortit minuutteineen */
export function parseKeyEvents(data) {
  const out = [];
  for (const e of data?.keyEvents ?? []) {
    const type = e.type?.text ?? '';
    if (!/goal|card/i.test(type)) continue;
    out.push({
      minute: e.clock?.displayValue ?? '',
      type,
      text: e.text ?? '',
      team: e.team?.displayName ?? null,
    });
  }
  return out;
}

// ─── Tulevien otteluiden ennakko (tiketti #63) ────────────────────────────
//
// TÄRKEÄ RAJAUS: ESPN tarjoaa kertoimia vain YHDELTÄ toimistolta (DraftKings,
// USA) ja amerikkalaisessa muodossa. Meidän analyysimme rakentuu kymmenen
// eurooppalaisen toimiston konsensuksen ja Pinnacle-sharp-ankkurin varaan,
// joten yhden toimiston hinnasta EI lasketa edgeä eikä panossuosituksia —
// se olisi eri mittari samalla nimellä.
//
// Tämä on siis ENNAKKOTIETO: mitä otteluita on tulossa ja suunnilleen millä
// hinnalla. Täysi analyysi tulee snapshot-putkesta.

/** Amerikkalainen kerroin desimaaliksi. -205 → 1.49, +360 → 4.60 */
export function americanToDecimal(american) {
  const n = Number(american);
  if (!Number.isFinite(n) || n === 0) return null;
  const dec = n > 0 ? n / 100 + 1 : 100 / Math.abs(n) + 1;
  return Math.round(dec * 100) / 100;
}

function pickMoneyline(odds) {
  const ml = odds?.moneyline;
  const draw = odds?.drawOdds?.moneyLine;
  if (!ml) return null;
  // close on tuorein hinta, open avaushinta — otetaan tuorein
  const side = (s) => americanToDecimal(ml[s]?.close?.odds ?? ml[s]?.open?.odds);
  const home = side('home');
  const away = side('away');
  return home && away ? { home, draw: americanToDecimal(draw), away, provider: odds.provider?.name ?? 'ESPN' } : null;
}

/** Tulevat ottelut aikavälillä, kertoimineen jos saatavilla */
export async function fetchFixtures(leagueCode, fromYmd, toYmd) {
  const range = fromYmd === toYmd ? fromYmd : `${fromYmd}-${toYmd}`;
  const data = await getJson(`${BASE}/${leagueCode}/scoreboard?dates=${range}&limit=200`);

  return (data.events ?? [])
    .map((event) => {
      const base = parseEvent(event);
      if (!base) return null;
      const comp = event.competitions?.[0];
      return { ...base, preview: pickMoneyline((comp?.odds ?? [])[0]) };
    })
    .filter(Boolean);
}

/** YYYYMMDD ESPN:n dates-parametrille */
export function ymd(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}
