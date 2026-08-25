// Tiketti #80: Menneiden kierrosten selaus ja arviointi
//
// Historia-välilehdellä oli tähän asti vain omat vetosi. Tämä lisää sen
// rinnalle sen mitä MALLI teki: kierros kerrallaan, ottelu kerrallaan, ja
// jokaisen liputetun kohteen kohdalla arvio siitä meninkö pieleen vai
// kävikö huono tuuri.
//
// Data tulee `public/data/reviews.json`:ista, jonka cron rakentaa
// kerroinhistoriasta ja ESPN:n maaliaikajanasta.
//
// SE MITÄ TÄMÄ NÄYTTÄÄ, JA SE MITÄ SE EI VÄITÄ:
//
// Verdikti "EI KOSKAAN voitolla" tarkoittaa että kohde ei ollut voimassa
// oleva lopputulos yhtenäkään minuuttina. Se on havainto, ei tuomio siitä
// että voitto olisi ollut mahdoton — jalkapallossa 0–3 on käännetty. Mutta
// se erottaa kaksi asiaa jotka osumatarkkuudessa näyttävät samalta:
//
//   "johti 83 min ja kaatui"     → analyysi oli järkevä, tulos oli varianssia
//   "ei ollut voitolla kertaakaan" → analyysi oli väärässä ottelusta
//
// Ensimmäinen ei vaadi toimenpiteitä. Toinen on merkki siitä että mallissa
// on jotain vialla.

import { esc, pct } from './snapshot.js';

let state = { file: null, loading: false, error: null, openRound: null };

const VERDICT = {
  osui: { label: 'osui', color: 'var(--c-success)', icon: '✓' },
  kaatui_lopussa: {
    label: 'johti loppuun asti, kaatui',
    color: 'var(--c-warning)',
    icon: '≈',
    note: 'Analyysi osui ottelun kulkuun — lopputulos oli varianssia.',
  },
  oli_voitolla: {
    label: 'oli voitolla',
    color: 'var(--c-warning)',
    icon: '≈',
    note: 'Kohde oli välillä voimassa oleva tulos.',
  },
  ei_koskaan_voitolla: {
    label: 'EI kertaakaan voitolla',
    color: 'var(--c-danger)',
    icon: '✗',
    note: 'Kohde ei ollut voimassa oleva tulos yhtenäkään minuuttina — tämä on analyysivirhe, ei epäonnea.',
  },
  ei_tietoa: {
    label: 'ei aikajanaa',
    color: 'var(--c-text-muted)',
    icon: '?',
    note: 'Maaliaikajanaa ei saatu, joten kohteen kulkua ei voi arvioida.',
  },
};

const SIDE = { home: '1', draw: 'X', away: '2' };

export async function load() {
  if (state.loading || state.file) return state.file;
  state.loading = true;
  render();
  try {
    const res = await fetch('data/reviews.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.rounds)) throw new Error('rikkinäinen rakenne');
    state.file = data;
    state.error = null;
    // Avaa tuorein kierros valmiiksi — käyttäjä haluaa nähdä sen ensin
    state.openRound = data.rounds[0]?.date ?? null;
  } catch (err) {
    state.error = err.message;
    state.file = null;
  }
  state.loading = false;
  render();
  return state.file;
}

export function toggleRound(date) {
  state.openRound = state.openRound === date ? null : date;
  render();
}

// ─── Renderöinti ──────────────────────────────────────────────────────────

function pickRow(p) {
  const v = VERDICT[p.verdict] ?? VERDICT.ei_tietoa;
  const minutes =
    p.verdict === 'ei_tietoa'
      ? ''
      : `<span style="color:var(--c-text-muted);font-size:.58rem">${p.minutes_leading} min voitolla</span>`;

  return `<div style="display:grid;grid-template-columns:auto 1fr auto;gap:7px;align-items:baseline;font-size:.64rem;padding:3px 0">
    <b style="color:${v.color}">${v.icon}</b>
    <span>
      <b>${SIDE[p.side]}</b> @ ${p.odds.toFixed(2)}${p.book ? ` <span style="color:var(--c-text-muted);font-size:.58rem">${esc(p.book)}</span>` : ''}
      · edge ${(p.edge * 100).toFixed(1)} %
      <br><span style="color:${v.color};font-size:.6rem">${esc(v.label)}</span> ${minutes}
    </span>
    <b style="font-variant-numeric:tabular-nums;color:${p.profit_units >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">
      ${p.profit_units >= 0 ? '+' : ''}${p.profit_units.toFixed(2)}
    </b>
  </div>`;
}

function goalStrip(goals) {
  if (!goals?.length) return '';
  const marks = goals
    .map(
      (g) =>
        `<span title="${g.minute}. min" style="position:absolute;left:${Math.min(100, (g.minute / 95) * 100)}%;top:0;width:2px;height:100%;background:${g.side === 'home' ? 'var(--c-accent)' : 'var(--c-warning)'}"></span>`
    )
    .join('');
  return `<div style="position:relative;height:7px;background:oklch(1 1 0/0.07);border-radius:4px;margin:5px 0 3px">${marks}</div>
    <div style="font-size:.55rem;color:var(--c-text-muted)">
      <span style="color:var(--c-accent)">▮</span> koti
      <span style="color:var(--c-warning);margin-left:6px">▮</span> vieras
      <span style="margin-left:6px">${goals.map((g) => `${g.minute}'`).join(' · ')}</span>
    </div>`;
}

function matchBlock(m) {
  const modelMark = m.model_correct ? '✓' : '✗';
  const marketMark = m.market_correct ? '✓' : '✗';

  return `<div style="padding:7px 0;border-bottom:1px dashed oklch(1 1 0/0.09)">
    <div style="display:grid;grid-template-columns:1fr auto;gap:8px;font-size:.68rem;align-items:baseline">
      <b>${esc(m.home)} – ${esc(m.away)}</b>
      <b style="font-variant-numeric:tabular-nums">${esc(m.score)}</b>
    </div>
    <div style="font-size:.58rem;color:var(--c-text-muted);margin-top:1px">
      ${esc(m.league)} ·
      malli <b style="color:${m.model_correct ? 'var(--c-success)' : 'var(--c-danger)'}">${modelMark}</b>
      ${pct(m.model[m.outcome], 0)} ·
      markkina <b style="color:${m.market_correct ? 'var(--c-success)' : 'var(--c-danger)'}">${marketMark}</b>
      ${pct(m.implied[m.outcome], 0)}
    </div>
    ${goalStrip(m.goals)}
    ${m.picks.length ? m.picks.map(pickRow).join('') : '<div style="font-size:.58rem;color:var(--c-text-muted);margin-top:3px">Ei liputettuja kohteita.</div>'}
  </div>`;
}

function roundBlock(round) {
  const s = round.summary;
  const open = state.openRound === round.date;
  const profitColor = s.profit_units >= 0 ? 'var(--c-success)' : 'var(--c-danger)';

  // Varoitus nostetaan otsikkotasolle: analyysivirhe on eri asia kuin tappio,
  // eikä sitä saa joutua etsimään otteluiden seasta
  const warning = s.never_leading
    ? `<div style="background:oklch(0.63 0.24 25 / 0.14);border:1px solid var(--c-danger);border-radius:5px;padding:5px 8px;font-size:.6rem;margin-top:6px">
         ⚠️ <b>${s.never_leading} liputettua kohdetta ei ollut voitolla kertaakaan.</b>
         Ne ovat analyysivirheitä eivätkä epäonnea.
       </div>`
    : '';

  return `<div class="card" style="margin-bottom:8px">
    <button class="btn" style="width:100%;background:none;border:none;padding:0;text-align:left;cursor:pointer;color:var(--c-text);min-height:0"
      onclick="window.BTRV.toggleRound('${esc(round.date)}')">
      <div style="display:grid;grid-template-columns:1fr auto;gap:8px;align-items:baseline">
        <b style="font-size:.74rem">${open ? '▾' : '▸'} ${esc(round.date)}</b>
        <span style="font-size:.62rem;color:var(--c-text-muted)">${s.matches} ottelua</span>
      </div>
    </button>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.62rem;margin-top:5px">
      <span style="color:var(--c-text-muted)">Malli <b style="color:var(--c-text)">${s.model_correct}/${s.matches}</b></span>
      <span style="color:var(--c-text-muted)">Markkina <b style="color:var(--c-text)">${s.market_correct}/${s.matches}</b></span>
    </div>

    ${
      s.picks
        ? `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:3px">
             Liputettuja <b style="color:var(--c-text)">${s.picks}</b> ·
             osui <b style="color:var(--c-text)">${s.picks_won}</b> ·
             paperitulos <b style="color:${profitColor}">${s.profit_units >= 0 ? '+' : ''}${s.profit_units.toFixed(2)}</b> yks
           </div>`
        : '<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:3px">Ei liputettuja kohteita tällä kierroksella.</div>'
    }

    ${warning}
    ${open ? `<div style="margin-top:6px">${round.matches.map(matchBlock).join('')}</div>` : ''}
  </div>`;
}

/** Koko historian yhteenveto — yksikään luku ei esiinny ilman vertailukohtaa */
function totals(rounds) {
  const t = rounds.reduce(
    (acc, r) => ({
      matches: acc.matches + r.summary.matches,
      model: acc.model + r.summary.model_correct,
      market: acc.market + r.summary.market_correct,
      picks: acc.picks + r.summary.picks,
      won: acc.won + r.summary.picks_won,
      profit: acc.profit + r.summary.profit_units,
      never: acc.never + r.summary.never_leading,
    }),
    { matches: 0, model: 0, market: 0, picks: 0, won: 0, profit: 0, never: 0 }
  );

  const small = t.matches < 20;
  const modelBetter = t.model > t.market;

  return `<div class="card">
    <div style="font-size:.78rem;font-weight:700">📚 Menneet kierrokset</div>
    <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:2px">
      ${rounds.length} kierrosta · ${t.matches} ottelua
    </div>

    ${
      small
        ? `<div style="background:oklch(0.72 0.16 85 / 0.15);border:1px solid var(--c-warning);border-radius:5px;padding:6px 8px;font-size:.62rem;margin-top:6px">
             ⚠️ <b>Otos on liian pieni.</b> ${t.matches} ottelua, luotettavaan arvioon tarvitaan 20.
             Nämä luvut kertovat mitä tapahtui, eivät sitä kuinka hyvä malli on.
           </div>`
        : ''
    }

    <div style="margin-top:7px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.12);display:grid;gap:3px;font-size:.65rem">
      <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px">
        <span style="color:var(--c-text-muted)">Osumatarkkuus</span>
        <b style="color:${modelBetter ? 'var(--c-success)' : 'var(--c-text)'}">${t.matches ? pct(t.model / t.matches, 0) : '—'}</b>
        <span style="color:var(--c-text-muted)">vs markkina ${t.matches ? pct(t.market / t.matches, 0) : '—'}</span>
      </div>
      ${
        t.picks
          ? `<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px">
               <span style="color:var(--c-text-muted)">Liputetut kohteet</span>
               <b>${t.won}/${t.picks}</b>
               <span style="color:${t.profit >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${t.profit >= 0 ? '+' : ''}${t.profit.toFixed(2)} yks</span>
             </div>`
          : ''
      }
      ${
        t.never
          ? `<div style="display:grid;grid-template-columns:1fr auto;gap:8px">
               <span style="color:var(--c-text-muted)">Ei kertaakaan voitolla</span>
               <b style="color:var(--c-danger)">${t.never}</b>
             </div>`
          : ''
      }
    </div>

    <div style="font-size:.56rem;color:var(--c-text-muted);margin-top:6px;line-height:1.45">
      "Ei kertaakaan voitolla" = kohde ei ollut voimassa oleva lopputulos yhtenäkään minuuttina.
      Se erottaa analyysivirheen huonosta tuurista — jalkapallossa mikään tulos ei ole
      mahdoton ennen loppuvihellystä, joten tämä ei väitä että voitto olisi ollut mahdoton.
    </div>
  </div>`;
}

export function render(containerId = 'rounds-content') {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (state.loading) {
    el.innerHTML = '<div class="card"><div style="font-size:.68rem;color:var(--c-text-muted)">Ladataan kierroksia…</div></div>';
    return;
  }

  if (state.error) {
    el.innerHTML = `<div class="card">
      <div style="font-size:.74rem;font-weight:700">📚 Menneet kierrokset</div>
      <div style="font-size:.64rem;color:var(--c-text-muted);margin-top:5px">
        Kierrosarvioita ei saatu (${esc(state.error)}).
        Ne syntyvät kun cron on ajanut vähintään yhden ratkenneen kierroksen.
      </div>
    </div>`;
    return;
  }

  const rounds = state.file?.rounds ?? [];
  if (!rounds.length) {
    el.innerHTML = `<div class="card">
      <div style="font-size:.74rem;font-weight:700">📚 Menneet kierrokset</div>
      <div style="font-size:.64rem;color:var(--c-text-muted);margin-top:5px">
        Yhtään kierrosta ei ole vielä ratkennut.
      </div>
    </div>`;
    return;
  }

  el.innerHTML = totals(rounds) + rounds.map(roundBlock).join('');
}

if (typeof window !== 'undefined') {
  window.BTRV = { load, render, toggleRound };
}
