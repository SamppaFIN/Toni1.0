// Tiketti #59: Tämän päivän pelatut ottelut tuloksineen
//
// Vastinpari päiväsuodattimelle (tiketti #46): suodatin piilottaa alkaneet
// ottelut TOIMINTALISTALTA, koska niihin ei voi enää lyödä ja niiden kerroin
// on vanhentunut. Tämä osio näyttää samat ottelut ARVIOITAVAKSI — mitä
// tapahtui, osuiko malli, miten omat vedot kävivät.
//
// Kaksi asiaa tehdään tarkoituksella:
//
//   1. LÄHDE ON ESPN, EI SNAPSHOT. Snapshot sisältää vain ne ottelut joille
//      saatiin kertoimet, ja se vanhenee cron-ajojen välissä. Käyttäjä pyysi
//      "kaikki tämän päivän pelatut", joten lista tulee tuloslähteestä ja
//      snapshot liitetään mukaan siellä missä se löytyy.
//
//   2. MALLIN ARVIO NÄYTETÄÄN AINA MARKKINAN RINNALLA. Yksin esitettynä
//      "malli osui" on tulkitsematon — koko projektin mittariperiaate
//      (analyze/scoring.ts) on että luku tarvitsee vertailukohdan.

import { esc, pct } from './snapshot.js';
import { getSnapshot } from './football-cards.js';
import { LEAGUE_CODES, fetchScoreboard, normalizeTeam } from './football-espn.js';

let container = null;
let state = { matches: [], error: null, loadedAt: null, loading: false };

/** Paikallinen kalenteripäivä — sama määritelmä kuin päiväsuodattimessa */
function localDayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Sarjat joita seurataan — snapshotista, muuten Valioliiga */
function trackedLeagues() {
  const snap = getSnapshot();
  const names = new Set((snap?.matches ?? []).map((m) => m.league));
  const codes = [...names].map((n) => LEAGUE_CODES[n]).filter(Boolean);
  return codes.length ? [...new Set(codes)] : ['eng.1'];
}

export async function load(now = new Date()) {
  if (state.loading) return;
  state.loading = true;
  const today = localDayKey(now);

  try {
    const all = [];
    for (const code of trackedLeagues()) {
      try {
        for (const ev of await fetchScoreboard(code)) {
          if (ev.completed && localDayKey(ev.kickoff) === today) all.push(ev);
        }
      } catch (err) {
        // Yhden sarjan pettäminen ei saa piilottaa toisen tuloksia
        console.warn('[Tulokset] sarja', code, err.message);
      }
    }
    all.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    state = { matches: all, error: null, loadedAt: new Date(), loading: false };
  } catch (err) {
    state = { ...state, error: err.message, loading: false };
  }
  return state.matches;
}

function snapshotCardFor(m) {
  const snap = getSnapshot();
  if (!snap) return null;
  return (
    snap.matches.find(
      (c) =>
        normalizeTeam(c.home.name) === normalizeTeam(m.home) &&
        normalizeTeam(c.away.name) === normalizeTeam(m.away)
    ) ?? null
  );
}

function outcomeOf(m) {
  if (m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return 'home';
  if (m.awayScore > m.homeScore) return 'away';
  return 'draw';
}

/** Todennäköisin kohde — sama argmax kuin palvelimen scoring.ts:ssä */
function argmax(probs) {
  return ['home', 'draw', 'away'].reduce((best, s) => (probs[s] > probs[best] ? s : best), 'home');
}

const SIDE_LABEL = { home: '1', draw: 'X', away: '2' };

/**
 * Mallin ja markkinan arvio rinnakkain. Kumpikaan ei esiinny yksin:
 * "malli osui" ilman vertailua ei kerro oliko se taitoa vai tuuria.
 */
function verdictBlock(card, actual) {
  if (!card || !actual) return '';

  const modelPick = argmax(card.model.probs);
  const marketPick = argmax(card.market.implied);
  const mark = (hit) =>
    hit
      ? '<span style="color:var(--c-success);font-weight:700">osui</span>'
      : '<span style="color:var(--c-danger)">pieleen</span>';

  return `<div style="margin-top:6px;padding-top:5px;border-top:1px dashed oklch(1 1 0/0.12);font-size:.63rem">
    <div class="row">
      <span style="color:var(--c-text-muted)">Malli veikkasi</span>
      <span><b>${SIDE_LABEL[modelPick]}</b> ${pct(card.model.probs[modelPick], 0)} · ${mark(modelPick === actual)}</span>
    </div>
    <div class="row">
      <span style="color:var(--c-text-muted)">Markkina veikkasi</span>
      <span><b>${SIDE_LABEL[marketPick]}</b> ${pct(card.market.implied[marketPick], 0)} · ${mark(marketPick === actual)}</span>
    </div>
  </div>`;
}

/** Omat vedot tähän otteluun ja miten ne ratkesivat */
function betsBlock(m, card, actual) {
  const bets = (window.BT?.getBets?.() ?? []).filter(
    (b) =>
      (card && b.game_id === card.id) ||
      (normalizeTeam(b.home) === normalizeTeam(m.home) && normalizeTeam(b.away) === normalizeTeam(m.away))
  );
  if (!bets.length) return '';

  const rows = bets
    .map((b) => {
      const won = b.side === actual;
      return `<div class="row" style="font-size:.64rem;padding:2px 0">
        <span>🎫 ${SIDE_LABEL[b.side] ?? '?'} ${b.stake.toFixed(2)} € @ ${b.odds.toFixed(2)}</span>
        <span>${
          won
            ? `<b style="color:var(--c-success)">✅ +${(b.stake * (b.odds - 1)).toFixed(2)} €</b>`
            : `<b style="color:var(--c-danger)">❌ −${b.stake.toFixed(2)} €</b>`
        }</span>
      </div>`;
    })
    .join('');

  return `<div style="margin-top:5px;padding-top:5px;border-top:1px dashed oklch(1 1 0/0.12)">
    <div style="font-size:.63rem;font-weight:700;margin-bottom:2px">Omat vetosi</div>${rows}
  </div>`;
}

function resultCard(m) {
  const card = snapshotCardFor(m);
  const actual = outcomeOf(m);

  const score =
    m.homeScore === null || m.awayScore === null
      ? '<span style="color:var(--c-text-muted)">– : –</span>'
      : `<b style="font-size:1.05rem;font-variant-numeric:tabular-nums">${m.homeScore} – ${m.awayScore}</b>`;

  return `<div class="card">
    <div class="row">
      <span style="font-size:.74rem">${esc(m.home)} – ${esc(m.away)}</span>
      ${score}
    </div>
    ${card ? '' : '<div style="font-size:.6rem;color:var(--c-text-muted);margin-top:3px">Ei ollut kierroskortilla — ei mallin arviota</div>'}
    ${verdictBlock(card, actual)}
    ${betsBlock(m, card, actual)}
  </div>`;
}

export function render(containerId = 'round-played') {
  container = document.getElementById(containerId) || container;
  if (!container) return;

  if (!state.loadedAt && !state.error) {
    container.innerHTML = '';
    return;
  }

  if (state.error) {
    container.innerHTML = `<div style="font-size:.63rem;color:var(--c-text-muted);margin:10px 0 4px 2px">
      Tämän päivän tuloksia ei saatu: ${esc(state.error)}
    </div>`;
    return;
  }

  if (!state.matches.length) {
    container.innerHTML = `<div style="font-size:.63rem;color:var(--c-text-muted);margin:12px 0 4px 2px">
      ✅ Ei vielä tämän päivän pelattuja otteluita.
    </div>`;
    return;
  }

  const header = `<div style="display:flex;justify-content:space-between;align-items:center;margin:14px 0 6px 2px">
    <span style="font-size:.7rem;font-weight:700">✅ Tänään pelatut (${state.matches.length})</span>
    <button class="btn" style="font-size:.58rem;padding:3px 9px;min-height:24px;border-radius:12px;background:oklch(1 1 0/0.08);color:var(--c-text)" onclick="window.BTR.refresh()">🔄</button>
  </div>`;

  container.innerHTML = header + state.matches.map(resultCard).join('');
}

export async function refresh() {
  await load();
  render();
}

window.BTR = { load, render, refresh };
