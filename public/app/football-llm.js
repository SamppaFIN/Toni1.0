// Tiketti #38: "Kysy LLM:ltä" — kierroksen analyysi kielimallilla
//
// Nappi vetolapulla lähettää koko kierroksen datan valitulle mallille
// OpenRouterin kautta ja näyttää vastauksen.
//
// KAKSI ASIAA JOTKA OHJAAVAT TÄTÄ TOTEUTUSTA:
//
// 1. Avain on selaimessa. Kutsu lähtee selaimesta, joten avain on
//    localStoragessa ja näkyy kenelle tahansa jolla on pääsy koneelle tai
//    selaimen kehitystyökaluihin. Tämä sanotaan käyttäjälle suoraan
//    Admin-välilehdellä — ei piiloteta.
//
// 2. LLM ei näe kertoimia ennen omaa arviotaan. Prompt on rakennettu niin
//    että malli saa ensin tunnusluvut ja uutiset, ja vasta sitten markkinan
//    hinnat. Jos kertoimet annettaisiin ensin, malli toistaisi ne takaisin
//    ja analyysi näyttäisi vahvistavan mallia vaikka se vain kopioisi
//    markkinaa. Sama ansa kuin sulkeutumislinjaa vasten mittaamisessa.

import { esc, pct, num } from './snapshot.js';
import { getSnapshot } from './football-cards.js';

const KEY_STORAGE = 'bt_openrouter_key';
const MODEL_STORAGE = 'bt_llm_model';
const LAST_ANALYSIS = 'bt_llm_last';
const MATCH_ANALYSIS_STORAGE = 'bt_llm_last_by_match';

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

/** Malleja joita OpenRouter tarjoaa — käyttäjä voi kirjoittaa minkä tahansa */
export const SUGGESTED_MODELS = [
  { id: 'anthropic/claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o mini (halpa)' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash (halpa)' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
];

export const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';

export function getApiKey() {
  return localStorage.getItem(KEY_STORAGE) || '';
}

export function setApiKey(key) {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
}

export function getModel() {
  return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL;
}

export function setModel(model) {
  localStorage.setItem(MODEL_STORAGE, model);
}

// ─── Promptin rakennus ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Olet kokenut jalkapallon vedonlyöntianalyytikko. Analysoit kierroksen otteluita ja annat rehellisen arvion.

Toimintaohjeet:
- Vastaa SUOMEKSI, tiiviisti ja konkreettisesti
- Älä toista annettuja lukuja sellaisenaan — tulkitse ne
- Jos data ei riitä johtopäätökseen, SANO SE. Älä keksi analyysia tyhjästä.
- Markkina on useimmiten oikeassa. Jos väität löytäneesi arvoa, perustele miksi markkina olisi väärässä juuri tässä.
- Ole skeptinen omia löydöksiäsi kohtaan. Useimmilla kierroksilla ei ole yhtään hyvää vetokohdetta, ja sen sanominen on arvokkaampaa kuin keksitty suositus.

Rakenne:
1. **Kierroksen yleiskuva** — 2–3 lausetta
2. **Kiinnostavimmat ottelut** — enintään 3, perusteluineen
3. **Vältä näitä** — jos jokin kohde näyttää houkuttelevalta mutta on ansa
4. **Yhteenveto** — löytyikö vetämisen arvoista, kyllä vai ei`;

/**
 * Kokoa kierroksen data promptiksi.
 *
 * Järjestys on tarkoituksellinen: tunnusluvut ja uutiset ensin, markkinan
 * hinnat vasta lopuksi. Näin malli muodostaa oman käsityksen ennen kuin
 * näkee mitä markkina ajattelee.
 */
export function buildPrompt(snapshot, bets = []) {
  const lines = [];

  lines.push(`# Kierros: ${snapshot.leagues.join(', ')}`);
  lines.push(`Otteluita: ${snapshot.matches.length}`);
  lines.push(`Data haettu: ${snapshot.generated_at}`);
  lines.push(`Lähteet: ${(snapshot.providers ?? []).join(', ') || 'ei tiedossa'}`);
  if (snapshot.source === 'mock') {
    lines.push(`HUOM: tämä on harjoitusdataa, ei oikeita kertoimia.`);
  }
  lines.push('');

  for (const [i, m] of snapshot.matches.entries()) {
    lines.push(`## Ottelu ${i + 1}: ${m.home.name} – ${m.away.name}`);
    lines.push(`Alkaa: ${m.kickoff}`);

    // 1. Tunnusluvut ensin
    if (m.stats) {
      const s = (t) =>
        `sija ${t.rank ?? '?'}, ${t.played} ottelua, ${num(t.gf_pg)} maalia/peli, ${num(t.ga_pg)} päästettyä/peli` +
        (t.form ? `, viime ottelut ${t.form}` : '') +
        (t.ppg !== null ? `, ${num(t.ppg)} pistettä/peli` : '');
      lines.push(`- ${m.home.name}: ${s(m.stats.home)}`);
      lines.push(`- ${m.away.name}: ${s(m.stats.away)}`);
    } else {
      lines.push(`- Joukkuetilastoja ei ole saatavilla tälle sarjalle.`);
    }

    // 2. Uutiset
    if (m.news?.length) {
      lines.push(`- Uutiset:`);
      for (const n of m.news.slice(0, 3)) {
        const tag = n.event_type ? ` [${n.event_type}${n.confidence !== null ? `, varmuus ${(n.confidence * 100).toFixed(0)} %` : ''}]` : '';
        lines.push(`  - ${n.title}${tag} (${n.source})`);
      }
    }

    // 3. Oma malli
    if (m.model.lambda_home !== null) {
      lines.push(
        `- Oma malli: odotetut maalit ${num(m.model.lambda_home)} – ${num(m.model.lambda_away)}, ` +
          `yli 2.5 ${pct(m.model.over25)}, molemmat maalin ${pct(m.model.btts)}`
      );
    }
    lines.push(
      `- Oman mallin todennäköisyydet: 1 ${pct(m.model.probs.home)} / X ${pct(m.model.probs.draw)} / 2 ${pct(m.model.probs.away)} (${m.model.method})`
    );
    for (const adj of m.model.adjustments ?? []) lines.push(`  - ${adj.reason}`);

    // 4. VASTA NYT markkina
    lines.push(
      `- Markkina (devigattu): 1 ${pct(m.market.implied.home)} / X ${pct(m.market.implied.draw)} / 2 ${pct(m.market.implied.away)}, kate ${pct(m.market.margin, 2)}`
    );
    lines.push(
      `- Parhaat kertoimet: 1 ${num(m.best.home)} (${m.best.home_book}) / X ${num(m.best.draw)} (${m.best.draw_book}) / 2 ${num(m.best.away)} (${m.best.away_book})`
    );
    const flagged = m.analysis.edges.filter((e) => e.flag !== 'none');
    if (flagged.length) {
      for (const e of flagged) {
        lines.push(`- Value-lippu: ${e.side} @ ${num(e.odds)}, edge ${pct(e.edge)}, Kelly-panos ${num(e.stake_suggestion)} €`);
      }
    } else {
      lines.push(`- Ei value-lippuja (edge alle 3 % kaikilla kohteilla)`);
    }
    lines.push('');
  }

  if (bets.length) {
    lines.push(`# Omat avoimet vetoni`);
    for (const b of bets) {
      const side = b.side === 'home' ? b.home : b.side === 'away' ? b.away : 'Tasapeli';
      lines.push(`- ${b.home} – ${b.away}: ${side} ${num(b.stake)} € @ ${num(b.odds)}${b.bookmaker ? ` (${b.bookmaker})` : ''}`);
    }
    lines.push('');
    lines.push(`Arvioi myös nämä vetoni: ovatko ne perusteltuja tämän datan valossa?`);
  }

  return lines.join('\n');
}

// ─── API-kutsu ────────────────────────────────────────────────────────────

export async function askLlm(prompt, { apiKey, model, signal } = {}) {
  const key = apiKey ?? getApiKey();
  if (!key) throw new Error('OpenRouter-avain puuttuu — lisää se Admin-välilehdellä');

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // OpenRouter suosittelee näitä tunnistautumiseen; eivät ole pakollisia
      'HTTP-Referer': location.origin,
      'X-Title': 'BetTracker',
    },
    body: JSON.stringify({
      model: model ?? getModel(),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1600,
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    // OpenRouterin virheet ovat yleensä JSON:ia; poimitaan viesti jos löytyy
    let detail = body.slice(0, 300);
    try {
      const parsed = JSON.parse(body);
      detail = parsed?.error?.message ?? detail;
    } catch {
      /* jätetään raakateksti */
    }
    if (res.status === 401) throw new Error(`Avain hylättiin (401). Tarkista OpenRouter-avain. ${detail}`);
    if (res.status === 402) throw new Error(`Saldo ei riitä (402). ${detail}`);
    if (res.status === 429) throw new Error(`Liikaa pyyntöjä (429). Odota hetki. ${detail}`);
    throw new Error(`OpenRouter ${res.status}: ${detail}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error('Malli palautti tyhjän vastauksen');

  return {
    text,
    model: data.model ?? model ?? getModel(),
    usage: data.usage ?? null,
  };
}

// ─── Markdown → HTML (kevyt) ──────────────────────────────────────────────

/**
 * Minimaalinen markdown-renderöinti. Ei kirjastoa yhden vastausmuodon takia.
 * Kaikki syöte escapetaan ensin, joten mallin vastaus ei voi injektoida HTML:ää.
 */
export function renderMarkdown(md) {
  const safe = esc(md);
  return safe
    .replace(/^### (.*)$/gm, '<div style="font-weight:700;font-size:.82rem;margin:10px 0 4px">$1</div>')
    .replace(/^## (.*)$/gm, '<div style="font-weight:700;font-size:.88rem;margin:12px 0 5px;color:var(--c-accent)">$1</div>')
    .replace(/^# (.*)$/gm, '<div style="font-weight:800;font-size:.95rem;margin:12px 0 6px">$1</div>')
    .replace(/^\s*[-*] (.*)$/gm, '<div style="padding-left:14px;position:relative"><span style="position:absolute;left:2px">·</span>$1</div>')
    .replace(/^\s*(\d+)\. (.*)$/gm, '<div style="padding-left:16px;position:relative"><span style="position:absolute;left:0;font-weight:700">$1.</span>$2</div>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\n{2,}/g, '<div style="height:7px"></div>')
    .replace(/\n/g, '<br>');
}

// ─── Näkymä ───────────────────────────────────────────────────────────────

let state = { status: 'idle', text: null, error: null, model: null, usage: null, at: null };
let controller = null;

/** Palauta viimeisin analyysi selaimen muistista */
function restoreLast() {
  try {
    const raw = localStorage.getItem(LAST_ANALYSIS);
    if (raw) state = { ...JSON.parse(raw), status: 'done' };
  } catch {
    /* vioittunut tallennus ei ole virhe */
  }
}
restoreLast();

function usageLine() {
  if (!state.usage) return '';
  const { prompt_tokens: p, completion_tokens: c, total_tokens: t } = state.usage;
  if (!t && !p) return '';
  return `<span style="color:var(--c-text-muted)"> · ${t ?? (p ?? 0) + (c ?? 0)} tokenia</span>`;
}

export function render(containerId = 'llm-content') {
  const el = document.getElementById(containerId);
  if (!el) return;

  const snapshot = getSnapshot();
  const hasKey = !!getApiKey();
  const matchCount = snapshot?.matches.length ?? 0;

  const button = () => {
    if (state.status === 'loading') {
      return `<button class="btn btn-block" style="background:oklch(1 1 0/0.1);color:var(--c-text)" onclick="window.BTL.cancel()">⏳ Analysoidaan… (peruuta)</button>`;
    }
    if (!hasKey) {
      return `<div style="padding:10px;border-radius:8px;background:oklch(0.72 0.16 85 / 0.14);font-size:.68rem;line-height:1.55">
        <b>⚠️ OpenRouter-avain puuttuu.</b> Lisää se Admin-välilehdellä, niin voit pyytää analyysin.
      </div>`;
    }
    if (!matchCount) {
      return `<div class="empty" style="font-size:.72rem">Ei otteluita analysoitavaksi.</div>`;
    }
    return `<button class="btn btn-primary btn-block" onclick="window.BTL.ask()">🤖 Kysy LLM:ltä analyysi (${matchCount} ottelua)</button>`;
  };

  const result = () => {
    if (state.status === 'error') {
      return `<div class="card" style="border-color:var(--c-danger)">
        <div style="font-weight:700;font-size:.78rem;color:var(--c-danger)">Analyysi epäonnistui</div>
        <div style="font-size:.68rem;color:var(--c-text-muted);margin-top:5px">${esc(state.error)}</div>
      </div>`;
    }
    if (state.status !== 'done' || !state.text) return '';
    return `<div class="card">
      <div class="row" style="font-size:.62rem;color:var(--c-text-muted);margin-bottom:6px">
        <span>🤖 ${esc(state.model ?? '')}${usageLine()}</span>
        <span>${state.at ? new Date(state.at).toLocaleTimeString('fi') : ''}</span>
      </div>
      <div style="font-size:.74rem;line-height:1.65">${renderMarkdown(state.text)}</div>
      <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:10px;padding-top:8px;border-top:1px dashed oklch(1 1 0/0.12)">
        Kielimallin tuottama teksti. Se ei näe kertoimia ennen omaa arviotaan, mutta se voi silti
        erehtyä, keksiä perusteluja tai olla eri mieltä kuin oma malli. Kohtele mielipiteenä.
      </div>
    </div>`;
  };

  el.innerHTML = `<div class="card">
      <div class="row"><strong style="font-size:.82rem">🤖 Kysy LLM:ltä</strong>${hasKey ? '<span class="badge badge-green" style="font-size:.5rem">avain asetettu</span>' : '<span class="badge badge-muted" style="font-size:.5rem">ei avainta</span>'}</div>
      <div style="font-size:.66rem;color:var(--c-text-muted);margin:6px 0 10px;line-height:1.55">
        Lähettää koko kierroksen datan — tunnusluvut, uutiset, oman mallin arvion ja markkinan hinnat —
        valitulle kielimallille ja pyytää analyysin. Myös avoimet vetosi lähetetään arvioitavaksi.
      </div>
      ${button()}
    </div>
    ${result()}`;
}

// ─── Per-ottelu-analyysi (kortin oma "Kysy LLM:ltä" -osio) ─────────────────
//
// Sama toiminto kuin yllä, mutta yhdelle ottelulle kerrallaan. Kortin oma
// nappi tarjoaa nopeamman ja halvemman kysymyksen kuin koko kierroksen
// läpikäynti Vetolapulla — promptissa on vain se yksi ottelu.
//
// matchCache pitää muistissa mistä säiliöstä mikäkin ottelu renderöitiin,
// jotta askMatch/cancelMatch löytävät oikean kontin ilman että kutsuja
// tarvitsee välittää sitä joka kerta uudelleen.

const perMatchState = new Map();
const perMatchControllers = new Map();
const matchCache = new Map(); // matchId -> { match, bets, containerId }

function loadPersistedMatch(matchId) {
  try {
    const all = JSON.parse(localStorage.getItem(MATCH_ANALYSIS_STORAGE) || '{}');
    return all[matchId] ?? null;
  } catch {
    return null;
  }
}

function persistMatchState(matchId, matchState) {
  try {
    const all = JSON.parse(localStorage.getItem(MATCH_ANALYSIS_STORAGE) || '{}');
    all[matchId] = matchState;
    localStorage.setItem(MATCH_ANALYSIS_STORAGE, JSON.stringify(all));
  } catch {
    /* localStorage täynnä tms. — analyysi jää silti näkyviin tälle sivulataukselle */
  }
}

function getMatchState(matchId) {
  if (!perMatchState.has(matchId)) {
    const persisted = loadPersistedMatch(matchId);
    perMatchState.set(matchId, persisted ? { ...persisted, status: 'done' } : { status: 'idle', text: null, error: null, model: null, usage: null, at: null });
  }
  return perMatchState.get(matchId);
}

function matchUsageLine(matchState) {
  if (!matchState.usage) return '';
  const { prompt_tokens: p, completion_tokens: c, total_tokens: t } = matchState.usage;
  if (!t && !p) return '';
  return `<span style="color:var(--c-text-muted)"> · ${t ?? (p ?? 0) + (c ?? 0)} tokenia</span>`;
}

/** Renderöi yhden ottelun LLM-paneeli sen omaan säiliöön kortilla */
export function renderForMatch(containerId, match, bets = []) {
  const el = document.getElementById(containerId);
  if (!el) return;

  matchCache.set(match.id, { match, bets, containerId });
  const matchState = getMatchState(match.id);
  const hasKey = !!getApiKey();

  const button = () => {
    if (matchState.status === 'loading') {
      return `<button class="btn btn-block" style="background:oklch(1 1 0/0.1);color:var(--c-text);font-size:.68rem" onclick="window.BTL.cancelMatch('${esc(match.id)}')">⏳ Analysoidaan… (peruuta)</button>`;
    }
    if (!hasKey) {
      return `<div style="font-size:.65rem;color:var(--c-text-muted);padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
        Lisää OpenRouter-avain Admin-välilehdellä käyttääksesi tätä ottelukohtaisesti.
      </div>`;
    }
    return `<button class="btn btn-primary btn-block" style="font-size:.7rem" onclick="window.BTL.askMatch('${esc(match.id)}')">🤖 Kysy LLM:ltä tästä ottelusta</button>`;
  };

  const result = () => {
    if (matchState.status === 'error') {
      return `<div style="margin-top:6px;padding:8px;border-radius:8px;background:oklch(0.52 0.22 25 / 0.12);border:1px solid var(--c-danger)">
        <div style="font-weight:700;font-size:.7rem;color:var(--c-danger)">Analyysi epäonnistui</div>
        <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:4px">${esc(matchState.error)}</div>
      </div>`;
    }
    if (matchState.status !== 'done' || !matchState.text) return '';
    return `<div style="margin-top:6px;padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
      <div class="row" style="font-size:.58rem;color:var(--c-text-muted);margin-bottom:5px">
        <span>🤖 ${esc(matchState.model ?? '')}${matchUsageLine(matchState)}</span>
        <span>${matchState.at ? new Date(matchState.at).toLocaleTimeString('fi') : ''}</span>
      </div>
      <div style="font-size:.7rem;line-height:1.6">${renderMarkdown(matchState.text)}</div>
    </div>`;
  };

  el.innerHTML = `${button()}${result()}`;
}

async function askMatch(matchId) {
  const cached = matchCache.get(matchId);
  const snapshot = getSnapshot();
  if (!cached || !snapshot) return;
  const { match, bets, containerId } = cached;

  const controller = new AbortController();
  perMatchControllers.set(matchId, controller);
  perMatchState.set(matchId, { status: 'loading', text: null, error: null, model: null, usage: null, at: null });
  renderForMatch(containerId, match, bets);

  try {
    // Yhden ottelun snapshot — sama muoto kuin kierrossnapshot, jotta
    // buildPrompt toimii muuttumattomana
    const miniSnapshot = {
      generated_at: snapshot.generated_at,
      leagues: [match.league],
      providers: snapshot.providers,
      source: snapshot.source,
      matches: [match],
    };
    const prompt = buildPrompt(miniSnapshot, bets);
    const { text, model, usage } = await askLlm(prompt, { signal: controller.signal });

    const doneState = { status: 'done', text, error: null, model, usage, at: new Date().toISOString() };
    perMatchState.set(matchId, doneState);
    persistMatchState(matchId, doneState);
    window.BT.toast('🤖 Analyysi valmis');
  } catch (err) {
    if (err.name === 'AbortError') {
      perMatchState.set(matchId, { status: 'idle', text: null, error: null, model: null, usage: null, at: null });
      window.BT.toast('Peruutettu');
    } else {
      perMatchState.set(matchId, { status: 'error', text: null, error: err.message, model: null, usage: null, at: null });
    }
  } finally {
    perMatchControllers.delete(matchId);
    renderForMatch(containerId, match, bets);
  }
}

function cancelMatch(matchId) {
  const controller = perMatchControllers.get(matchId);
  if (controller) controller.abort();
}

// ─── Julkinen rajapinta ───────────────────────────────────────────────────

const publicApi = {
  render,
  renderForMatch,
  askMatch,
  cancelMatch,
  async ask() {
    const snapshot = getSnapshot();
    if (!snapshot?.matches.length) return window.BT.toast('⚠️ Ei otteluita');

    controller = new AbortController();
    state = { status: 'loading', text: null, error: null, model: null, usage: null, at: null };
    render();

    try {
      const bets = (window.BT.getBets() || []).filter((b) => b.football);
      const prompt = buildPrompt(snapshot, bets);
      const { text, model, usage } = await askLlm(prompt, { signal: controller.signal });

      state = { status: 'done', text, error: null, model, usage, at: new Date().toISOString() };
      localStorage.setItem(LAST_ANALYSIS, JSON.stringify(state));
      window.BT.toast('🤖 Analyysi valmis');
    } catch (err) {
      if (err.name === 'AbortError') {
        state = { status: 'idle', text: null, error: null, model: null, usage: null, at: null };
        window.BT.toast('Peruutettu');
      } else {
        state = { status: 'error', text: null, error: err.message, model: null, usage: null, at: null };
      }
    } finally {
      controller = null;
      render();
    }
  },
  cancel() {
    if (controller) controller.abort();
  },
  saveKey(key) {
    setApiKey(key);
    render();
    if (typeof window.renderAdmin === 'function') window.renderAdmin();
    window.BT.toast(key ? '🔑 Avain tallennettu' : '🔑 Avain poistettu');
  },
  saveModel(model) {
    setModel(model);
    if (typeof window.renderAdmin === 'function') window.renderAdmin();
    window.BT.toast(`🤖 Malli: ${model}`);
  },
  getApiKey,
  getModel,
  SUGGESTED_MODELS,
};

if (typeof window !== 'undefined') window.BTL = publicApi;
