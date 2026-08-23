// Tiketti #30: Jalkapallonäkymän liitos demoon
//
// Tämä moduuli ei koske jääkiekkokoodiin. Yhteys kulkee kahden kapean rajapinnan
// kautta, jotka on dokumentoitu demo.html:ssä:
//
//   window.BT  — demon tarjoamat toiminnot (kassa, vetolappu, toast)
//   window.BTF — tämän moduulin tarjoamat toiminnot (renderöinti, vedonasetus)
//
// Näin jääkiekkodemo ja sen 23 E2E-testiä toimivat ennallaan, ja jalkapallopuoli
// on alusta asti moduuleissa eikä kasvata demo.html:ää.

import {
  loadSnapshot,
  esc,
  SIDE_LABELS,
  getDataSource,
  setDataSource,
  getMockRound,
  setMockRound,
  getMockRoundCount,
} from './snapshot.js';
import { initCards, setSnapshot, renderAllCards, renderPlacedBets, toggleSection, findMatch, matchIndex, getSnapshot, setDayFilter, getDayFilter, addFactorFromForm, removeFactorById, clearFactorsFor } from './football-cards.js';
import * as tracker from './football-tracker.js';
import * as metrics from './football-metrics.js';
import { DISPLAY_OPTIONS, getPrefs, togglePref, resetPrefs } from './football-prefs.js';
import * as teamsTable from './football-teams.js';
import * as liveView from './football-live.js';
import './football-chase.js'; // rekisteröi window.BTC — ei tarvitse suoraa viittausta täältä
import './football-llm.js'; // rekisteröi window.BTL (tiketti #38)

/** Vedonasetuksen ponnahdus — sama vuo kuin jääkiekkopuolella */
function openBetPopup(matchId, side, odds, bookmaker) {
  const match = findMatch(matchId);
  if (!match) return;

  const index = matchIndex(matchId);
  const el = document.getElementById(`fbetpop-${index}`);
  if (!el) return;

  // Sama kerroin uudelleen klikattuna sulkee
  if (el.style.display === 'block' && el.dataset.side === side && el.dataset.book === bookmaker) {
    el.style.display = 'none';
    return;
  }

  const bankroll = window.BT.getBankroll();
  const sideLabel = side === 'home' ? match.home.name : side === 'away' ? match.away.name : 'Tasapeli';
  const edge = match.analysis.edges.find((e) => e.side === side);

  // Panossuositus esitäytetään vain jos malli oikeasti suosittelee vetoa
  const suggested = edge && edge.stake_suggestion > 0 ? edge.stake_suggestion : 10;
  const edgeNote = edge
    ? edge.stake_suggestion > 0
      ? `<div style="font-size:.6rem;color:var(--c-success);margin-bottom:5px">💡 Malli: edge ${(edge.edge * 100).toFixed(1)} %, suositeltu panos ${edge.stake_suggestion.toFixed(2)} € (murto-Kelly)</div>`
      : `<div style="font-size:.6rem;color:var(--c-danger);margin-bottom:5px">⚠️ Malli: edge ${(edge.edge * 100).toFixed(1)} % — ei panossuositusta tälle kohteelle</div>`
    : '';

  el.dataset.side = side;
  el.dataset.book = bookmaker;
  el.style.display = 'block';
  el.innerHTML = `<div style="padding:7px;background:oklch(1 1 0/0.07);border-radius:8px">
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:5px">
      <span style="font-weight:700;font-size:.78rem;min-width:16px">${SIDE_LABELS[side]}</span>
      <span style="font-size:.72rem;color:var(--c-text-muted)">${esc(sideLabel)} @ ${odds.toFixed(2)} · ${esc(bookmaker)}</span>
    </div>
    ${edgeNote}
    <div style="display:flex;gap:4px;margin-bottom:6px">
      ${[5, 10, 25].map((amount) => `<button class="btn" style="flex:1;font-size:.62rem;padding:4px;min-height:28px;background:oklch(1 1 0/0.1);color:var(--c-text)" onclick="event.stopPropagation();window.BTF.setStake(${index},${amount})">${amount} €</button>`).join('')}
      ${edge && edge.stake_suggestion > 0 ? `<button class="btn" style="flex:1;font-size:.62rem;padding:4px;min-height:28px;background:oklch(0.62 0.20 145 / 0.25);color:var(--c-text)" onclick="event.stopPropagation();window.BTF.setStake(${index},${edge.stake_suggestion})" title="Murto-Kelly">Kelly</button>` : ''}
    </div>
    <div style="display:flex;gap:6px;align-items:center">
      <input type="number" id="fstake-${index}" value="${suggested.toFixed(2)}" min="0.01" step="0.01" max="${bankroll.toFixed(2)}" style="flex:1;padding:6px;border-radius:4px;border:1px solid var(--c-text-muted);background:var(--c-bg);color:var(--c-text);font-size:.75rem;text-align:center">
      <span style="font-size:.7rem;color:var(--c-text-muted)">€</span>
      <button class="btn btn-success" style="font-size:.7rem;padding:6px 14px;min-height:36px" onclick="event.stopPropagation();window.BTF.confirmBet('${esc(matchId)}','${side}',${odds},'${esc(bookmaker)}')">✅ Veto</button>
    </div>
  </div>`;
}

function setStake(index, amount) {
  const input = document.getElementById(`fstake-${index}`);
  if (input) input.value = Number(amount).toFixed(2);
}

function confirmBet(matchId, side, odds, bookmaker) {
  const match = findMatch(matchId);
  if (!match) return;

  const index = matchIndex(matchId);
  const stake = parseFloat(document.getElementById(`fstake-${index}`)?.value ?? '0');
  if (!stake || stake <= 0 || stake > window.BT.getBankroll()) {
    window.BT.toast('⚠️ Virheellinen panos');
    return;
  }

  // practice: true → demon vetolappu näyttää manuaaliset ✅/❌-napit ja
  // jääkiekkosimulaatio ei koske näihin vetoihin. football: true erottaa
  // nämä harjoituskohteista, jotta tiketin 32 simulaatio löytää ne.
  window.BT.addBet({
    id: Date.now(),
    game_id: matchId,
    side,
    odds,
    stake,
    bookmaker,
    practice: true,
    football: true,
    home: match.home.name,
    away: match.away.name,
    league: match.league,
    kickoff: match.kickoff,
  });

  const popup = document.getElementById(`fbetpop-${index}`);
  if (popup) popup.style.display = 'none';

  renderPlacedBets();
  window.BT.toast(`✅ ${SIDE_LABELS[side]} ${stake.toFixed(2)} € @ ${odds.toFixed(2)} · ${bookmaker}`);
}

/** Lataa snapshot ja renderöi. Kutsutaan myös Admin-välilehden päivitysnapista. */
export async function reload() {
  const { snapshot, error } = await loadSnapshot();
  setSnapshot(snapshot, error);
  renderAllCards();
  // LLM-paneelin nappi kertoo otteluiden määrän — se vanhenee jos snapshot vaihtuu
  if (window.BTL) window.BTL.render();
  return { snapshot, error };
}

// ─── Harjoituskierrokset (tiketti #37) ───────────────────────────────────

/**
 * Siirry seuraavaan harjoituskierrokseen.
 *
 * Simulaatio nollataan, koska sen tulokset koskivat edellistä kierrosta.
 * Vetoja EI nollata: avoin veto edelliseltä kierrokselta jää vetolappuun,
 * ja tappioketju jatkuu kierroksen yli — se on koko harjoituksen pointti.
 */
async function nextMockRound() {
  const next = getMockRound() + 1;
  if (next >= getMockRoundCount()) return;
  setMockRound(next);
  if (window.BTT) window.BTT.reset();
  await reload();
  tracker.render();
  window.BT.toast(`🎯 Kierros ${next + 1} / ${getMockRoundCount()}`);
}

async function restartMockRounds() {
  setMockRound(0);
  if (window.BTT) window.BTT.reset();
  await reload();
  tracker.render();
  window.BT.toast('🔄 Harjoituskierrokset alusta');
}

/** Näyttöasetuksen vaihto (tiketti #39) — vaikuttaa vain renderöintiin */
function toggleDisplay(key) {
  togglePref(key);
  renderAllCards();
  if (typeof window.renderAdmin === 'function') window.renderAdmin();
}

function resetDisplay() {
  resetPrefs();
  renderAllCards();
  if (typeof window.renderAdmin === 'function') window.renderAdmin();
  window.BT.toast('🔄 Näyttöasetukset palautettu');
}

/** Vaihda datalähde oikean ja harjoitusdatan välillä */
async function switchDataSource(source) {
  setDataSource(source);
  if (window.BTT) window.BTT.reset();
  await reload();
  tracker.render();
  if (window.BTC) window.BTC.render();
  // Admin-paneeli näyttää valitun lähteen ✓-merkillä, joten se pitää
  // renderöidä uudelleen — muuten nappi jää näyttämään vanhaa valintaa
  if (typeof window.renderAdmin === 'function') window.renderAdmin();
  window.BT.toast(source === 'mock' ? '🎯 Harjoituskierrokset käytössä' : '⚽ Oikeat kohteet käytössä');
}

// Julkinen rajapinta demo.html:lle ja onclick-käsittelijöille
window.BTF = {
  reload,
  renderAllCards,
  renderPlacedBets,
  toggleSection,
  setDayFilter,
  getDayFilter,
  addFactor: addFactorFromForm,
  removeFactor: removeFactorById,
  clearFactors: clearFactorsFor,
  setStake,
  confirmBet,
  openBetPopup,
  getSnapshot,
  nextMockRound,
  restartMockRounds,
  switchDataSource,
  getDataSource,
  toggleDisplay,
  resetDisplay,
  getPrefs,
  DISPLAY_OPTIONS,
};

// Demo.html kutsuu tätä kun jalkapallonäkymä on aktiivinen
window.BT_FOOTBALL_READY = true;

/** Alustus: liitä kontti ja lataa data */
export async function start(containerId = 'round-games') {
  const el = document.getElementById(containerId);
  if (!el) return;
  initCards(el);
  tracker.init();
  await reload();
  tracker.render();

  // Mittarit ovat oma tiedostonsa ja voivat puuttua (esim. ennen ensimmaista
  // metrics-ajoa) — lataus ei saa estaa muun nakyman toimintaa
  await metrics.load();
  metrics.render();

  // Tiketti #45: joukkuetaulukko on myös oma tiedostonsa, samasta syystä
  await teamsTable.load();
  teamsTable.render();

  // Tiketti #56: live-tilanne. Haku kaynnistyy vasta kun Seuranta-valilehti
  // avataan (switchTab -> BTV.activate) -- ei turhia kutsuja ESPN:aan
  // kayttajalle joka ei katso liveä.
  liveView.render();
}

// Itsekäynnistys. Moduuli latautuu deferoituna eli inline-skriptin jälkeen,
// joten kontti on jo DOM:ssa. Lajilippu luetaan suoraan localStoragesta,
// jolloin moduuli ei riipu inline-skriptin latausjärjestyksestä.
//
// Oletus on 'football' — sama päätös kuin demo.html:n SPORT-lipussa.
// PIDÄ NÄMÄ SYNKASSA: jos demo.html olettaa jalkapalloa mutta tämä jääkiekkoa,
// moduuli ei käynnisty ja kierrosnäkymä jää tyhjäksi ilman virheilmoitusta.
// Admin-välilehden setSport() lataa sivun uudelleen, jolloin ehto arvioidaan
// uudestaan tuoreella bt_sport-arvolla.
if ((localStorage.getItem('bt_sport') || 'football') !== 'hockey') {
  start();
}
