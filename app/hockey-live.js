// Jaakiekon live-seuranta — sama rooli kuin football-live.js:lla mutta
// Liiga.fi lahteena (ei ESPN, joka ei kata SM-liigaa lainkaan — sama syy
// jonka takia fixtures.ts ja tulokset kayttavat Liiga.fi:ta/Torneopalia).
//
// Nayttaa: 1) tilanne — maalit, era, kello  2) ylivoima/alivoima + xG
// 3) maalit pelaajineen ja syottajineen  4) mallin ennuste vs. tilanne
// 5) omat avoimet vetosi tahan otteluun.

import { esc, pct } from './snapshot.js';
import { getSnapshot } from './football-cards.js';
import { POLL_MS, fetchLiigaGames } from './liiga-live.js';

let container = null;
let timer = null;
let state = { matches: [], error: null, updatedAt: null, loading: false };

/** Sama LIIGA_ALIASES-periaate kuin src/analyze/liiga-priors.ts:ssa —
 * kaksoiskappale koska public/app ei tuo src/-TypeScriptia (ei build-vaihetta). */
const LIIGA_ALIASES = {
  ifkhelsinki: 'hifk', hifkhelsinki: 'hifk', helsinkiifk: 'hifk',
  karpatoulu: 'karpat', oulunkarpat: 'karpat',
  tapparatampere: 'tappara', ilvestampere: 'ilves',
  jypjyvaskyla: 'jyp', kalpakuopio: 'kalpa', lukkorauma: 'lukko',
  saipalappeenranta: 'saipa', spotvaasa: 'sport', vaasansport: 'sport',
  assatpori: 'assat', porinassat: 'assat',
  pelicanslahti: 'pelicans', lahtipelicans: 'pelicans',
  kookookouvola: 'kookoo', jukuritmikkeli: 'jukurit',
  hpkhameenlinna: 'hpk', tpsturku: 'tps', turuntps: 'tps',
  kiekkoespoo: 'kiekkoespoo', espookiekko: 'kiekkoespoo', kespoo: 'kiekkoespoo',
  jokerithelsinki: 'jokerit',
};

function normalizeTeam(name) {
  const cleaned = String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');
  return LIIGA_ALIASES[cleaned] ?? cleaned;
}

function snapshotCardFor(m) {
  const snap = getSnapshot();
  if (!snap) return null;
  return (
    snap.matches.find(
      (c) => normalizeTeam(c.home.name) === normalizeTeam(m.home) && normalizeTeam(c.away.name) === normalizeTeam(m.away)
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
    const all = await fetchLiigaGames();
    state = { matches: all, error: null, updatedAt: new Date(), loading: false };
  } catch (err) {
    state = { ...state, error: err.message, loading: false };
  }

  render();
  schedule();
}

/** Kysele uudelleen vain jos jokin ottelu on kaynnissa ja valilehti on nakyvissa */
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

function ppBar(m) {
  const rows = [
    { label: 'Ylivoimaa', home: `${m.pp.home.goals}/${m.pp.home.instances}`, away: `${m.pp.away.goals}/${m.pp.away.instances}` },
    { label: 'Alivoimalla päästetty', home: `${m.sh.home.goals}/${m.sh.home.instances}`, away: `${m.sh.away.goals}/${m.sh.away.instances}` },
  ];
  const xgRow = m.xg.home !== null || m.xg.away !== null
    ? [{ label: 'xG (odotetut maalit)', home: m.xg.home?.toFixed(2) ?? '—', away: m.xg.away?.toFixed(2) ?? '—' }]
    : [];

  const line = (r) => `<div style="display:flex;justify-content:space-between;font-size:.64rem;padding:2px 0">
    <b>${esc(String(r.home))}</b><span style="color:var(--c-text-muted)">${esc(r.label)}</span><b>${esc(String(r.away))}</b>
  </div>`;

  return `<div style="margin-top:7px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.12)">
    <div style="font-size:.64rem;font-weight:700;margin-bottom:3px">📊 Erikoistilanteet</div>
    ${[...rows, ...xgRow].map(line).join('')}
  </div>`;
}

const TYPE_LABEL = { YV: 'YV', TM: 'TM', RL: 'RL', VL: 'VL' };

function goalsBlock(m) {
  if (!m.goals.length) return '';
  const rows = m.goals
    .slice(-6)
    .map((g) => {
      const types = g.types.filter((t) => t).map((t) => `<span style="font-size:.55rem;color:var(--c-text-muted)">${esc(TYPE_LABEL[t] ?? t)}</span>`).join(' ');
      const assists = g.assists.length ? ` (${g.assists.map(esc).join(', ')})` : '';
      return `<div style="font-size:.62rem;color:var(--c-text-muted);padding:1px 0">
        <b style="color:var(--c-text)">${g.minute}'</b> 🥅 ${esc(g.side === 'home' ? m.home : m.away)}: <b>${esc(g.scorer)}</b>${esc(assists)} ${types}
        <span style="float:right;font-variant-numeric:tabular-nums">${g.homeScore}–${g.awayScore}</span>
      </div>`;
    })
    .join('');
  return `<div style="margin-top:6px;padding-top:5px;border-top:1px dashed oklch(1 1 0/0.12)">${rows}</div>`;
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
    ? `<span class="badge badge-green">${esc(m.detail)}${m.clock ? ' ' + esc(m.clock) : ''}</span>`
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
    ${ppBar(m)}
    ${goalsBlock(m)}
    ${betsBlock(m, card)}
  </div>`;
}

export function render(containerId = 'live-content') {
  container = document.getElementById(containerId) || container;
  if (!container) return;

  const live = state.matches.filter((m) => m.inPlay);
  const done = state.matches.filter((m) => m.completed && m.kickoff && new Date(m.kickoff).toDateString() === new Date().toDateString());
  const shown = [...live, ...done];

  const header = `<div class="card">
    <div class="row">
      <strong style="font-size:.78rem">📡 Live-tilanne</strong>
      <span style="display:flex;gap:5px;align-items:center">
        ${live.length ? '<span class="badge badge-green">käynnissä</span>' : ''}
        <button class="btn" style="font-size:.6rem;padding:3px 9px;min-height:26px;border-radius:12px;background:oklch(1 1 0/0.08);color:var(--c-text)" onclick="window.BTHV.refresh()">${state.loading ? '…' : '🔄 Päivitä'}</button>
      </span>
    </div>
    <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:4px">
      ${state.updatedAt ? 'Päivitetty ' + esc(state.updatedAt.toLocaleTimeString('fi-FI')) : 'Ei haettu'}
      ${live.length ? ' · päivittyy ' + POLL_MS / 1000 + ' s välein' : ''}
      · lähde Liiga.fi
    </div>
    ${state.error ? `<div style="font-size:.62rem;color:var(--c-danger);margin-top:4px">⚠️ ${esc(state.error)}</div>` : ''}
  </div>`;

  const body = shown.length
    ? shown.map(matchCard).join('')
    : `<div class="empty">${state.updatedAt ? 'Ei käynnissä olevia otteluita juuri nyt.' : 'Paina 🔄 Päivitä hakeaksesi tilanteen.'}</div>`;

  container.innerHTML = header + body;
}

/** Kutsutaan kun Seuranta-välilehti avataan jääkiekkotilassa */
export function activate() {
  render();
  if (!state.updatedAt) refresh();
  else schedule();
}

window.BTHV = { refresh, render, activate, stop };
