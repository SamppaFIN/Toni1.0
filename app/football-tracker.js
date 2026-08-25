// Tiketti #32: Seuranta-näkymä jalkapallolle
//
// Vastaa Seuranta-välilehden sisällöstä: simulaation käynnistys, live-tilanne,
// pikavedot ja kierrosraportti.
//
// TÄRKEIN ERO JÄÄKIEKKODEMOON: simuloidut tulokset tallennetaan omaan avaimeen
// `bt_sim_results` ja jokainen niistä on merkitty `simulated: true`. Oikeat
// lopputulokset menisivät avaimeen `bt_real_results`. Jos nämä sekoittuisivat,
// mallin tarkkuustilasto (tiketti 33) mittaisi arpanoppaa eikä mallia — ja
// se luku olisi pahempi kuin ei lukua lainkaan.

import { esc } from './snapshot.js';
import { isVisible } from './football-prefs.js';
import { getSnapshot } from './football-cards.js';
import { start, clear, isRunning, isFinished, getSims, renderSimCard, renderReport, minuteLabel } from './football-sim.js';

const SIM_RESULTS_KEY = 'bt_sim_results';

let listEl = null;
let buttonEl = null;
let lastStates = [];
let lastSettled = [];

export function init(listId = 'tracker-list', buttonId = 'sim-btn') {
  listEl = document.getElementById(listId);
  buttonEl = document.getElementById(buttonId);
}

function saveSimResults(sims) {
  const records = sims.map((s) => ({
    match_id: s.matchId,
    league: s.league,
    home: s.home.name,
    away: s.away.name,
    home_score: s.finalScore.home,
    away_score: s.finalScore.away,
    outcome: s.outcome,
    predicted: s.predicted,
    model_probs: s.modelProbs,
    over25: s.over25,
    btts: s.btts,
    resolved_at: new Date().toISOString(),
    // Tämä lippu on koko erottelun ydin
    simulated: true,
  }));

  const existing = JSON.parse(localStorage.getItem(SIM_RESULTS_KEY) || '[]');
  localStorage.setItem(SIM_RESULTS_KEY, JSON.stringify([...existing, ...records]));
}

/** Ratkaise 1X2-vedot simulaation lopputuloksilla */
function settleBets(sims) {
  const bets = window.BT.getBets().filter((b) => b.football);
  const settled = [];

  for (const bet of bets) {
    const sim = sims.find((s) => s.matchId === bet.game_id);
    if (!sim) continue;

    const won = bet.type === 'next_goal' ? false : bet.side === sim.outcome;
    const sideLabel = bet.side === 'home' ? sim.home.name : bet.side === 'away' ? sim.away.name : 'Tasapeli';
    const resultLabel = `${sim.home.short} ${sim.finalScore.home}–${sim.finalScore.away} ${sim.away.short} (simuloitu)`;

    // Pikavedot ratkeavat jo maalin tullessa, joten tässä käsitellään vain
    // ne jotka ovat vielä avoimia — eli 1X2-vedot
    if (bet.type === 'next_goal') continue;

    window.BT.settleFootballBet(bet.id, won, resultLabel);
    settled.push({ ...bet, won, sideLabel, resultLabel });
  }

  return settled;
}

/** Pikaveto: kumpi tekee seuraavan maalin */
export function quickBetNextGoal(matchId, side) {
  const snapshot = getSnapshot();
  const match = snapshot?.matches.find((m) => m.id === matchId);
  if (!match) return;
  if (window.BT.getBankroll() < 5) {
    window.BT.toast('⚠️ Vaatii vähintään 5 € kassan');
    return;
  }

  const odds = 1.9;
  window.BT.addBet({
    id: Date.now(),
    game_id: matchId,
    side,
    odds,
    stake: 5,
    bookmaker: null,
    type: 'next_goal',
    practice: true,
    football: true,
    home: match.home.name,
    away: match.away.name,
  });

  const label = side === 'home' ? match.home.name : match.away.name;
  window.BT.toast(`⚡ Pikaveto: ${label} tekee seuraavan maalin, 5 € @ ${odds}`);
  render();
}

/** Ratkaise avoimet pikavedot kun maali syntyy */
function resolveQuickBets(newGoals) {
  for (const { sim, event } of newGoals) {
    const open = window.BT.getBets().filter((b) => b.football && b.type === 'next_goal' && b.game_id === sim.matchId);
    for (const bet of open) {
      const won = bet.side === event.side;
      const scorer = event.side === 'home' ? sim.home.short : sim.away.short;
      window.BT.settleFootballBet(bet.id, won, `${scorer} teki maalin ${event.minute}' (simuloitu)`);
      window.BT.toast(won ? `⚡ Pikaveto osui! ${scorer} ${event.minute}'` : `⚡ Pikaveto hävisi — ${scorer} ${event.minute}'`);
    }
  }
}

/** Vedot ottelun kortin alle */
function renderBetsForMatch(sim) {
  const el = document.getElementById(`fsim-bets-${sim.matchId}`);
  if (!el) return;
  const bets = window.BT.getBets().filter((b) => b.football && b.game_id === sim.matchId);
  el.innerHTML = bets.length
    ? `<div style="margin-top:5px;padding-top:4px;border-top:1px dashed oklch(1 1 0/0.12);font-size:.63rem">${bets
        .map((b) => {
          const label = b.type === 'next_goal' ? `⚡ ${b.side === 'home' ? sim.home.short : sim.away.short} seuraava maali` : b.side === 'home' ? sim.home.short : b.side === 'away' ? sim.away.short : 'Tasapeli';
          return `<div class="row"><span>🎫 ${esc(label)} ${b.stake.toFixed(2)} € @ ${b.odds.toFixed(2)}</span><span style="color:var(--c-success)">→ ${(b.stake * b.odds).toFixed(2)} €</span></div>`;
        })
        .join('')}</div>`
    : '';
}

function quickBetButtons(sim) {
  return `<div style="display:flex;gap:4px;margin-top:5px">
    <button class="btn" style="flex:1;font-size:.6rem;padding:5px 4px;min-height:28px;background:oklch(0.62 0.18 240 / 0.2);color:var(--c-text);border-radius:6px" onclick="window.BTT.quickBetNextGoal('${esc(sim.matchId)}','home')">⚡ ${esc(sim.home.short)} seuraava maali 5 €</button>
    <button class="btn" style="flex:1;font-size:.6rem;padding:5px 4px;min-height:28px;background:oklch(0.62 0.20 145 / 0.2);color:var(--c-text);border-radius:6px" onclick="window.BTT.quickBetNextGoal('${esc(sim.matchId)}','away')">⚡ ${esc(sim.away.short)} seuraava maali 5 €</button>
  </div>`;
}

// ─── Näkymä ───────────────────────────────────────────────────────────────

export function render() {
  if (!listEl) return;
  const snapshot = getSnapshot();

  // Tiketti #78: simulaatio on harjoitusvaline, ei osa oikeaa nakymaa.
  // Nappi ilmestyy vasta kun Admin-valilehden Simulaatio-toggle on paalla.
  // Piilotus tehdaan tassa eika CSS:ssa, jotta se tapahtuu joka
  // renderoinnissa -- muuten toggle vaikuttaisi vasta sivun latauksen
  // jalkeen ja nayttaisi rikkinaiselta.
  const simVisible = isVisible('sim');
  if (buttonEl) buttonEl.style.display = simVisible ? 'block' : 'none';
  if (!simVisible && !isRunning() && !isFinished()) {
    listEl.innerHTML =
      '<div class="empty">Seuranta näyttää käynnissä olevat ottelut oikeasta datasta.<br>' +
      '<span style="font-size:.62rem;color:var(--c-text-muted)">Simulaation saa käyttöön Admin-välilehdeltä.</span></div>';
    return;
  }

  // Simulaatio käynnissä
  if (isRunning()) {
    const minute = lastStates.length ? lastStates[0].minute : 0;
    listEl.innerHTML = lastStates
      .map(({ sim, state }) => {
        const card = renderSimCard(sim, state, minute, true);
        return card.replace('<div id="fsim-bets-', `${quickBetButtons(sim)}<div id="fsim-bets-`);
      })
      .join('');
    lastStates.forEach(({ sim }) => renderBetsForMatch(sim));
    return;
  }

  // Simulaatio pelattu
  if (isFinished()) {
    const sims = getSims();
    listEl.innerHTML =
      renderReport(sims, lastSettled) +
      sims.map((sim) => renderSimCard(sim, finalState(sim), 90 + sim.addedSecond, false)).join('');
    return;
  }

  // Ennen simulaatiota
  const bets = window.BT.getBets().filter((b) => b.football);
  const matchCount = snapshot?.matches.length ?? 0;

  let html = `<div class="card">
    <div class="row"><strong style="font-size:.8rem">🏟️ Pelipäivän simulaatio</strong><span class="badge badge-yellow" style="font-size:.5rem">SIMULOITU</span></div>
    <div style="font-size:.65rem;color:var(--c-text-muted);margin-top:5px;line-height:1.6">
      Simulaatio arpoo ${matchCount} ottelun tulokset <b>kortilla näkyvistä mallin todennäköisyyksistä</b>,
      ja maalimäärät odotettujen maalien (λ) mukaan. 90 minuuttia tiivistyy 20 sekuntiin.
      <br><br>
      Tulokset ovat arvottuja. Ne tallentuvat erilleen oikeista tuloksista eivätkä
      kirjaudu mallin tarkkuustilastoon — muuten se mittaisi arpanoppaa.
    </div>
  </div>`;

  if (bets.length) {
    const stake = bets.reduce((s, b) => s + b.stake, 0);
    const potential = bets.reduce((s, b) => s + b.stake * b.odds, 0);
    html += `<div class="card"><div style="font-size:.75rem;font-weight:700;margin-bottom:4px">🎫 Avoimet vedot (${bets.length})</div>
      ${bets
        .map((b) => `<div class="row" style="font-size:.66rem;margin:3px 0"><span>${esc(b.side === 'home' ? b.home : b.side === 'away' ? b.away : 'Tasapeli')}${b.type === 'next_goal' ? ' ⚡' : ''}</span><span>${b.stake.toFixed(2)} € @ ${b.odds.toFixed(2)}</span></div>`)
        .join('')}
      <div class="row" style="margin-top:6px;padding-top:5px;border-top:1px solid oklch(1 1 0/0.1);font-weight:700;font-size:.68rem"><span>Panokset / mahd. voitto</span><span>${stake.toFixed(2)} € / <span style="color:var(--c-success)">${potential.toFixed(2)} €</span></span></div>
    </div>`;
  } else {
    html += `<div class="empty" style="font-size:.75rem">Aseta vetoja Kierros-välilehdellä, sitten käynnistä simulaatio.</div>`;
  }

  listEl.innerHTML = html;
}

function finalState(sim) {
  return {
    home: sim.finalScore.home,
    away: sim.finalScore.away,
    events: sim.events,
    yellows: {
      home: sim.events.filter((e) => e.type === 'yellow' && e.side === 'home').length,
      away: sim.events.filter((e) => e.type === 'yellow' && e.side === 'away').length,
    },
    reds: {
      home: sim.events.filter((e) => e.type === 'red' && e.side === 'home').length,
      away: sim.events.filter((e) => e.type === 'red' && e.side === 'away').length,
    },
  };
}

export function run() {
  const snapshot = getSnapshot();
  if (!snapshot?.matches.length) {
    window.BT.toast('⚠️ Ei otteluita — hae kohteet ensin');
    return;
  }
  if (isRunning()) return;

  lastSettled = [];
  buttonEl.disabled = true;
  buttonEl.className = 'btn btn-primary btn-block';

  start(
    snapshot.matches,
    (minute, states, newGoals) => {
      lastStates = states.map((s) => ({ ...s, minute }));
      buttonEl.textContent = `🏟️ Pelipäivä käynnissä… ${minuteLabel(minute, states[0].sim)}`;
      render();
      if (newGoals.length) resolveQuickBets(newGoals);
    },
    (sims) => {
      saveSimResults(sims);
      lastSettled = settleBets(sims);
      buttonEl.disabled = false;
      buttonEl.textContent = '🔄 Simuloi uudelleen';
      render();
      window.BT.toast('🏟️ Pelipäivä pelattu — kierrosraportti alla');
    }
  );
}

export function reset() {
  clear();
  lastStates = [];
  lastSettled = [];
  if (buttonEl) {
    buttonEl.disabled = false;
    buttonEl.textContent = '▶️ Käynnistä pelipäivän simulaatio';
    buttonEl.className = 'btn btn-success btn-block';
  }
  render();
}

window.BTT = { render, run, reset, quickBetNextGoal };
