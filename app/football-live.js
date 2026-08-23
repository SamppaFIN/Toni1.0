// Tiketti #55: Live-seuranta käynnissä olevista otteluista
//
// Näyttää kolme asiaa jotka meillä oikeasti on:
//   1. Tilanne — maalit ja arvioitu peliminuutti (The Odds API /scores)
//   2. Mallin ennuste ennen ottelua vs. miten menee nyt
//   3. Omat avoimet vedot tähän otteluun ja niiden tila
//
// EI NÄYTÄ pallonhallintaa, laukauksia, kulmia eikä kortteja. Niitä ei ole
// missään ilmaislähteessämme (ks. src/ingest/live-scores.ts). Puuttuvat kentät
// SANOTAAN käyttäjälle nimeltä sen sijaan että ne jätettäisiin hiljaa pois —
// muuten puuttuva luku näyttää bugilta eikä rajoitteelta.

import { esc, pct, relativeAge } from './snapshot.js';
import { getSnapshot } from './football-cards.js';

let live = null;
let loadError = null;

export async function load(url = 'data/live.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      loadError = `Live-tilannetta ei ole haettu (HTTP ${res.status}).`;
      live = null;
      return null;
    }
    live = await res.json();
    loadError = null;
    return live;
  } catch (err) {
    loadError = `Live-tilanteen lataus epäonnistui: ${err.message}`;
    live = null;
    return null;
  }
}

/** Ottelukortti snapshotista samalle ottelulle — nimillä, koska id:t ovat eri lähteistä */
function cardFor(m) {
  const snap = getSnapshot();
  if (!snap) return null;
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-zà-ÿ]/g, '');
  return (
    snap.matches.find((c) => norm(c.home.name) === norm(m.home) && norm(c.away.name) === norm(m.away)) ?? null
  );
}

/** Avoimet vedot tähän otteluun */
function betsFor(m, card) {
  const bets = window.BT?.getBets?.() ?? [];
  return bets.filter((b) => {
    if (card && b.game_id === card.id) return true;
    return b.home === m.home && b.away === m.away;
  });
}

/** Kumpi puoli johtaa juuri nyt */
function leader(m) {
  if (m.home_score === null || m.away_score === null) return null;
  if (m.home_score > m.away_score) return 'home';
  if (m.away_score > m.home_score) return 'away';
  return 'draw';
}

const SIDE_NAME = { home: '1', draw: 'X', away: '2' };

function betRow(b, m) {
  const lead = leader(m);
  const winning = lead !== null && b.side === lead;
  const state = m.completed
    ? winning
      ? '<span style="color:var(--c-success);font-weight:700">✅ voitti</span>'
      : '<span style="color:var(--c-danger);font-weight:700">❌ hävisi</span>'
    : lead === null
      ? '<span style="color:var(--c-text-muted)">— ei tilannetta</span>'
      : winning
        ? '<span style="color:var(--c-success)">johdossa</span>'
        : '<span style="color:var(--c-danger)">tappiolla</span>';

  return `<div class="row" style="font-size:.66rem;padding:3px 0">
    <span>🎫 ${SIDE_NAME[b.side] ?? '?'} ${b.stake.toFixed(2)} € @ ${b.odds.toFixed(2)}${b.bookmaker ? ` · ${esc(b.bookmaker)}` : ''}</span>
    <span>${state} ${m.completed && winning ? `<b>+${(b.stake * (b.odds - 1)).toFixed(2)} €</b>` : ''}</span>
  </div>`;
}

function matchCard(m) {
  const card = cardFor(m);
  const bets = betsFor(m, card);
  const lead = leader(m);

  const score =
    m.home_score === null || m.away_score === null
      ? '<span style="color:var(--c-text-muted);font-size:1rem">– : –</span>'
      : `<span style="font-size:1.35rem;font-weight:700;font-variant-numeric:tabular-nums">${m.home_score} – ${m.away_score}</span>`;

  const clock = m.completed
    ? '<span class="badge badge-muted">päättynyt</span>'
    : m.minute !== null
      ? `<span class="badge badge-yellow" title="Arvio aloitusajasta — ei virallinen kello">~${m.minute}'</span>`
      : '<span class="badge badge-muted">alkamassa</span>';

  // Mallin ennuste ennen ottelua — tämä on se mitä vasten tilannetta luetaan
  const model = card
    ? `<div style="font-size:.63rem;color:var(--c-text-muted);margin-top:5px">
         Mallin ennuste ennen ottelua: 1 <b>${pct(card.model.probs.home, 0)}</b> ·
         X <b>${pct(card.model.probs.draw, 0)}</b> ·
         2 <b>${pct(card.model.probs.away, 0)}</b>
         ${lead ? `<br>Tilanne suosii: <b style="color:var(--c-text)">${lead === 'home' ? esc(m.home) : lead === 'away' ? esc(m.away) : 'tasapeliä'}</b>` : ''}
       </div>`
    : '<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:5px">Ottelu ei ole nykyisessä snapshotissa — ennustetta ei voi näyttää.</div>';

  const betBlock = bets.length
    ? `<div style="margin-top:6px;padding-top:5px;border-top:1px dashed oklch(1 1 0/0.12)">
         <div style="font-size:.64rem;font-weight:700;margin-bottom:2px">Omat vetosi</div>
         ${bets.map((b) => betRow(b, m)).join('')}
       </div>`
    : '';

  return `<div class="card">
    <div class="row">
      <strong style="font-size:.8rem">${esc(m.home)} – ${esc(m.away)}</strong>
      ${clock}
    </div>
    <div style="text-align:center;padding:6px 0">${score}</div>
    ${model}
    ${betBlock}
  </div>`;
}

export function render(containerId = 'live-content') {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (loadError || !live) {
    el.innerHTML = `<div class="card">
      <div style="font-size:.78rem;font-weight:700;margin-bottom:5px">📡 Live-tilanne</div>
      <div style="font-size:.68rem;color:var(--c-text-muted)">${esc(loadError ?? 'Ei haettu.')}</div>
      <div style="font-size:.64rem;color:var(--c-text-muted);margin-top:6px">
        Tilanne päivittyy komennolla <code style="color:var(--c-accent)">npm run live</code>,
        tai GitHubissa <b>Actions → Live-tilanne → Run workflow</b>.
      </div>
    </div>`;
    return;
  }

  const ongoing = live.matches.filter((m) => !m.completed);
  const done = live.matches.filter((m) => m.completed);

  const header = `<div class="card">
    <div class="row">
      <strong style="font-size:.78rem">📡 Live-tilanne</strong>
      <span class="badge badge-muted">${esc(relativeAge(live.generated_at))}</span>
    </div>
    <div style="font-size:.63rem;color:var(--c-text-muted);margin-top:4px">
      ${ongoing.length} käynnissä · ${done.length} päättynyt
    </div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:6px;line-height:1.5">
      ⚠️ Ei saatavilla: <b>${(live.unavailable ?? []).map(esc).join(', ')}</b>.
      Yksikään ilmaislähteistämme ei tarjoa niitä, eikä niitä keksitä tähän.
      Peliminuutti on arvio aloitusajasta, ei virallinen kello.
    </div>
  </div>`;

  const body = live.matches.length
    ? live.matches.map(matchCard).join('')
    : '<div class="empty">Ei käynnissä olevia otteluita.</div>';

  el.innerHTML = header + body;
}

window.BTV = { load, render };
