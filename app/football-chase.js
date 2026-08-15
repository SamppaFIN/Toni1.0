// Tiketti #35: Tappioketju (Martingale-tyylinen jahtausmekaniikka)
//
// Pyyntö oli täsmällinen: jahdataan hävittyä vetoa uudella kohteella ja uudella
// panoksella, tuplaamalla joko PANOS tai KERROIN, kunnes lappu voittaa tai
// käyttäjä luovuttaa. Stop-loss pysäyttää ketjun kun panos ylittäisi 4× alun.
//
// TÄRKEÄ RAJAUS, kirjattu näkyviin käyttäjälle: tämä on tunnetusti riskialtis
// vedonlyöntistrategia (Martingale). Demo-ympäristössä sen näyttäminen
// läpinäkyvästi — mukaan lukien se kuinka nopeasti panos kasvaa ja kuinka
// stop-loss iskee — on opetuksellisesti arvokkaampaa kuin sen piilottaminen.
// Kassa on harjoitusrahaa (sama bt_bankroll kuin muuallakin sovelluksessa).
//
// ARKKITEHTUURI: ketjun jokainen veto on TAVALLINEN veto joka kulkee
// window.BT.addBet() / settleFootballBet() -kautta — sama historia, sama
// kassa, sama ROI-seuranta kuin muillakin jalkapallovedoilla. Ketju on vain
// kevyt metadata (bt_chase_chains) joka linkittää vedot toisiinsa. Ei
// kahta totuutta samasta rahasta.

import { esc, num } from './snapshot.js';
import { getSnapshot } from './football-cards.js';

const CHAINS_KEY = 'bt_chase_chains';

/** Stop-loss: panos ei saa ylittää tätä kerrointa alkuperäisestä panoksesta */
export const STOP_LOSS_MULTIPLIER = 4;

// ─── Tila ─────────────────────────────────────────────────────────────────

export function loadChains() {
  try {
    return JSON.parse(localStorage.getItem(CHAINS_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveChains(chains) {
  localStorage.setItem(CHAINS_KEY, JSON.stringify(chains));
}

export function getActiveChain() {
  return loadChains().find((c) => c.status === 'active') ?? null;
}

function findBet(betId) {
  return (window.BT.getBets() || []).find((b) => b.id === betId) ?? null;
}

function findHistory(betId) {
  return (JSON.parse(localStorage.getItem('bt_history') || '[]')).find((b) => b.id === betId) ?? null;
}

/** Viimeisin askel: pending jos vielä auki bt_bets:issä, muuten ratkaistu bt_history:sta */
function lastStepState(chain) {
  const step = chain.steps[chain.steps.length - 1];
  const open = findBet(step.betId);
  if (open) return { step, pending: true, won: null };
  const resolved = findHistory(step.betId);
  return { step, pending: false, won: resolved ? resolved.won : null };
}

// ─── Panos-/kerroinsuositus ────────────────────────────────────────────────

/**
 * Puhdas laskenta erillään tilanhausta, jotta se on testattavissa ilman
 * selaimen window/localStorage-globaaleja (ks. src/__tests__/football-chase.test.ts).
 *
 * mode 'stake': panos tuplataan joka askel, kerroin on vapaa valinta.
 *   Stop-loss laukeaa kun SEURAAVA panos ylittäisi 4× alkuperäisen —
 *   4× itsessään on vielä sallittu, se on viimeinen yritys.
 *
 * mode 'odds': panos pysyy alkuperäisenä joka askel, vaadittu MINIMIKERROIN
 *   tuplataan. Panos ei kasva, joten stop-loss ei koske tätä tilaa — riski
 *   on toisenlainen (yhä epätodennäköisempi kohde), ei kasvava panostus.
 */
export function computeRequirement(mode, originalStake, lastStake, lastOdds, stopLoss = STOP_LOSS_MULTIPLIER) {
  if (mode === 'odds') {
    return { stake: originalStake, minOdds: lastOdds * 2, blocked: false, multiplier: 1 };
  }

  const nextStake = lastStake * 2;
  const multiplier = nextStake / originalStake;
  return {
    stake: nextStake,
    minOdds: null,
    blocked: multiplier > stopLoss + 1e-9,
    multiplier,
  };
}

/** Mitä seuraava askel vaatisi jos ketjua jatketaan — lukee viimeisimmän askeleen tilasta. */
export function nextStepRequirement(chain) {
  const { step } = lastStepState(chain);
  return computeRequirement(chain.mode, chain.originalStake, step.stake, step.odds, chain.stopLossMultiplier);
}

// ─── Ketjun elinkaari ──────────────────────────────────────────────────────

function pushStep(chain, { matchId, home, away, side, stake, odds, bookmaker }) {
  const betId = Date.now() + Math.floor(Math.random() * 1000);
  window.BT.addBet({
    id: betId,
    game_id: matchId,
    side,
    odds,
    stake,
    bookmaker: bookmaker ?? null,
    practice: true,
    football: true,
    home,
    away,
    chase_id: chain.id,
    chase_step: chain.steps.length + 1,
  });
  chain.steps.push({
    step: chain.steps.length + 1,
    betId,
    matchId,
    home,
    away,
    side,
    stake,
    odds,
    bookmaker: bookmaker ?? null,
    placedAt: new Date().toISOString(),
  });
}

/** Aloita uusi ketju. Vain yksi ketju voi olla kerrallaan aktiivinen. */
export function startChain({ matchId, home, away, side, stake, odds, bookmaker, mode }) {
  if (getActiveChain()) throw new Error('Ketju on jo käynnissä');
  if (!(stake > 0)) throw new Error('Panoksen pitää olla positiivinen');
  if (!(odds > 1)) throw new Error('Kertoimen pitää olla yli 1');

  const chain = {
    id: `chase-${Date.now()}`,
    createdAt: new Date().toISOString(),
    mode, // 'stake' | 'odds'
    stopLossMultiplier: STOP_LOSS_MULTIPLIER,
    originalStake: stake,
    originalOdds: odds,
    status: 'active',
    steps: [],
  };
  pushStep(chain, { matchId, home, away, side, stake, odds, bookmaker });

  const chains = loadChains();
  chains.push(chain);
  saveChains(chains);
  return chain;
}

/** Ratkaise ketjun viimeisin (avoin) askel manuaalisesti — sama malli kuin harjoitusvedoissa. */
export function resolveStep(chainId, won) {
  const chains = loadChains();
  const chain = chains.find((c) => c.id === chainId);
  if (!chain || chain.status !== 'active') return;

  const { step } = lastStepState(chain);
  const label = won
    ? `✅ Tappioketjun askel ${step.step} — voitto`
    : `❌ Tappioketjun askel ${step.step} — häviö`;
  window.BT.settleFootballBet(step.betId, won, label);

  if (won) {
    chain.status = 'won';
    chain.resolvedAt = new Date().toISOString();
  }
  // Hävitty askel jää chain.status='active' tilaan — käyttäjä valitsee
  // seuraavaksi jatkaako (continueChain) vai luovuttaako (abandonChain).

  saveChains(chains);
  return chain;
}

/** Jatka hävittyä ketjua uudella kohteella. Kieltäytyy jos stop-loss on jo saavutettu. */
export function continueChain(chainId, { matchId, home, away, side, stake, odds, bookmaker }) {
  const chains = loadChains();
  const chain = chains.find((c) => c.id === chainId);
  if (!chain || chain.status !== 'active') throw new Error('Ketju ei ole aktiivinen');

  const req = nextStepRequirement(chain);
  if (req.blocked) {
    throw new Error(`Stop-loss saavutettu — panos ylittäisi ${STOP_LOSS_MULTIPLIER}× alkuperäisen`);
  }
  if (chain.mode === 'stake' && Math.abs(stake - req.stake) > 0.005) {
    throw new Error(`Panoksen pitää olla tarkalleen ${req.stake.toFixed(2)} € (tuplaus)`);
  }
  if (chain.mode === 'odds' && odds < req.minOdds - 1e-9) {
    throw new Error(`Kertoimen pitää olla vähintään ${req.minOdds.toFixed(2)} (tuplaus)`);
  }

  pushStep(chain, { matchId, home, away, side, stake, odds, bookmaker });
  saveChains(chains);
  return chain;
}

/** Luovuta — ketju sulkeutuu tappiona, ei enää askelia. */
export function abandonChain(chainId) {
  const chains = loadChains();
  const chain = chains.find((c) => c.id === chainId);
  if (!chain) return;
  chain.status = 'abandoned';
  chain.resolvedAt = new Date().toISOString();
  saveChains(chains);
  return chain;
}

// ─── Yhteenveto ────────────────────────────────────────────────────────────

/** Kaikki rahat jotka ketjuun on laitettu tähän mennessä */
export function totalStaked(chain) {
  return chain.steps.reduce((sum, s) => sum + s.stake, 0);
}

/** Jos ketju voitti, mitä viimeinen askel maksoi takaisin */
export function totalReturned(chain) {
  if (chain.status !== 'won') return 0;
  const last = chain.steps[chain.steps.length - 1];
  return last.stake * last.odds;
}

export function netResult(chain) {
  return totalReturned(chain) - totalStaked(chain);
}

// ─── Renderöinti ───────────────────────────────────────────────────────────

const SIDE_LABEL = { home: '1', draw: 'X', away: '2' };

function sideName(step) {
  return step.side === 'home' ? step.home : step.side === 'away' ? step.away : 'Tasapeli';
}

/**
 * Askeleen tila. Ketjuun tulee uusi askel VAIN edellisen hävittyä (ks.
 * continueChain), joten jokainen muu paitsi viimeinen askel on aina 'lost'.
 * Viimeinen on 'pending' (avoin veto), 'won' (ketju voitti) tai 'lost'
 * (hävisi, mutta käyttäjä ei ole vielä valinnut jatkaako vai luovuttaako).
 */
function stepState(step, index, chain) {
  if (index < chain.steps.length - 1) return 'lost';
  if (chain.status === 'won') return 'won';
  if (chain.status === 'abandoned') return 'lost';
  return findBet(step.betId) ? 'pending' : 'lost';
}

function stakeChip(step, index, chain) {
  const state = stepState(step, index, chain);
  const bg = { won: 'var(--c-success)', lost: 'var(--c-danger)', pending: 'var(--c-accent)' }[state];
  const fg = state === 'pending' || state === 'won' ? '#000' : '#fff';
  const icon = { won: '✓', lost: '✕', pending: '…' }[state];

  return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;min-width:64px">
    <div style="width:52px;height:52px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.85rem;box-shadow:var(--shadow-elevated)">${step.stake.toFixed(0)}€</div>
    <div style="font-size:.58rem;color:var(--c-text-muted)">${index + 1}. ${icon}</div>
  </div>`;
}

function stopLossBar(chain, req) {
  if (chain.mode !== 'stake') return '';
  const pct = Math.min(100, (req.multiplier / STOP_LOSS_MULTIPLIER) * 100);
  const danger = req.multiplier >= STOP_LOSS_MULTIPLIER - 0.001;
  return `<div style="margin-top:10px">
    <div class="row" style="font-size:.62rem;color:var(--c-text-muted)">
      <span>Etäisyys stop-lossiin</span><span>${req.multiplier.toFixed(1)}× / ${STOP_LOSS_MULTIPLIER}×</span>
    </div>
    <div class="progress-bar" style="margin-top:3px">
      <span class="progress-fill" style="width:${pct}%;background:${danger ? 'var(--c-danger)' : 'var(--c-orange)'}"></span>
    </div>
  </div>`;
}

function startForm(mode) {
  const snapshot = getSnapshot();
  const matches = snapshot?.matches ?? [];
  if (!matches.length) return `<div class="empty">Ei otteluita — hae kohteet Kierros-välilehdeltä ensin.</div>`;

  const options = matches
    .map((m) => `<option value="${esc(m.id)}">${esc(m.home.name)} – ${esc(m.away.name)}</option>`)
    .join('');

  return `<div class="card" style="border:1.5px dashed var(--c-accent)">
    <h3 style="font-size:.85rem;margin-bottom:8px">🔥 Aloita tappioketju</h3>
    <div class="input-group"><label>Tapa</label>
      <div style="display:flex;gap:6px">
        <button class="btn ${mode === 'stake' ? 'btn-primary' : ''}" style="flex:1;font-size:.68rem;${mode !== 'stake' ? 'background:oklch(1 1 0/0.08);color:var(--c-text)' : ''}" onclick="window.BTC.setStartMode('stake')">📈 Tuplaa panos</button>
        <button class="btn ${mode === 'odds' ? 'btn-primary' : ''}" style="flex:1;font-size:.68rem;${mode !== 'odds' ? 'background:oklch(1 1 0/0.08);color:var(--c-text)' : ''}" onclick="window.BTC.setStartMode('odds')">🎯 Tuplaa kerroin</button>
      </div>
      <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:6px;line-height:1.5">
        ${mode === 'stake'
          ? `Panos kaksinkertaistuu joka häviön jälkeen (esim. 10 € → 20 € → 40 €). Stop-loss pysäyttää ketjun kun panos ylittäisi ${STOP_LOSS_MULTIPLIER}× alun.`
          : `Panos pysyy samana. Kertoimen pitää tuplaantua joka häviön jälkeen — jahdataan yhä epätodennäköisempää kohdetta, ei kasvavaa panosta.`}
      </div>
    </div>
    <div class="input-group"><label>Ottelu</label><select id="chase-match" style="width:100%;min-height:44px;border-radius:8px;border:1.5px solid oklch(1 1 0/0.12);background:var(--c-bg);color:var(--c-text);padding:8px">${options}</select></div>
    <div class="input-group"><label>Kohde</label>
      <div style="display:flex;gap:6px">
        <button class="btn" style="flex:1;font-size:.75rem;background:oklch(1 1 0/0.08);color:var(--c-text)" data-chase-side="home" onclick="window.BTC.pickStartSide(this)">1</button>
        <button class="btn" style="flex:1;font-size:.75rem;background:oklch(1 1 0/0.08);color:var(--c-text)" data-chase-side="draw" onclick="window.BTC.pickStartSide(this)">X</button>
        <button class="btn" style="flex:1;font-size:.75rem;background:oklch(1 1 0/0.08);color:var(--c-text)" data-chase-side="away" onclick="window.BTC.pickStartSide(this)">2</button>
      </div>
    </div>
    <div class="input-group"><label>Panos (€)</label><input type="number" id="chase-stake" value="10" min="1" step="0.5"></div>
    <button class="btn btn-danger btn-block" style="margin-top:6px" onclick="window.BTC.confirmStart()">🔥 Aloita ketju</button>
  </div>`;
}

let startMode = 'stake';
let startSide = 'home';

function activeChainCard(chain) {
  const { pending, won } = lastStepState(chain);
  const staked = totalStaked(chain);
  const req = !pending && won === false ? nextStepRequirement(chain) : null;

  const chips = chain.steps.map((s, i) => stakeChip(s, i, chain)).join('<div style="align-self:center;color:var(--c-text-muted);font-size:.7rem">→</div>');

  let action = '';
  if (pending) {
    action = `<div style="display:flex;gap:6px;margin-top:12px">
      <button class="btn btn-success" style="flex:1" onclick="window.BTC.resolve('${chain.id}',true)">✅ Voitto</button>
      <button class="btn btn-danger" style="flex:1" onclick="window.BTC.resolve('${chain.id}',false)">❌ Häviö</button>
    </div>`;
  } else if (won === false) {
    if (req.blocked) {
      action = `<div style="margin-top:12px;padding:10px;border-radius:8px;background:oklch(0.52 0.22 25 / 0.15);border:1px solid var(--c-danger)">
        <div style="font-weight:700;font-size:.82rem;color:var(--c-danger)">🛑 Stop-loss saavutettu</div>
        <div style="font-size:.68rem;color:var(--c-text-muted);margin-top:3px">Seuraava panos ylittäisi ${STOP_LOSS_MULTIPLIER}× alkuperäisen (${chain.originalStake.toFixed(2)} €). Ketju on pakko lopettaa.</div>
        <button class="btn btn-danger btn-block" style="margin-top:8px" onclick="window.BTC.abandon('${chain.id}')">🏳️ Luovuta — kirjaa tappio</button>
      </div>`;
    } else {
      action = `${continueForm(chain, req)}
        <button class="btn" style="margin-top:6px;background:oklch(1 1 0/0.08);color:var(--c-text)" onclick="window.BTC.abandon('${chain.id}')">🏳️ Luovuta tässä</button>`;
    }
  }

  return `<div class="card" style="border:1.5px solid var(--c-danger)">
    <div class="row"><strong style="font-size:.85rem">🔥 Aktiivinen tappioketju</strong><span class="badge badge-red">${chain.mode === 'stake' ? 'panos ×2' : 'kerroin ×2'}</span></div>
    <div style="display:flex;gap:6px;align-items:center;margin-top:12px;overflow-x:auto;padding-bottom:2px">${chips}</div>
    <div class="row" style="margin-top:10px;font-size:.72rem">
      <span>Sijoitettu yhteensä</span><b>${staked.toFixed(2)} €</b>
    </div>
    ${req ? stopLossBar(chain, req) : ''}
    ${action}
  </div>`;
}

function continueForm(chain, req) {
  const snapshot = getSnapshot();
  const matches = snapshot?.matches ?? [];
  const options = matches.map((m) => `<option value="${esc(m.id)}">${esc(m.home.name)} – ${esc(m.away.name)}</option>`).join('');

  return `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed oklch(1 1 0/0.12)">
    <div style="font-size:.72rem;font-weight:700;margin-bottom:6px">🔥 Jatka tappiolla</div>
    <div style="font-size:.65rem;color:var(--c-text-muted);margin-bottom:8px">
      ${chain.mode === 'stake'
        ? `Vaadittu panos: <b style="color:var(--c-text)">${req.stake.toFixed(2)} €</b> (${req.multiplier.toFixed(1)}× alusta)`
        : `Vaadittu vähimmäiskerroin: <b style="color:var(--c-text)">${req.minOdds.toFixed(2)}</b>`}
    </div>
    <select id="chase-cont-match" style="width:100%;min-height:40px;border-radius:8px;border:1.5px solid oklch(1 1 0/0.12);background:var(--c-bg);color:var(--c-text);padding:6px;margin-bottom:6px">${options}</select>
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <button class="btn" style="flex:1;font-size:.7rem;background:oklch(1 1 0/0.08);color:var(--c-text)" data-chase-cont-side="home" onclick="window.BTC.pickContSide(this)">1</button>
      <button class="btn" style="flex:1;font-size:.7rem;background:oklch(1 1 0/0.08);color:var(--c-text)" data-chase-cont-side="draw" onclick="window.BTC.pickContSide(this)">X</button>
      <button class="btn" style="flex:1;font-size:.7rem;background:oklch(1 1 0/0.08);color:var(--c-text)" data-chase-cont-side="away" onclick="window.BTC.pickContSide(this)">2</button>
    </div>
    <div style="display:flex;gap:6px">
      <input type="number" id="chase-cont-odds" placeholder="Kerroin" step="0.01" min="1.01" style="flex:1;min-height:40px;border-radius:8px;border:1.5px solid oklch(1 1 0/0.12);background:var(--c-bg);color:var(--c-text);padding:6px;text-align:center">
      <input type="number" id="chase-cont-stake" value="${chain.mode === 'stake' ? req.stake.toFixed(2) : chain.originalStake.toFixed(2)}" ${chain.mode === 'stake' ? 'readonly' : ''} step="0.5" style="flex:1;min-height:40px;border-radius:8px;border:1.5px solid oklch(1 1 0/0.12);background:var(--c-bg);color:var(--c-text);padding:6px;text-align:center">
    </div>
    <button class="btn btn-danger btn-block" style="margin-top:8px" onclick="window.BTC.confirmContinue('${chain.id}')">🔥 Aseta jatkoveto</button>
  </div>`;
}

function pastChainRow(chain) {
  const staked = totalStaked(chain);
  const net = chain.status === 'won' ? netResult(chain) : -staked;
  const badge = chain.status === 'won' ? 'badge-green' : 'badge-red';
  const label = chain.status === 'won' ? '✅ Voitettu' : '🏳️ Luovutettu';
  return `<div class="card">
    <div class="row"><span style="font-size:.75rem">${chain.steps.length} askelta · ${chain.mode === 'stake' ? 'panos ×2' : 'kerroin ×2'}</span><span class="badge ${badge}">${label}</span></div>
    <div class="row" style="font-size:.72rem;margin-top:4px;color:var(--c-text-muted)">
      <span>Sijoitettu ${staked.toFixed(2)} €</span>
      <span style="font-weight:700;color:${net >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${net >= 0 ? '+' : ''}${net.toFixed(2)} €</span>
    </div>
  </div>`;
}

export function render(containerId = 'chase-content') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const chains = loadChains();
  const active = chains.find((c) => c.status === 'active');
  const past = chains.filter((c) => c.status !== 'active').slice().reverse();

  const intro = `<div class="card" style="background:oklch(0.52 0.22 25 / 0.08);border-color:var(--c-danger)">
    <div style="font-size:.72rem;line-height:1.6">
      <b>Mikä tämä on:</b> Martingale-tyylinen tappion jahtaus — hävitty veto jatketaan heti uudella kohteella,
      tuplaten joko panoksen tai kerroin­vaatimuksen. Yksi voitto kuittaa koko ketjun tappiot ja tuo voittoa.
      <br><br>
      <b>Miksi tämä näytetään läpinäkyvästi:</b> tämä on tunnetusti riskialtis strategia — panos kasvaa
      eksponentiaalisesti, ja putki päättyy aina joko voittoon tai stop-lossiin. Harjoitusrahaa, ei oikeaa.
    </div>
  </div>`;

  el.innerHTML =
    intro +
    (active ? activeChainCard(active) : startForm(startMode)) +
    (past.length ? `<div style="font-size:.7rem;font-weight:700;margin:14px 0 6px;color:var(--c-text-muted)">Aiemmat ketjut</div>${past.map(pastChainRow).join('')}` : '');
}

// ─── Julkinen rajapinta (onclick-käsittelijät) ────────────────────────────
// Vartioitu typeof-tarkistuksella, jotta puhtaat laskentafunktiot (yllä) ovat
// tuotavissa ja testattavissa Node/vitestissä ilman window-globaalia.

const publicApi = {
  render,
  setStartMode(mode) {
    startMode = mode;
    render();
  },
  pickStartSide(btn) {
    startSide = btn.dataset.chaseSide;
    btn.parentElement.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('btn-primary', b === btn);
      b.style.background = b === btn ? '' : 'oklch(1 1 0/0.08)';
      b.style.color = b === btn ? '' : 'var(--c-text)';
    });
  },
  confirmStart() {
    const snapshot = getSnapshot();
    const matchId = document.getElementById('chase-match')?.value;
    const stake = parseFloat(document.getElementById('chase-stake')?.value || '0');
    const match = snapshot?.matches.find((m) => m.id === matchId);
    if (!match) return window.BT.toast('⚠️ Ottelua ei löytynyt');

    const edge = match.analysis.edges.find((e) => e.side === startSide);
    const odds = edge?.odds;
    if (!odds) return window.BT.toast('⚠️ Kerrointa ei löytynyt tälle kohteelle');
    if (!(stake > 0) || stake > window.BT.getBankroll()) return window.BT.toast('⚠️ Virheellinen panos');

    try {
      startChain({
        matchId,
        home: match.home.name,
        away: match.away.name,
        side: startSide,
        stake,
        odds,
        bookmaker: edge.book,
        mode: startMode,
      });
      window.BT.toast(`🔥 Ketju aloitettu: ${stake.toFixed(2)} € @ ${odds.toFixed(2)}`);
      render();
    } catch (err) {
      window.BT.toast(`⚠️ ${err.message}`);
    }
  },
  resolve(chainId, won) {
    resolveStep(chainId, won);
    render();
    if (won) window.BT.toast('🎉 Ketju voitti — tappiot kuitattu!');
  },
  pickContSide(btn) {
    btn.parentElement.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('btn-primary', b === btn);
      b.style.background = b === btn ? '' : 'oklch(1 1 0/0.08)';
      b.style.color = b === btn ? '' : 'var(--c-text)';
    });
    btn.dataset.selected = 'true';
    btn.parentElement.querySelectorAll('button').forEach((b) => {
      if (b !== btn) delete b.dataset.selected;
    });
  },
  confirmContinue(chainId) {
    const snapshot = getSnapshot();
    const matchId = document.getElementById('chase-cont-match')?.value;
    const oddsInput = parseFloat(document.getElementById('chase-cont-odds')?.value || '0');
    const stakeInput = parseFloat(document.getElementById('chase-cont-stake')?.value || '0');
    const sideBtn = document.querySelector('[data-chase-cont-side][data-selected="true"]');
    const side = sideBtn?.dataset.chaseContSide;
    const match = snapshot?.matches.find((m) => m.id === matchId);

    if (!match || !side) return window.BT.toast('⚠️ Valitse ottelu ja kohde');
    if (!(oddsInput > 1)) return window.BT.toast('⚠️ Anna kerroin');
    if (!(stakeInput > 0) || stakeInput > window.BT.getBankroll()) return window.BT.toast('⚠️ Virheellinen panos');

    try {
      continueChain(chainId, {
        matchId,
        home: match.home.name,
        away: match.away.name,
        side,
        stake: stakeInput,
        odds: oddsInput,
        bookmaker: null,
      });
      window.BT.toast(`🔥 Jatkoveto asetettu: ${stakeInput.toFixed(2)} € @ ${oddsInput.toFixed(2)}`);
      render();
    } catch (err) {
      window.BT.toast(`⚠️ ${err.message}`);
    }
  },
  abandon(chainId) {
    abandonChain(chainId);
    window.BT.toast('🏳️ Ketju luovutettu');
    render();
  },
};

if (typeof window !== 'undefined') window.BTC = publicApi;
