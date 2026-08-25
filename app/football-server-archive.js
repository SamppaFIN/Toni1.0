// Tiketti #83: Palvelimen kerroinarkisto selaimen käyttöön
//
// PROJEKTISSA OLI KAKSI ARKISTOA JOTKA EIVÄT PUHUNEET KESKENÄÄN:
//
//   selaimessa  bt_odds_archive   (tiketti #60) — mitä TÄMÄ selain on nähnyt
//   palvelimella odds-history.json (tiketti #75) — mitä cron on kerännyt
//
// Ottelukortit lukivat vain ensimmäistä. Seuraus: tyhjällä selaimella
// eilinen päivä näytti tyhjältä ja pelattu ottelu putosi "otteluohjelma ilman
// julkaistuja kertoimia" -listaan — vaikka palvelimella oli kuusi
// kerroinhavaintoa, tunnusluvut, mallin arvio ja lopputulos.
//
// Tämä moduuli tekee palvelinarkistosta korttikelpoista. Selaimen oma arkisto
// jää ennalleen: se on tuoreempi kuluvalle päivälle, koska se päivittyy joka
// latauksella eikä vain cronin tahdissa.
//
// EI KEKSITÄ MITÄÄN. Kortti rakennetaan vain siitä mikä on tallessa. Jos
// tunnuslukuja ei ole, osio kertoo sen — se on eri asia kuin tyhjä ruutu.

const URL_PATH = 'data/odds-history.json';

/**
 * Paikallinen kalenteripäivä aloituspotkusta.
 *
 * Sama laskenta kuin selaimen omassa arkistossa (tiketti #60). UTC-päivän
 * käyttäminen siirtäisi myöhäisillan ottelut eri päivälle kuin mihin toinen
 * arkisto ne tallettaa, ja sama ottelu voisi näkyä kahtena.
 */
function localDayKey(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let file = null;
let state = 'idle'; // idle | loading | ready | failed
let failReason = '';

export async function load() {
  if (state === 'loading' || state === 'ready') return file;
  state = 'loading';
  try {
    const res = await fetch(URL_PATH, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.matches)) throw new Error('rikkinäinen rakenne');
    file = data;
    state = 'ready';
  } catch (err) {
    // Palvelinarkisto on lisä, ei ehto: ilman sitä kortit toimivat kuten
    // ennen selaimen omasta arkistosta.
    state = 'failed';
    failReason = err.message;
    file = null;
  }
  return file;
}

export function isReady() {
  return state === 'ready';
}

export function failure() {
  return state === 'failed' ? failReason : null;
}

/**
 * Muunna aikasarja ottelukortiksi.
 *
 * Analyysi luetaan AVAUSHAVAINNOSTA, samoin kuin palvelimen mittareissa:
 * sulkeutumislinjaa vasten esitetty arvio hyötyisi tiedosta joka syntyi vasta
 * ennusteen jälkeen.
 */
export function toCard(timeline) {
  const opening = timeline.points?.[0];
  if (!opening) return null;

  const extra = timeline.opening?.model_extra ?? null;

  return {
    id: timeline.match_id,
    league: timeline.league,
    kickoff: timeline.kickoff,
    home: timeline.opening?.home_team ?? { name: timeline.home },
    away: timeline.opening?.away_team ?? { name: timeline.away },

    odds: timeline.opening?.books ?? [],
    best: timeline.opening?.best ?? null,

    market: {
      margin: null,
      implied: opening.implied,
      sharp: null,
      sharp_source: null,
    },

    model: {
      method: extra?.method ?? null,
      lambda_home: extra?.lambda_home ?? null,
      lambda_away: extra?.lambda_away ?? null,
      probs: opening.model,
      poisson_probs: extra?.poisson_probs ?? null,
      blend_weight: extra?.blend_weight ?? null,
      over25: extra?.over25 ?? null,
      btts: extra?.btts ?? null,
      top_scores: [],
      adjustments: [],
      home_strength: null,
      away_strength: null,
    },

    stats: timeline.opening?.stats ?? null,
    news: [],
    analysis: {
      edges: timeline.opening?.edges ?? [],
      news_window: false,
      bankroll_basis: 100,
    },

    // Lopputulos on tallessa — kortti saa näyttää sen sen sijaan että
    // esittäisi pelatun ottelun vetokohteena
    result: timeline.result ?? null,
    fromArchive: true,
    fromServer: true,
    /** Montako kerroinhavaintoa ottelusta on — kertoo liikkuiko hinta */
    observations: timeline.points.length,
  };
}

/** Yhden päivän ottelut palvelinarkistosta, korttimuodossa */
export function serverArchiveDay(day) {
  if (!file?.matches) return [];
  return file.matches
    .filter((t) => localDayKey(t.kickoff) === day)
    .map(toCard)
    .filter(Boolean)
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

/** Päivät joilta palvelinarkistossa on dataa */
export function serverArchiveDays() {
  if (!file?.matches) return [];
  return [...new Set(file.matches.map((t) => localDayKey(t.kickoff)))].filter(Boolean).sort().reverse();
}

if (typeof window !== 'undefined') {
  window.BTSA = { load, serverArchiveDay, serverArchiveDays, isReady, failure };
}
