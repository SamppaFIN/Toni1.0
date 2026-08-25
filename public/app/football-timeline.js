// Tiketti #82: Päivänavigointi viitenä nappina
//
// Aiempi versio (tiketit #79/#81) oli vieritettävä nauha jossa oli kaikki 38
// ottelupäivää. Se toimi mutta oli huono käyttää: nauha piti raahata oikeaan
// kohtaan, päivät vilisivät, eikä yhdellä silmäyksellä nähnyt missä ollaan.
//
// Tilalla viisi nappia jotka mahtuvat ruudulle kerralla:
//
//   ‹   Eilen   Tänään   Huomenna   ›
//
// Kolme keskimmäistä ovat absoluuttisia pikavalintoja. Nuolet siirtävät
// valintaa päivä kerrallaan, jolloin koko aikaikkuna on yhä tavoitettavissa —
// se vain vaatii useamman painalluksen kuin nauhan raahaus. Se on hyväksyttävä
// hinta siitä että perustapaus (eilen / tänään / huomenna) on yhden
// klikkauksen päässä.
//
// NUOLET HYPPÄÄVÄT OTTELUPÄIVIIN, EIVÄT KALENTERIPÄIVIIN. Jos huomenna ei
// pelata, `›` vie seuraavaan päivään jolla on otteluita. Sokea +1 vrk veisi
// tyhjälle päivälle, ja tyhjä päivä näyttää virheeltä vaikka kyse on siitä
// ettei silloin pelata. Ilman kalenteria nuolet askeltavat vuorokauden
// kerrallaan — silloin muuta tietoa ei ole.
//
// KERTOIMETTOMUUS SANOTAAN, EI PIILOTETA. Ottelu jolle ei vielä ole kertoimia
// näkyy otteluohjelmana kertoimellisten alla. Piilotettuna käyttäjä luulisi
// ettei ottelua ole.

import { esc } from './snapshot.js';

const SELECTED_KEY = 'bt_timeline_day';

let calendar = null;
let loadState = 'idle'; // idle | loading | ready | failed
let failReason = '';

/** Paikallinen kalenteripäivä ISO-muodossa */
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Siirrä päivää n vuorokautta. Palauttaa YYYY-MM-DD. */
export function shiftDay(date, days) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

/** Valittu päivä, tai null jos käyttäjä ei ole valinnut */
export function getSelectedDay() {
  try {
    return localStorage.getItem(SELECTED_KEY) || null;
  } catch {
    return null;
  }
}

export function setSelectedDay(date) {
  try {
    if (date) localStorage.setItem(SELECTED_KEY, date);
    else localStorage.removeItem(SELECTED_KEY);
  } catch {
    /* privaatti-ikkuna: valinta toimii istunnon ajan */
  }
}

/**
 * Lähin päivä jolla on otteluita.
 *
 * Käytetään kun käyttäjä ei ole valinnut mitään. Tänään on ensisijainen; jos
 * tänään ei pelata, seuraava ottelupäivä. Jos kaikki ovat menneisyydessä,
 * viimeisin — mennyt kierros on parempi kuin tyhjä ruutu.
 */
export function nearestDay(days, today) {
  if (!days?.length) return null;
  const exact = days.find((d) => d.date === today);
  if (exact) return exact.date;
  const future = days.find((d) => d.date > today);
  if (future) return future.date;
  return days[days.length - 1].date;
}

/**
 * Seuraava tai edellinen päivä jolla on otteluita.
 *
 * Palauttaa null kun sellaista ei ole — kutsuja himmentää nuolen sen sijaan
 * että se veisi tyhjään näkymään.
 */
export function stepDay(from, direction, days) {
  // Ilman kalenteria askelletaan sokeasti: muuta tietoa ei ole
  if (!days?.length) return shiftDay(from, direction);

  const dates = days.map((d) => d.date);
  return direction > 0
    ? (dates.find((d) => d > from) ?? null)
    : ([...dates].reverse().find((d) => d < from) ?? null);
}

const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];

export function dayLabel(date, today) {
  if (date === today) return 'Tänään';
  const d = new Date(`${date}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const diff = Math.round((d - t) / 86_400_000);
  if (diff === 1) return 'Huomenna';
  if (diff === -1) return 'Eilen';
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

// ─── Lataus ───────────────────────────────────────────────────────────────

export async function load() {
  if (loadState === 'loading' || loadState === 'ready') return calendar;
  loadState = 'loading';
  try {
    const res = await fetch('data/fixtures.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.days)) throw new Error('rikkinäinen rakenne');
    calendar = data;
    loadState = 'ready';
  } catch (err) {
    // Navigointi on lisä, ei ehto: ilman kalenteria kortit toimivat kuten
    // ennen ja nuolet askeltavat vuorokauden kerrallaan.
    loadState = 'failed';
    failReason = err.message;
    calendar = null;
  }
  return calendar;
}

export function getCalendar() {
  return calendar;
}

/** Valitun päivän ottelut kalenterista */
export function matchesFor(date) {
  return (calendar?.matches ?? []).filter((m) => m.date === date);
}

/** Montako ottelua päivällä on — nappi kertoo sen pienellä */
function countFor(date) {
  return calendar?.days?.find((d) => d.date === date)?.matches ?? 0;
}

// ─── Renderöinti ──────────────────────────────────────────────────────────

function shortcut(date, selected, today) {
  const active = date === selected;
  const n = countFor(date);
  // Päivä jolla ei pelata jää himmeäksi mutta pysyy painettavana: käyttäjä
  // saa nähdä itse ettei otteluita ole, eikä nappi katoa alta.
  const dim = Boolean(calendar?.days?.length) && n === 0;
  return `<button class="day-btn${active ? ' active' : ''}"${dim ? ' style="opacity:.5"' : ''}
    onclick="window.BTL2.select('${esc(date)}')"
    title="${esc(date)}${n ? ` · ${n} ottelua` : ' · ei otteluita'}">${esc(dayLabel(date, today))}${n ? `<span style="font-size:.55rem;opacity:.75;margin-left:3px">${n}</span>` : ''}</button>`;
}

function arrow(direction, target) {
  const label = direction > 0 ? '›' : '‹';
  if (!target) {
    return `<button class="day-btn" disabled style="opacity:.35;cursor:default" title="Ei ${direction > 0 ? 'myöhempiä' : 'aiempia'} ottelupäiviä">${label}</button>`;
  }
  const title = direction > 0 ? 'Seuraava ottelupäivä' : 'Edellinen ottelupäivä';
  return `<button class="day-btn" onclick="window.BTL2.select('${esc(target)}')" title="${title}: ${esc(target)}">${label}</button>`;
}

/**
 * Päivänavigoinnin HTML.
 *
 * Palauttaa aina jotain — myös ilman kalenteria, jolloin nuolet askeltavat
 * vuorokauden kerrallaan ja pikavalinnat toimivat normaalisti.
 */
export function renderNav(today = todayKey()) {
  const selected = getSelectedDay() ?? nearestDay(calendar?.days, today) ?? today;
  const days = calendar?.days;

  const buttons = [
    arrow(-1, stepDay(selected, -1, days)),
    shortcut(shiftDay(today, -1), selected, today),
    shortcut(today, selected, today),
    shortcut(shiftDay(today, 1), selected, today),
    arrow(1, stepDay(selected, 1, days)),
  ].join('');

  // Valittu päivä sanotaan erikseen kun se ei ole mikään kolmesta
  // pikavalinnasta: nuolilla voi kävellä kauas, eikä yksikään nappi silloin
  // ole korostettuna. Ilman tätä näkymä ei kertoisi mitä päivää katsotaan.
  const shortcuts = [shiftDay(today, -1), today, shiftDay(today, 1)];
  const caption = shortcuts.includes(selected)
    ? ''
    : `<div style="font-size:.6rem;color:var(--c-text-muted);margin:0 0 6px 3px">
         Valittuna <b style="color:var(--c-text)">${esc(dayLabel(selected, today))}</b> · ${esc(selected)}
       </div>`;

  const warn =
    loadState === 'failed'
      ? `<div style="font-size:.58rem;color:var(--c-text-muted);margin:0 0 6px 3px">Otteluohjelmaa ei saatu (${esc(failReason)}) — nuolet siirtyvät vuorokauden kerrallaan.</div>`
      : '';

  return `<div class="day-nav" style="display:flex;gap:5px;flex-wrap:wrap;margin:0 0 6px 0">${buttons}</div>${caption}${warn}`;
}

/** Valitun päivän ottelut listana — käytetään kun kertoimia ei ole */
export function renderDayFixtures(date, knownIds = new Set()) {
  const list = matchesFor(date).filter((m) => !m.match_id || !knownIds.has(m.match_id));
  if (!list.length) return '';

  const byLeague = new Map();
  for (const m of list) {
    const arr = byLeague.get(m.league);
    if (arr) arr.push(m);
    else byLeague.set(m.league, [m]);
  }

  const blocks = [...byLeague.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([league, matches]) => {
      const rows = matches
        .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
        .map((m) => {
          const time = new Date(m.kickoff).toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
          const result =
            m.status === 'finished' && m.home_score !== null
              ? `<b style="font-variant-numeric:tabular-nums">${m.home_score}–${m.away_score}</b>`
              : m.status === 'live'
                ? '<span style="color:var(--c-danger)">käynnissä</span>'
                : `<span style="color:var(--c-text-muted)">${esc(time)}</span>`;
          return `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;font-size:.66rem;padding:3px 0;border-bottom:1px dashed oklch(1 1 0/0.07)">
            <span>${esc(m.home)} – ${esc(m.away)}</span>${result}
          </div>`;
        })
        .join('');
      return `<div style="margin-top:7px"><div style="font-size:.62rem;font-weight:700;color:var(--c-text-muted);letter-spacing:.03em">${esc(league)}</div>${rows}</div>`;
    })
    .join('');

  return `<div class="card">
    <div style="font-size:.72rem;font-weight:700">📋 Otteluohjelma</div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:2px">
      ${list.length} ottelua ilman julkaistuja kertoimia. Kertoimet ilmestyvät lähempänä ottelua.
    </div>
    ${blocks}
  </div>`;
}

/** Käyttäjä valitsi päivän */
export function select(date) {
  setSelectedDay(date);
  // Päivävalinta ei voi elää "Kaikki"-tilan rinnalla: se haara palauttaa koko
  // aikaikkunan eikä koskaan katso valittua päivää. Siirretään pois siitä,
  // muuten klikkaus ei näyttäisi tekevän mitään.
  if (window.BTF?.getDayFilter?.() === 'all') window.BTF.setDayFilter(0);
  else if (window.BTF?.renderAll) window.BTF.renderAll();
}

if (typeof window !== 'undefined') {
  window.BTL2 = {
    load,
    select,
    renderNav,
    renderDayFixtures,
    getSelectedDay,
    setSelectedDay,
    matchesFor,
    getCalendar,
  };
}
