// Tiketti #56: Live-seuranta käynnissä olevista otteluista
//
// Näyttää neljä asiaa:
//   1. Tilanne — maalit ja virallinen peliaika (ESPN)
//   2. Ottelutilastot — hallinta, laukaukset, kulmat, kortit (ESPN)
//   3. Mallin ennuste ennen ottelua vs. miten menee nyt
//   4. Omat avoimet vetosi tähän otteluun ja niiden tila
//
// Data haetaan SELAIMESTA suoraan ESPN:n julkisesta rajapinnasta, ei
// snapshotista — ks. football-espn.js. Siksi tämä päivittyy livenä eikä
// cron-tahdissa, eikä kuluta The Odds APIn kvoottaa.

import { esc, pct } from './snapshot.js';
import { getSnapshot } from './football-cards.js';
import {
  LEAGUE_CODES,
  POLL_MS,
  STAT_ROWS,
  fetchScoreboard,
  fetchSummary,
  normalizeTeam,
} from './football-espn.js';

let container = null;
let timer = null;
let state = { matches: [], stats: {}, events: {}, error: null, updatedAt: null, loading: false };

/** Sarjat joita snapshot sisältää — vain ne haetaan */
function activeLeagues() {
  const snap = getSnapshot();
  const names = new Set((snap?.matches ?? []).map((m) => m.league));
  const codes = [...names].map((n) => LEAGUE_CODES[n]).filter(Boolean);
  // Ilman snapshottia näytetään edes Valioliiga, jottei näkymä ole tyhjä
  return codes.length ? [...new Set(codes)] : ['eng.1'];
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

function betsFor(m, card) {
  const bets = window.BT?.getBets?.() ?? [];
  return bets.filter(
    (b) =>
      (card && b.game_id === card.id) ||
      (normalizeTeam(b.home) === normalizeTeam(m.home) && normalizeTeam(b.away) === normalizeTeam(m.away))
  );
}

function leader(m) {
  if (m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return 'home';
  if (m.awayScore > m.homeScore) return 'away';
  return 'draw';
}

export async function refresh() {
  if (state.loading) return;
  state.loading = true;
  render();

  try {
    const all = [];
    for (const code of activeLeagues()) {
      try {
        for (const ev of await fetchScoreboard(code)) all.push({ ...ev, code });
      } catch (err) {
        // Yhden sarjan pettäminen ei saa estää toisen näyttämistä
        console.warn('[Live] sarja', code, err.message);
      }
    }

    // Tilastot vain käynnissä oleville ja juuri päättyneille — ei turhia hakuja
    const stats = {};
    const events = {};
    for (const m of all.filter((x) => x.inPlay || x.completed)) {
      try {
        const s = await fetchSummary(m.code, m.id);
        if (s.stats) stats[m.id] = s.stats;
        if (s.events && s.events.length) events[m.id] = s.events;
      } catch {
        /* tilastot ovat lisätieto — tilanne näytetään silti */
      }
    }

    state = { matches: all, stats, events, error: null, updatedAt: new Date(), loading: false };
  } catch (err) {
    state = { ...state, error: err.message, loading: false };
  }

  render();
  schedule();
}

/** Kysele uudelleen vain jos jokin ottelu on käynnissä ja välilehti on näkyvissä */
function schedule() {
  clearTimeout(timer);
  const live = state.matches.some((m) => m.inPlay);
  const visible = document.getElementById('tracker')?.classList.contains('active');
  if (live && visible && !document.hidden) timer = setTimeout(refresh, POLL_MS);
}

export function stop() {
  clearTimeout(timer);
  timer = null;
}

// ─── Renderöinti ──────────────────────────────────────────────────────────

/** Vertailupalkki kahden luvun välillä */
function statBar(label, home, away, suffix) {
  if (home === undefined && away === undefined) return '';
  const h = Number(home) || 0;
  const a = Number(away) || 0;
  const total = h + a;
  const hp = total > 0 ? (h / total) * 100 : 50;
  const unit = suffix || '';
  return `<div style="margin:4px 0">
    <div style="display:flex;justify-content:space-between;font-size:.64rem">
      <b>${home === undefined ? '—' : home}${unit}</b>
      <span style="color:var(--c-text-muted)">${esc(label)}</span>
      <b>${away === undefined ? '—' : away}${unit}</b>
    </div>
    <div style="display:flex;height:4px;border-radius:2px;overflow:hidden;background:oklch(1 1 0/0.08);margin-top:2px">
      <div style="width:${hp}%;background:var(--c-accent)"></div>
      <div style="width:${100 - hp}%;background:oklch(1 1 0/0.25)"></div>
    </div>
  </div>`;
}

function statsBlock(m) {
  const s = state.stats[m.id];
  if (!s) return '';
  const rows = STAT_ROWS.map((r) => statBar(r.label, s.home[r.key], s.away[r.key], r.suffix)).join('');
  if (!rows.trim()) return '';
  return `<div style="margin-top:7px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.12)">
    <div style="font-size:.64rem;font-weight:700;margin-bottom:3px">📊 Ottelutilastot</div>
    ${rows}
  </div>`;
}

function eventsBlock(m) {
  const evs = state.events[m.id];
  if (!evs || !evs.length) return '';
  const items = evs
    .slice(-6)
    .map(
      (e) =>
        `<div style="font-size:.62rem;color:var(--c-text-muted);padding:1px 0">
          <b style="color:var(--c-text)">${esc(e.minute)}</b> ${/goal/i.test(e.type) ? '⚽' : '🟨'} ${esc(e.text)}
        </div>`
    )
    .join('');
  return `<div style="margin-top:6px;padding-top:5px;border-top:1px dashed oklch(1 1 0/0.12)">${items}</div>`;
}

const SIDE_NAME = { home: '1', draw: 'X', away: '2' };

function betsBlock(m, card) {
  const bets = betsFor(m, card);
  if (!bets.length) return '';
  const lead = leader(m);
  const rows = bets
    .map((b) => {
      const winning = lead !== null && b.side === lead;
      const status = m.completed
        ? winning
          ? `<b style="color:var(--c-success)">✅ +${(b.stake * (b.odds - 1)).toFixed(2)} €</b>`
          : '<b style="color:var(--c-danger)">❌ hävisi</b>'
        : lead === null
          ? '<span style="color:var(--c-text-muted)">—</span>'
          : winning
            ? '<span style="color:var(--c-success)">johdossa</span>'
            : '<span style="color:var(--c-danger)">tappiolla</span>';
      return `<div class="row" style="font-size:.65rem;padding:2px 0">
        <span>🎫 ${SIDE_NAME[b.side] || '?'} ${b.stake.toFixed(2)} € @ ${b.odds.toFixed(2)}</span>
        <span>${status}</span>
      </div>`;
    })
    .join('');
  return `<div style="margin-top:6px;padding-top:5px;border-top:1px dashed oklch(1 1 0/0.12)">
    <div style="font-size:.64rem;font-weight:700;margin-bottom:2px">Omat vetosi</div>${rows}
  </div>`;
}

function matchCard(m) {
  const card = snapshotCardFor(m);
  const lead = leader(m);

  const clock = m.inPlay
    ? `<span class="badge badge-green">${esc(m.clock || m.detail)}</span>`
    : m.completed
      ? '<span class="badge badge-muted">päättynyt</span>'
      : '<span class="badge badge-muted">alkamassa</span>';

  const score =
    m.homeScore === null || m.awayScore === null
      ? '<span style="color:var(--c-text-muted)">– : –</span>'
      : `<span style="font-size:1.4rem;font-weight:700;font-variant-numeric:tabular-nums">${m.homeScore} – ${m.awayScore}</span>`;

  const model = card
    ? `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:4px">
        Mallin ennuste ennen ottelua: 1 <b>${pct(card.model.probs.home, 0)}</b> ·
        X <b>${pct(card.model.probs.draw, 0)}</b> · 2 <b>${pct(card.model.probs.away, 0)}</b>
        ${lead ? ` · tilanne suosii <b style="color:var(--c-text)">${lead === 'draw' ? 'tasapeliä' : esc(lead === 'home' ? m.home : m.away)}</b>` : ''}
      </div>`
    : '';

  return `<div class="card">
    <div class="row">
      <strong style="font-size:.78rem">${esc(m.home)} – ${esc(m.away)}</strong>
      ${clock}
    </div>
    <div style="text-align:center;padding:5px 0">${score}</div>
    ${model}
    ${statsBlock(m)}
    ${eventsBlock(m)}
    ${betsBlock(m, card)}
  </div>`;
}

export function render(containerId = 'live-content') {
  container = document.getElementById(containerId) || container;
  if (!container) return;

  const live = state.matches.filter((m) => m.inPlay);
  const done = state.matches.filter((m) => m.completed);
  const shown = [...live, ...done];

  const header = `<div class="card">
    <div class="row">
      <strong style="font-size:.78rem">📡 Live-tilanne</strong>
      <span style="display:flex;gap:5px;align-items:center">
        ${live.length ? '<span class="badge badge-green">käynnissä</span>' : ''}
        <button class="btn" style="font-size:.6rem;padding:3px 9px;min-height:26px;border-radius:12px;background:oklch(1 1 0/0.08);color:var(--c-text)" onclick="window.BTV.refresh()">${state.loading ? '…' : '🔄 Päivitä'}</button>
      </span>
    </div>
    <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:4px">
      ${state.updatedAt ? 'Päivitetty ' + esc(state.updatedAt.toLocaleTimeString('fi-FI')) : 'Ei haettu'}
      ${live.length ? ' · päivittyy ' + POLL_MS / 1000 + ' s välein' : ''}
      · lähde ESPN
    </div>
    ${state.error ? `<div style="font-size:.62rem;color:var(--c-danger);margin-top:4px">⚠️ ${esc(state.error)}</div>` : ''}
  </div>`;

  const body = shown.length
    ? shown.map(matchCard).join('')
    : `<div class="empty">${state.updatedAt ? 'Ei käynnissä olevia otteluita juuri nyt.' : 'Paina 🔄 Päivitä hakeaksesi tilanteen.'}</div>`;

  container.innerHTML = header + body;
}

/** Kutsutaan kun Seuranta-välilehti avataan */
export function activate() {
  render();
  if (!state.updatedAt) refresh();
  else schedule();
}

window.BTV = { refresh, render, activate, stop };
