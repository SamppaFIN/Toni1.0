// Tiketti #30: today.json:n lataus ja apufunktiot
//
// Latausjärjestys on tarkoituksellinen:
//   1. data/today.json  — putken tuottama oikea data (npm run snapshot:live)
//   2. FALLBACK-viesti   — jos tiedostoa ei ole, kerrotaan miksi eikä näytetä tyhjää
//
// Snapshot on valmiiksi laskettu: kertoimet, devig, malli, edge ja Kelly-panos
// tulevat Node-putkesta. Selain ei laske analytiikkaa uudelleen — se vain
// näyttää sen. Näin luvut ovat identtiset lokissa, testeissä ja käyttöliittymässä.

export const SCHEMA_VERSION = 1;

/** Lataa snapshot. Palauttaa { snapshot, error } — ei koskaan heitä. */
export async function loadSnapshot(url = 'data/today.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return { snapshot: null, error: `Tiedostoa ${url} ei löytynyt (HTTP ${res.status}).` };
    }
    const snapshot = await res.json();

    if (snapshot.schema_version !== SCHEMA_VERSION) {
      return {
        snapshot: null,
        error: `Snapshotin versio on ${snapshot.schema_version}, käyttöliittymä odottaa ${SCHEMA_VERSION}. Aja putki uudelleen.`,
      };
    }
    if (!Array.isArray(snapshot.matches)) {
      return { snapshot: null, error: 'Snapshot on vioittunut: matches-lista puuttuu.' };
    }
    return { snapshot, error: null };
  } catch (err) {
    return { snapshot: null, error: `Snapshotin lataus epäonnistui: ${err.message}` };
  }
}

// ─── Muotoilu ─────────────────────────────────────────────────────────────

export function pct(p, decimals = 1) {
  return p === null || p === undefined ? '—' : `${(p * 100).toFixed(decimals)} %`;
}

export function num(n, decimals = 2) {
  return n === null || n === undefined ? '—' : n.toFixed(decimals);
}

/**
 * Todennäköisyys reiluna kertoimena.
 * Tämä on se luku jota vasten toimiston kerrointa kannattaa verrata:
 * jos malli sanoo 25 %, reilu kerroin on 4.00 — kaikki sen yli on arvoa.
 */
export function fairOdds(prob) {
  return prob > 0 ? (1 / prob).toFixed(2) : '—';
}

const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

/** "la 16.8. klo 16:00" — paikallisessa ajassa */
export function kickoffLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}. klo ${time}`;
}

/** Kuinka kauan otteluun — auttaa arvioimaan onko kerroin vielä ajankohtainen */
export function timeUntil(iso, now = new Date()) {
  const diffMin = Math.round((Date.parse(iso) - now.getTime()) / 60000);
  if (!Number.isFinite(diffMin)) return '';
  if (diffMin < 0) return 'alkanut';
  if (diffMin < 60) return `${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} vrk`;
}

/** "2 h sitten" — uutisen tuoreus ratkaisee onko se vielä relevantti */
export function relativeAge(iso, now = new Date()) {
  const diffMin = Math.round((now.getTime() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(diffMin)) return '';
  if (diffMin < 1) return 'juuri nyt';
  if (diffMin < 60) return `${diffMin} min sitten`;
  const hours = Math.floor(diffMin / 60);
  if (hours < 24) return `${hours} h sitten`;
  const days = Math.floor(hours / 24);
  return `${days} vrk sitten`;
}

/** Snapshotin ikä minuutteina — vanha data on huono peruste vedolle */
export function snapshotAgeMinutes(snapshot, now = new Date()) {
  const t = Date.parse(snapshot?.generated_at ?? '');
  return Number.isFinite(t) ? Math.round((now.getTime() - t) / 60000) : null;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Value-lippujen esitys ────────────────────────────────────────────────

export const FLAG_META = {
  strong: { icon: '💎', label: 'Vahva signaali', badge: 'badge-green' },
  candidate: { icon: '🟡', label: 'Kandidaatti', badge: 'badge-yellow' },
  none: { icon: '', label: 'Ei arvoa', badge: 'badge-muted' },
};

export const SIDE_LABELS = { home: '1', draw: 'X', away: '2' };

/** Ottelun paras edge — tällä kortit järjestetään ja lipputetaan */
export function bestEdge(match) {
  const edges = match.analysis?.edges ?? [];
  if (!edges.length) return null;
  return edges.reduce((a, b) => (b.edge > a.edge ? b : a));
}

/** Mallin tilan selitys käyttäjälle — tämä on olennaista luottamuksen kannalta */
export const METHOD_LABELS = {
  'poisson+sharp-blend': {
    short: 'Poisson + markkina',
    long: 'Oma maalimalli yhdistettynä markkinan tarkimpaan hintaan. Vahvin käytettävissä oleva arvio.',
  },
  poisson: {
    short: 'Vain oma malli',
    long: 'Markkina-ankkuria ei saatu, joten arvio nojaa pelkkään maalimalliin. Suhtaudu varauksella.',
  },
  'market-only': {
    short: 'Vain markkina',
    long: 'Sarjalle ei ole tunnuslukulähdettä, joten omaa maalimallia ei voi laskea. Arvio on markkinan tarkin hinta ilman katetta — edge syntyy pelkästään hintavertailusta toimistojen välillä.',
  },
};
