// Tiketti #70: Jälkikäteisarviointi — mitä malli sanoi vs. mitä tapahtui
//
// Arkisto (tiketti #60) tallettaa kertoimet ja mallin arvion, mutta siihen
// asti se oli pelkkä varasto: dataa kertyi eikä kukaan katsonut sitä.
// Tämä näkymä tekee siitä hyödyllisen.
//
// KAKSI PERIAATETTA, samat kuin analyze/scoring.ts:ssä:
//
//   1. MALLI JA MARKKINA AINA RINNAKKAIN. "Malli osui 6/10" ei kerro
//      onko se hyvä. "Malli 6/10, markkina 7/10" kertoo.
//
//   2. LIIAN PIENI OTOS SANOTAAN ISOLLA. Kymmenen ottelun osumatarkkuus
//      näyttää mittarilta muttei ole mittari, ja siihen luottaminen on
//      pahempaa kuin ei mittaria lainkaan.

import { esc, pct } from './snapshot.js';
import { archivedDays, archivedDay } from './football-archive.js';
import { LEAGUE_CODES, fetchScoreboard, normalizeTeam } from './football-espn.js';

/** Alle tämän otoksen luvut ovat kohinaa — sama raja kuin palvelimen MIN_SAMPLE */
export const MIN_SAMPLE = 20;

let state = { rows: [], loading: false, loadedAt: null, error: null };

/** Todennäköisin kohde — sama argmax kuin palvelimella */
function argmax(probs) {
  return ['home', 'draw', 'away'].reduce((best, s) => (probs[s] > probs[best] ? s : best), 'home');
}

function outcomeOf(m) {
  if (m.homeScore === null || m.awayScore === null) return null;
  if (m.homeScore > m.awayScore) return 'home';
  if (m.awayScore > m.homeScore) return 'away';
  return 'draw';
}

/**
 * Yhdistä arkistoidut ennusteet toteutuneisiin tuloksiin.
 *
 * Tulokset haetaan ESPN:stä päivä kerrallaan, vain niiltä päiviltä joilta
 * arkistossa on jotain — turha haku on turha vaikka se olisi ilmainen.
 */
export async function load(maxDays = 14) {
  if (state.loading) return;
  state.loading = true;
  render();

  const rows = [];
  try {
    const days = archivedDays().slice(0, maxDays);

    for (const day of days) {
      const archived = archivedDay(day);
      if (!archived.length) continue;

      // Sarjat joita tältä päivältä tarvitaan
      const codes = [...new Set(archived.map((m) => LEAGUE_CODES[m.league]).filter(Boolean))];
      const results = new Map();

      for (const code of codes) {
        try {
          const stamp = day.replace(/-/g, '');
          for (const ev of await fetchScoreboard(code, stamp)) {
            if (!ev.completed) continue;
            results.set(`${normalizeTeam(ev.home)}|${normalizeTeam(ev.away)}`, ev);
          }
        } catch {
          /* yhden sarjan pettäminen ei saa piilottaa muita */
        }
      }

      for (const m of archived) {
        const hit = results.get(`${normalizeTeam(m.home.name)}|${normalizeTeam(m.away.name)}`);
        const actual = hit ? outcomeOf(hit) : null;
        if (!actual || !m.model?.probs || !m.market?.implied) continue;

        rows.push({
          day,
          league: m.league,
          home: m.home.name,
          away: m.away.name,
          score: `${hit.homeScore}–${hit.awayScore}`,
          actual,
          modelPick: argmax(m.model.probs),
          marketPick: argmax(m.market.implied),
          modelProb: m.model.probs[actual],
          marketProb: m.market.implied[actual],
          edges: m.edges ?? [],
        });
      }
    }

    state = { rows, loading: false, loadedAt: new Date(), error: null };
  } catch (err) {
    state = { ...state, loading: false, error: err.message };
  }
  render();
}

/** Brier score — sama kaava kuin analyze/scoring.ts */
function brier(rows, pick) {
  if (!rows.length) return null;
  const total = rows.reduce((sum, r) => {
    const p = pick(r);
    // Yksiluokkainen approksimaatio: (1 − p_toteutunut)² + muut²
    // Tarkka moniluokkainen vaatisi kaikki kolme todennäköisyyttä; tässä
    // riittää vertailukelpoisuus mallin ja markkinan välillä.
    return sum + (1 - p) ** 2;
  }, 0);
  return total / rows.length;
}

function summary(rows) {
  const modelHits = rows.filter((r) => r.modelPick === r.actual).length;
  const marketHits = rows.filter((r) => r.marketPick === r.actual).length;

  // Paperitulos liputetuista kohteista: 1 yksikkö per lippu
  let staked = 0;
  let returned = 0;
  let bets = 0;
  for (const r of rows) {
    for (const e of r.edges.filter((x) => x.flag && x.flag !== 'none')) {
      bets++;
      staked += 1;
      if (e.side === r.actual) returned += e.odds;
    }
  }

  return {
    n: rows.length,
    modelHits,
    marketHits,
    modelBrier: brier(rows, (r) => r.modelProb),
    marketBrier: brier(rows, (r) => r.marketProb),
    bets,
    staked,
    returned,
    roi: staked ? returned / staked - 1 : null,
  };
}

function row(r) {
  const mark = (hit) =>
    hit ? '<span style="color:var(--c-success)">osui</span>' : '<span style="color:var(--c-danger)">pieleen</span>';
  const L = { home: '1', draw: 'X', away: '2' };
  return `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;font-size:.64rem;padding:4px 0;border-bottom:1px dashed oklch(1 1 0/0.08);align-items:center">
    <span>${esc(r.home)} – ${esc(r.away)}<br><span style="color:var(--c-text-muted);font-size:.58rem">${esc(r.day)} · ${esc(r.league)}</span></span>
    <b style="font-variant-numeric:tabular-nums">${esc(r.score)}</b>
    <span title="Mallin veikkaus">${L[r.modelPick]} ${mark(r.modelPick === r.actual)}</span>
    <span title="Markkinan veikkaus" style="color:var(--c-text-muted)">${L[r.marketPick]} ${mark(r.marketPick === r.actual)}</span>
  </div>`;
}

function comparison(label, model, market, format, lowerIsBetter = false) {
  if (model === null || market === null) return '';
  const better = lowerIsBetter ? model < market : model > market;
  return `<div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;font-size:.66rem;padding:3px 0">
    <span style="color:var(--c-text-muted)">${esc(label)}</span>
    <span><b style="color:${better ? 'var(--c-success)' : 'var(--c-text)'}">${format(model)}</b> malli</span>
    <span style="color:var(--c-text-muted)">${format(market)} markkina</span>
  </div>`;
}

export function render(containerId = 'review-content') {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (state.loading) {
    el.innerHTML = '<div class="card"><div style="font-size:.7rem;color:var(--c-text-muted)">Haetaan tuloksia…</div></div>';
    return;
  }

  if (!state.loadedAt) {
    el.innerHTML = `<div class="card">
      <div style="font-size:.78rem;font-weight:700;margin-bottom:5px">🔍 Miten malli on pärjännyt</div>
      <div style="font-size:.66rem;color:var(--c-text-muted);margin-bottom:8px">
        Vertaa arkistoituja ennusteita toteutuneisiin tuloksiin. Arkisto täyttyy
        joka kerta kun sovellus lataa kohteet.
      </div>
      <button class="btn btn-primary btn-block" style="font-size:.7rem" onclick="window.BTA.load()">🔍 Arvioi ennusteet</button>
    </div>`;
    return;
  }

  if (state.error) {
    el.innerHTML = `<div class="card"><div style="font-size:.68rem;color:var(--c-danger)">⚠️ ${esc(state.error)}</div></div>`;
    return;
  }

  const s = summary(state.rows);

  if (!s.n) {
    el.innerHTML = `<div class="card">
      <div style="font-size:.78rem;font-weight:700;margin-bottom:5px">🔍 Miten malli on pärjännyt</div>
      <div style="font-size:.66rem;color:var(--c-text-muted)">
        Yhtään arkistoitua ennustetta ei ole vielä ratkennut. Arkistossa on
        ${archivedDays().length} päivää — tulokset ilmestyvät kun ottelut pelataan.
      </div>
    </div>`;
    return;
  }

  const warning =
    s.n < MIN_SAMPLE
      ? `<div style="background:oklch(0.72 0.16 85 / 0.15);border:1px solid var(--c-warning);border-radius:6px;padding:7px 9px;font-size:.66rem;margin-bottom:8px">
           ⚠️ <b>Otos on liian pieni.</b> ${s.n} ottelua, tarvitaan ${MIN_SAMPLE}.
           Nämä luvut ovat kohinaa eivätkä kelpaa päätöksenteon perusteeksi.
         </div>`
      : '';

  el.innerHTML = `<div class="card">
    <div class="row">
      <strong style="font-size:.78rem">🔍 Miten malli on pärjännyt</strong>
      <button class="btn" style="font-size:.58rem;padding:3px 9px;min-height:24px;border-radius:12px;background:oklch(1 1 0/0.08);color:var(--c-text)" onclick="window.BTA.load()">🔄</button>
    </div>
    <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:3px">${s.n} ratkennutta ottelua arkistosta</div>

    ${warning}

    <div style="margin-top:6px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.12)">
      ${comparison('Osumatarkkuus', s.modelHits / s.n, s.marketHits / s.n, (v) => pct(v, 0))}
      ${comparison('Brier (pienempi parempi)', s.modelBrier, s.marketBrier, (v) => v.toFixed(3), true)}
    </div>

    ${
      s.bets
        ? `<div style="margin-top:6px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.12);font-size:.66rem">
             <b>Paperitulos liputetuista</b><br>
             ${s.bets} kohdetta · 1 yksikkö kuhunkin ·
             tuotto <b style="color:${s.roi >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${s.roi >= 0 ? '+' : ''}${(s.roi * 100).toFixed(1)} %</b>
             <div style="font-size:.58rem;color:var(--c-text-muted);margin-top:2px">Ei oikeaa rahaa. Hinta on se jonka arkisto näki ennen ottelua.</div>
           </div>`
        : ''
    }
  </div>

  <div class="card">
    <div style="font-size:.68rem;font-weight:700;margin-bottom:4px">Ottelut</div>
    ${state.rows.map(row).join('')}
  </div>`;
}

if (typeof window !== 'undefined') window.BTA = { load, render };
