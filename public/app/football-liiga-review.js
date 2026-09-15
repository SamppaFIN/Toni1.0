// Tiketti #105: Jälkiarvio jääkiekkokortin footer-tabina
//
// data/liiga-reviews.json (liiga-reviews-build.ts) sisältää yhden rivin per
// PÄÄTTYNYT Liigan ottelu: mitä malli sanoi, mitä tapahtui, ja kolme
// mitattavaa väitettä. Tämä moduuli lataa tiedoston ja näyttää sen sisällön
// sen ottelun kortilla johon se kuuluu — sama SECTIONS-mekanismi jota
// Tunnusluvut/Uutiset/Analyysi jo käyttävät (football-cards.js).
//
// matchId TÄSMÄÄ SUORAAN korttiin: liiga-reviews-build.ts kirjoittaa
// kerroinhistorian match_id:n (today.json:in tunniste), ei Liiga.fi-nimistä
// rakennettua omaa muotoaan — nimien normalisointia ei siis tarvita täällä.

import { esc, pct, SIDE_LABELS } from './snapshot.js';

let cache = null; // { byId: Map<string, review>, loadedAt: Date } | null
let loading = null;

async function load() {
  if (cache) return cache;
  if (loading) return loading;

  loading = fetch('data/liiga-reviews.json', { cache: 'no-cache' })
    .then((res) => (res.ok ? res.json() : null))
    .then((file) => {
      const byId = new Map();
      for (const round of file?.rounds ?? []) {
        for (const m of round.matches) byId.set(m.matchId, m);
      }
      cache = { byId, loadedAt: new Date() };
      return cache;
    })
    .catch(() => {
      cache = { byId: new Map(), loadedAt: new Date() };
      return cache;
    })
    .finally(() => {
      loading = null;
    });

  return loading;
}

/** Synkroninen haku valmiiksi ladatusta välimuistista — null jos ei vielä ladattu tai ei löydy */
export function reviewFor(match) {
  return cache?.byId.get(match.id) ?? null;
}

/** available()-tarkistus SECTIONS-rekisteriin: lataa taustalla, palauttaa nykytilan */
export function hasReview(match) {
  if (!cache) {
    load().then(() => window.BTF?.renderAllCards?.());
    return false;
  }
  return cache.byId.has(match.id);
}

const VERDICT_META = {
  osui: { icon: '✅', label: 'Osui', color: 'var(--c-success)' },
  kaatui_lopussa: { icon: '⚠️', label: 'Johti loppuun asti, kaatui — epäonni ei analyysivirhe', color: 'var(--c-warning)' },
  oli_voitolla: { icon: '🟡', label: 'Oli voitolla, hävisi', color: 'var(--c-warning)' },
  ei_koskaan_voitolla: { icon: '❌', label: 'EI KOSKAAN voitolla — analyysivirhe', color: 'var(--c-danger)' },
  ei_tietoa: { icon: '❔', label: 'Ei aikajanaa', color: 'var(--c-text-muted)' },
};

function claimRow(c) {
  const badge =
    c.hit === true
      ? '<span style="color:var(--c-success);font-weight:700">✓ osui</span>'
      : c.hit === false
        ? '<span style="color:var(--c-danger);font-weight:700">✗ ei osunut</span>'
        : '<span style="color:var(--c-text-muted)">– ei testattavissa</span>';

  return `<div style="padding:5px 0;border-bottom:1px dashed oklch(1 1 0/0.1);font-size:.65rem">
    <div style="display:flex;justify-content:space-between;gap:6px">
      <b>${esc(c.claim)}</b>${badge}
    </div>
    <div style="color:var(--c-text-muted);margin-top:1px">Malli: ${esc(c.model)} · Toteutui: ${esc(c.actual)}</div>
    <div style="color:var(--c-text-muted);font-size:.6rem;margin-top:1px">${esc(c.note)}</div>
  </div>`;
}

/** Isoin liputettu kohde avaushavainnosta — sama VERDICT_META kuin mallin valinnalla, koska Verdict-arvot ovat samat */
function pickBlock(r) {
  const p = r.pick;
  if (!p) {
    return `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:6px">Ei panossuositusta tälle ottelulle.</div>`;
  }
  const v = VERDICT_META[p.verdict] ?? VERDICT_META.ei_tietoa;
  // stake 0 = Kelly pyöristi nollaan — silloin mitään ei olisi oikeasti
  // lyöty, eikä "0,00 €" saa lukea samalta kuin "ei suositusta lainkaan"
  const result =
    p.stake > 0
      ? `<b style="color:${p.profit >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${p.profit >= 0 ? '+' : ''}${p.profit.toFixed(2)} €</b>`
      : `<span style="color:var(--c-text-muted)">panos pyöristyi nollaan</span>`;

  return `<div style="margin-top:6px;padding:6px 8px;border-radius:6px;background:oklch(1 1 0/0.06);font-size:.64rem">
    <div style="font-weight:700;margin-bottom:2px">Panossuositus (isoin liputettu kohde)</div>
    <div>
      <b>${SIDE_LABELS[p.side]}</b> @ ${p.odds.toFixed(2)}${p.book ? ` <span style="color:var(--c-text-muted)">${esc(p.book)}</span>` : ''}
      · edge ${(p.edge * 100).toFixed(1)} % · panos ${p.stake.toFixed(2)} €
    </div>
    <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
      <span>${v.icon}</span>
      <span style="color:${v.color}">${esc(v.label)}</span>
      <span style="margin-left:auto">${result}</span>
    </div>
    <div style="font-size:.56rem;color:var(--c-text-muted);margin-top:3px">Paperia — ei oikeaa rahaa.</div>
  </div>`;
}

/** Kertoimien laskemiseen otetut tekijät — puuttuva/tyhjä lista = ei tallennettuja tekijöitä, osio jätetään silloin pois */
function factorsBlock(r) {
  const reasons = r.modelExtra?.adjustments ?? [];
  if (!reasons.length) return '';
  return `<div style="margin-top:6px;font-size:.62rem">
    <div style="font-weight:700;margin-bottom:2px">Kertoimien tekijät</div>
    <ul style="margin:0;padding-left:16px;color:var(--c-text-muted)">
      ${reasons.map((a) => `<li>${esc(a.reason)}</li>`).join('')}
    </ul>
  </div>`;
}

export function reviewSection(match) {
  const r = reviewFor(match);
  if (!r) {
    return `<div style="font-size:.65rem;color:var(--c-text-muted)">Jälkiarviota ei ole vielä tälle ottelulle.</div>`;
  }

  const verdict = VERDICT_META[r.verdict] ?? VERDICT_META.ei_tietoa;
  const scoreLine = r.wentToOvertime
    ? `${esc(r.regulationScore)} <span style="color:var(--c-text-muted);font-size:.6rem">(varsinainen peliaika) — loppulukema ${esc(r.finalScore)}</span>`
    : esc(r.finalScore);

  const pickLine = (label, pick, correct) =>
    pick
      ? `${label}: <b>${SIDE_LABELS[pick]}</b> ${correct === true ? '<span style="color:var(--c-success)">✓ osui</span>' : correct === false ? '<span style="color:var(--c-danger)">✗ ei osunut</span>' : ''}`
      : `${label}: —`;

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
    <div style="font-size:.68rem;margin-bottom:4px">
      <b>Lopputulos:</b> ${scoreLine}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.65rem;margin-bottom:6px">
      <div>${pickLine('Malli', r.modelPick, r.modelCorrect)}</div>
      <div style="color:var(--c-text-muted)">${pickLine('Markkina', r.marketPick, r.marketCorrect)}</div>
    </div>

    <div style="display:flex;align-items:center;gap:6px;padding:6px 8px;border-radius:6px;background:oklch(1 1 0/0.06);font-size:.64rem;margin-bottom:6px">
      <span>${verdict.icon}</span>
      <span style="color:${verdict.color}">${esc(verdict.label)}</span>
      ${r.minutesLeading ? `<span style="color:var(--c-text-muted);margin-left:auto">mallin valinta johti ${r.minutesLeading} min</span>` : ''}
    </div>

    <div style="font-size:.68rem;font-weight:700;margin-bottom:2px">Väitteet</div>
    ${r.claims.length ? r.claims.map(claimRow).join('') : '<div style="font-size:.62rem;color:var(--c-text-muted)">Ei mitattavia väitteitä tälle ottelulle.</div>'}

    ${pickBlock(r)}
    ${factorsBlock(r)}

    <div style="font-size:.58rem;color:var(--c-text-muted);margin-top:6px;line-height:1.5">
      "– ei testattavissa" tarkoittaa ettei tämä ottelu mitannut väitettä (esim. malli ei poikennut markkinasta, tai kyse oli tasapelistä sijavertailussa) — ei arvattua osumaa.
    </div>
  </div>`;
}

load();

if (typeof window !== 'undefined') window.BTLR = { load, reviewFor, hasReview, reviewSection };
