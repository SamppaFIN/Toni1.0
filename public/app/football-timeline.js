// Tiketti #79: Aikajanakontrolli — selaa kierroksia eteen ja taakse
//
// Vanha päivänavigointi (tiketti #63) oli kolme kiinteää nappia: eilen,
// tänään, huomenna. Se riitti kun näkyvissä oli vain se mitä The Odds API
// sattui antamaan, mutta ei vastaa kysymykseen "mitä ensi viikonloppuna
// pelataan".
//
// Aikajana lukee `public/data/fixtures.json`:in, jonka cron rakentaa ESPN:n
// otteluohjelmasta kaikille seuratuille sarjoille. Se sisältää koko
// aikaikkunan, ei vain kertoimellisia päiviä.
//
// KAKSI SÄÄNTÖÄ:
//
//   1. TYHJIÄ PÄIVIÄ EI NÄYTETÄ. Jos päivällä ei ole yhtään ottelua, se ei
//      ole aikajanalla lainkaan. Käyttäjä selaa kierroksesta kierrokseen,
//      ei kalenteripäivästä toiseen — ja tyhjä päivä näyttäisi virheeltä
//      ("miksi tässä ei ole mitään?") vaikka kyse on siitä ettei sinä
//      päivänä pelata.
//
//   2. KERTOIMETTOMUUS SANOTAAN, EI PIILOTETA. Ottelu jolle ei vielä ole
//      kertoimia näkyy silti — merkittynä. Jos se piilotettaisiin, käyttäjä
//      luulisi ettei ottelua ole. Kertoimet ilmestyvät kun cron hakee ne
//      lähempänä ottelua.

import { esc } from './snapshot.js';

const SELECTED_KEY = 'bt_timeline_day';

let calendar = null;
let loadState = 'idle'; // idle | loading | ready | failed
let failReason = '';

/** Paikallinen kalenteripäivä ISO-muodossa */
export function todayKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
 * Käytetään kun käyttäjä ei ole valinnut mitään tai kun valittu päivä on
 * pudonnut kalenterista (ohitse mennyt). Tänään on ensisijainen; jos tänään
 * ei pelata, seuraava ottelupäivä. Jos kaikki ovat menneisyydessä, viimeisin
 * — silloin katsotaan mennyttä kierrosta, mikä on parempi kuin tyhjä ruutu.
 */
export function nearestDay(days, today) {
  if (!days?.length) return null;
  const exact = days.find((d) => d.date === today);
  if (exact) return exact.date;
  const future = days.find((d) => d.date > today);
  if (future) return future.date;
  return days[days.length - 1].date;
}

/** Päivät ryhmiteltyinä viikonloppu/arki-erotuksella otsikointia varten */
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
    // Aikajana on lisä, ei ehto: ilman sitä kortit toimivat kuten ennen.
    // Vika kerrotaan mutta se ei estä mitään.
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

// ─── Renderöinti ──────────────────────────────────────────────────────────

function dayChip(day, selected, today) {
  const active = day.date === selected;
  const past = day.date < today;
  // Kertoimeton päivä merkitään himmeämmäksi, muttei piiloteta
  const dot = day.with_odds > 0 ? '<span style="color:var(--c-success)">●</span>' : '<span style="opacity:.4">○</span>';
  return `<button class="day-btn${active ? ' active' : ''}" style="flex:0 0 auto;${past && !active ? 'opacity:.6' : ''}"
    onclick="window.BTL2.select('${esc(day.date)}')"
    title="${day.matches} ottelua · ${day.with_odds} kertoimin · ${esc(day.leagues.join(', '))}">
    ${esc(dayLabel(day.date, today))}
    <span style="font-size:.55rem;opacity:.75;margin-left:3px">${day.matches}</span> ${dot}
  </button>`;
}

/**
 * Aikajanan HTML.
 *
 * Palauttaa tyhjän merkkijonon jos kalenteria ei ole — kutsuja liittää sen
 * sellaisenaan eikä joudu tarkistamaan tilaa.
 */
export function renderStrip(today = todayKey(), mode = 0) {
  if (loadState === 'failed') {
    return `<div style="font-size:.6rem;color:var(--c-text-muted);margin:0 0 6px 2px">
      Otteluohjelmaa ei saatu (${esc(failReason)}) — näytetään vain kertoimelliset päivät.
    </div>`;
  }
  if (!calendar?.days?.length) return '';

  const showAll = String(mode) === 'all';
  const selected = showAll ? null : (getSelectedDay() ?? nearestDay(calendar.days, today));

  // "Kaikki" pysyy tarjolla: aikajana on selaamista varten, mutta joskus
  // halutaan nähdä koko aikaikkuna kerralla. Se on ankkuroitu vasemmalle
  // eikä liiku vieritettäessä pois, koska se on ainoa ei-päiväkohtainen
  // valinta.
  const allChip = `<button class="day-btn${showAll ? ' active' : ''}" style="flex:0 0 auto"
    onclick="window.BTF.setDayFilter('all')" title="Koko aikaikkuna kerralla">📅 Kaikki</button>`;

  const chips = calendar.days.map((d) => dayChip(d, selected, today)).join('');

  return `<div class="timeline-strip" style="display:flex;gap:5px;overflow-x:auto;padding:2px 2px 6px;margin:0 0 6px 0;scrollbar-width:thin">${allChip}${chips}</div>`;
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

// ─── Raahaus ja vieritys ──────────────────────────────────────────────────
//
// Kosketuslaitteella nauha vierittyy natiivisti (overflow-x + touch-action),
// mutta hiirella se vaatisi joko rullan vaakasuunnassa tai palkin tarttumista.
// Kumpikin on hankalaa, joten nauha on raahattava.
//
// KLIKKAUS EI SAA HUKKUA. Raahaus ja valinta ovat samassa elementissa, joten
// ne erotetaan liikekynnyksella: alle DRAG_THRESHOLD pikselia on klikkaus,
// yli on raahaus ja silloin chippien pointer-events katkaistaan luokalla.

const DRAG_THRESHOLD = 6;

let dragging = null;

function onPointerDown(e) {
  const strip = e.currentTarget;
  // Vain paapainike; kosketus ja kyna kelpaavat sellaisenaan
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  dragging = { strip, startX: e.clientX, startScroll: strip.scrollLeft, moved: false, id: e.pointerId };
}

function onPointerMove(e) {
  if (!dragging || e.pointerId !== dragging.id) return;
  const dx = e.clientX - dragging.startX;
  if (!dragging.moved && Math.abs(dx) < DRAG_THRESHOLD) return;

  if (!dragging.moved) {
    dragging.moved = true;
    dragging.strip.classList.add('dragging');
    // Kaappaus vasta kun raahaus on alkanut, jotta tavallinen klikkaus
    // ei koskaan menetä kohdettaan
    try {
      dragging.strip.setPointerCapture(e.pointerId);
    } catch {
      /* jotkin selaimet kieltavat kaappauksen kosketuksella */
    }
  }
  dragging.strip.scrollLeft = dragging.startScroll - dx;
}

function onPointerUp(e) {
  if (!dragging) return;
  const { strip, moved, id } = dragging;
  dragging = null;
  if (!moved) return;
  try {
    strip.releasePointerCapture(id);
  } catch {
    /* kaappausta ei ollut */
  }
  // Luokka pois vasta seuraavassa framessa: muuten tama klikkaus ehtii
  // lapi chipille ja raahaus valitsisi paivan vahingossa
  requestAnimationFrame(() => strip.classList.remove('dragging'));
}

/**
 * Kytke raahaus ja vierita valittu paiva nakyviin.
 *
 * Kutsutaan jokaisen renderoinnin jalkeen. Nauha rakennetaan uudelleen joka
 * kerta, joten kuuntelijat kiinnitetaan uuteen elementtiin -- vanha katoaa
 * DOM:ista eika jata vuotoa.
 */
export function attach(root = document) {
  const strip = root.querySelector('.timeline-strip');
  if (!strip) return;

  strip.addEventListener('pointerdown', onPointerDown);
  strip.addEventListener('pointermove', onPointerMove);
  strip.addEventListener('pointerup', onPointerUp);
  strip.addEventListener('pointercancel', onPointerUp);
  // Raahaus ei saa raahata linkkeja tai tekstia mukanaan
  strip.addEventListener('dragstart', (e) => e.preventDefault());

  scrollToActive(strip);
}

/**
 * Vierita aktiivinen paiva nakyviin.
 *
 * Ilman tata nauha jaa vasempaan laitaan, jossa on kolmen viikon takaisia
 * paivia -- kayttaja nakee ensimmaisena menneisyyden vaikka valittuna on
 * tama paiva.
 */
export function scrollToActive(strip) {
  const active = strip.querySelector('.day-btn.active');
  if (!active) return;
  // scrollIntoView vierittaisi myos sivua pystysuunnassa; lasketaan itse
  const target = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  strip.scrollLeft = Math.max(0, target);
}

/** Käyttäjä valitsi päivän aikajanalta */
export function select(date) {
  setSelectedDay(date);
  // Päivävalinta ei voi elää "Kaikki"-tilan rinnalla: se haara palauttaa
  // koko aikaikkunan eikä koskaan katso valittua päivää. Siirretään pois
  // siitä, muuten klikkaus ei näyttäisi tekevän mitään.
  if (window.BTF?.getDayFilter?.() === 'all') window.BTF.setDayFilter(0);
  else if (window.BTF?.renderAll) window.BTF.renderAll();
}

// Sama vartija kuin muissa moduuleissa: yksikkotestit tuovat naman Nodeen,
// jossa windowia ei ole (ks. football-chase.js, football-llm.js).
if (typeof window !== 'undefined') {
  window.BTL2 = { load, select, renderStrip, renderDayFixtures, getSelectedDay, setSelectedDay, matchesFor, getCalendar, attach };
}
