// Päivänavigointi: nuolet ja päivämäärä
//
// Kehitys: vieritettävä nauha (#79/#81) -> viisi nappia (#82) -> tämä.
//
//   ‹   pe 11.9. · Tänään · 7 ottelua   ›
//
// Viisi nappia oli yhä epäselvä: kolme pikavalintaa (Eilen/Tänään/Huomenna)
// näyttivät samanlaisilta kuin nuolet, eikä mikään niistä kertonut MITÄ
// PÄIVÄÄ katsotaan — päivämäärä näkyi vain silloin kun valinta oli kaikkien
// pikavalintojen ulkopuolella. Käyttäjä joutui päättelemään sijaintinsa
// siitä mikä nappi sattui olemaan korostettuna.
//
// Nyt keskellä on yksi elementti joka SANOO päivän: viikonpäivä, päivämäärä,
// suhde tähän päivään ja otteluiden määrä. Nuolet liikkuvat, keskimmäinen
// palauttaa tähän päivään. Kolme elementtiä mahtuu 320 px ruudulle ilman
// rivitystä, ja katsottava päivä on aina luettavissa eikä pääteltävissä.
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

import { esc, sportMode } from './snapshot.js';

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

/** Kalenteripäivä aina samassa muodossa: "pe 11.9." */
export function calendarLabel(date) {
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

/**
 * Navigoinnin keskimmäisen napin teksti.
 *
 * Päivämäärä on AINA mukana — se on koko napin tarkoitus. Suhteellinen sana
 * (Tänään/Eilen/Huomenna) tulee sen perään lisätietona silloin kun sellainen
 * on, koska "Tänään" yksin ei kerro mikä päivä on eikä "pe 11.9." yksin
 * kerro onko se tänään.
 */
export function navLabel(date, today) {
  const cal = calendarLabel(date);
  const rel = dayLabel(date, today);
  return rel === cal ? cal : `${cal} · ${rel}`;
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

// ─── Kierrosennusteet ilman kertoimia (previews.json) ─────────────────────
//
// Ottelu jolle ei ole kertoimia ei saa korttia, koska kortin sisalto on
// hinta. Malli osaa silti sanoa jotain, ja Vakio-tyyppisessa kohteessa
// hintaa ei edes ole — valitaan 1, X tai 2. Ennuste naytetaan siksi
// otteluohjelman rivilla.

let previews = null;

export async function loadPreviews() {
  if (previews) return previews;
  try {
    const res = await fetch('data/previews.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    previews = Array.isArray(data.matches) ? data : null;
  } catch {
    // Ennusteet ovat lisa, ei ehto: ilman niita otteluohjelma toimii kuten ennen
    previews = null;
  }
  return previews;
}

/**
 * Ennuste ottelulle.
 *
 * Ensisijaisesti tunnisteella. Kertoimettomalla ottelulla `match_id` on null
 * molemmin puolin, joten silloin vertaillaan paivaa ja joukkuenimia — ne
 * tulevat samasta kalenterista, joten kirjoitusasu tasmaa.
 */
export function previewFor(match, file = previews) {
  const rows = file?.matches ?? [];
  if (match.match_id) {
    const byId = rows.find((r) => r.match_id && r.match_id === match.match_id);
    if (byId) return byId;
  }
  return rows.find((r) => r.date === match.date && r.home === match.home && r.away === match.away) ?? null;
}

const PICK_LABEL = { home: '1', draw: 'X', away: '2' };

/** Mallin 1X2 kolmena lukuna, valinta korostettuna */
function previewRow(p) {
  const cell = (side) => {
    const active = p.pick === side;
    return `<span style="display:inline-block;min-width:30px;text-align:center;padding:1px 3px;border-radius:3px;font-variant-numeric:tabular-nums;${
      active ? 'background:var(--c-accent,oklch(.7 .17 145));color:#000;font-weight:700' : 'opacity:.65'
    }">${Math.round(p.probs[side] * 100)}</span>`;
  };

  // Luottamus on osa lukua eika alaviite: 43 %:n luottamuksella laskettu
  // 56 % ei tarkoita samaa kuin 79 %:n luottamuksella laskettu 56 %.
  const conf = Math.round(p.confidence * 100);
  const chips = p.factors
    .slice(0, 4)
    .map(
      (f) =>
        `<span title="${esc(f.detail)}" style="font-size:.53rem;padding:1px 4px;border-radius:8px;background:oklch(1 1 0/0.08);white-space:nowrap">${
          f.side === 'home' ? '🏠' : f.side === 'away' ? '✈️' : '⚪'
        } ${esc(f.label)}</span>`
    )
    .join(' ');

  return `<div style="grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:2px 0 4px">
    <span style="font-size:.53rem;color:var(--c-text-muted)">malli</span>
    ${cell('home')}${cell('draw')}${cell('away')}
    <span style="font-size:.53rem;color:var(--c-text-muted)">→ ${PICK_LABEL[p.pick]} · luottamus ${conf} %</span>
    ${chips}
  </div>`;
}

// ─── Lajisuodatus (tiketti #105) ──────────────────────────────────────────
//
// fixtures.json sisältää KAIKKIEN seurattujen sarjojen ottelut, jalkapallon
// ja jääkiekon. Ilman suodatusta jääkiekkotilan päivänavigointi näytti myös
// pelkkiä jalkapallopäiviä pelipäivinä, koska calendar.days on palvelimella
// laskettu koko kalenterista eikä lajikohtaisesti. Sama sekaannus toimisi
// jalkapallotilassa toisin päin.

/** Ottelut nykyisen lajitilan mukaan. "both" ei suodata. */
function visibleMatches() {
  const all = calendar?.matches ?? [];
  const mode = sportMode();
  if (mode === 'both') return all;
  return all.filter((m) => (m.sport_key === 'icehockey_liiga') === (mode === 'hockey'));
}

/** Päivät joilla NÄKYVÄN LAJIN otteluita on — ei koko kalenterin päivät */
function visibleDays() {
  const byDate = new Map();
  for (const m of visibleMatches()) byDate.set(m.date, (byDate.get(m.date) ?? 0) + 1);
  return [...byDate.entries()]
    .map(([date, matches]) => ({ date, matches }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Valitun päivän ottelut kalenterista, nykyisen lajin mukaan suodatettuna */
export function matchesFor(date) {
  return visibleMatches().filter((m) => m.date === date);
}

/**
 * Etsi ottelu kalenterista tunnisteella.
 *
 * EI päivällä: kalenterin `date` on johdettu UTC:sta ja korttien päiväavain
 * on paikallinen, joten myöhäisillan ottelu ei löytyisi päivähaulla.
 */
export function calendarMatch(matchId) {
  return (calendar?.matches ?? []).find((m) => m.match_id === matchId) ?? null;
}

/** Montako NÄKYVÄN LAJIN ottelua päivällä on — nappi kertoo sen pienellä */
function countFor(date) {
  return visibleDays().find((d) => d.date === date)?.matches ?? 0;
}

// ─── Renderöinti ──────────────────────────────────────────────────────────

function arrow(direction, target) {
  const label = direction > 0 ? '›' : '‹';
  if (!target) {
    return `<button class="day-btn" disabled style="opacity:.35;cursor:default;min-width:34px"
      title="Ei ${direction > 0 ? 'myöhempiä' : 'aiempia'} ottelupäiviä">${label}</button>`;
  }
  const title = direction > 0 ? 'Seuraava ottelupäivä' : 'Edellinen ottelupäivä';
  return `<button class="day-btn" style="min-width:34px"
    onclick="window.BTL2.select('${esc(target)}')" title="${title}: ${esc(target)}">${label}</button>`;
}

/**
 * Keskimmäinen elementti: MITÄ PÄIVÄÄ katsotaan ja montako ottelua siinä on.
 *
 * Tämä on navigoinnin ainoa varsinainen tietosisältö. Nuolet kertovat vain
 * että liikkua voi; ilman tätä käyttäjä ei tietäisi mistä liikutaan.
 *
 * Klikkaus palauttaa tähän päivään. Kun ollaan jo tässä päivässä nappi on
 * korostettu ja passiivinen — klikkaus joka ei tee mitään on huonompi kuin
 * nappi joka näyttää siltä ettei siihen tarvitse koskea.
 */
function current(selected, today) {
  const isToday = selected === today;
  const n = countFor(selected);
  const known = Boolean(calendar?.days?.length);
  const sub = !known ? '' : n === 1 ? '1 ottelu' : `${n} ottelua`;

  return `<button class="day-btn day-current${isToday ? ' active' : ''}"
    style="flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:1px;line-height:1.15${isToday ? ';cursor:default' : ''}"
    ${isToday ? 'disabled' : `onclick="window.BTL2.select('${esc(today)}')"`}
    title="${isToday ? 'Katsot tätä päivää' : `Palaa tähän päivään (${esc(today)})`}">
    <span style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%">${esc(navLabel(selected, today))}</span>
    <span style="font-size:.55rem;opacity:.75;white-space:nowrap">${esc(sub)}${isToday ? '' : ' · ↩ tänään'}</span>
  </button>`;
}

/**
 * Päivänavigoinnin HTML.
 *
 * Palauttaa aina jotain — myös ilman kalenteria, jolloin nuolet askeltavat
 * vuorokauden kerrallaan ja päivämäärä näkyy silti.
 */
export function renderNav(today = todayKey()) {
  // Lajisuodatetut päivät (#105) — muuten nuolet ja otteluiden määrä
  // perustuisivat koko kalenteriin, ei siihen mitä ruudulla oikeasti näkyy.
  const days = calendar ? visibleDays() : null;
  const selected = getSelectedDay() ?? nearestDay(days, today) ?? today;

  const bar = [arrow(-1, stepDay(selected, -1, days)), current(selected, today), arrow(1, stepDay(selected, 1, days))].join('');

  const warn =
    loadState === 'failed'
      ? `<div style="font-size:.58rem;color:var(--c-text-muted);margin:0 0 6px 3px">Otteluohjelmaa ei saatu (${esc(failReason)}) — nuolet siirtyvät vuorokauden kerrallaan.</div>`
      : '';

  return `<div class="day-nav" style="display:flex;gap:5px;align-items:stretch;margin:0 0 6px 0">${bar}</div>${warn}`;
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
          const p = m.status === 'upcoming' ? previewFor(m) : null;
          return `<div style="display:grid;grid-template-columns:1fr auto;gap:8px;font-size:.66rem;padding:3px 0;border-bottom:1px dashed oklch(1 1 0/0.07)">
            <span>${esc(m.home)} – ${esc(m.away)}</span>${result}${p ? previewRow(p) : ''}
          </div>`;
        })
        .join('');
      return `<div style="margin-top:7px"><div style="font-size:.62rem;font-weight:700;color:var(--c-text-muted);letter-spacing:.03em">${esc(league)}</div>${rows}</div>`;
    })
    .join('');

  // Teksti kertoo mita listalla OIKEASTI on. Aiemmin se vaitti aina "ilman
  // julkaistuja kertoimia", mika oli vaara niille otteluille joille kertoimet
  // on olemassa muttei tallessa kortiksi asti -- kayttaja luki siita ettei
  // dataa ollut, vaikka sita oli.
  const withPreview = list.filter((m) => m.status === 'upcoming' && previewFor(m)).length;
  const withOdds = list.filter((m) => m.has_odds).length;
  const caption =
    withOdds === 0
      ? 'Kertoimia ei ole vielä julkaistu näille. Ne ilmestyvät lähempänä ottelua.'
      : withOdds === list.length
        ? 'Kertoimet on haettu, mutta analyysia ei ole arkistoitu näille otteluille.'
        : `${list.length - withOdds} odottaa kertoimia · ${withOdds} haettu muttei arkistoitu.`;

  return `<div class="card">
    <div style="font-size:.72rem;font-weight:700">📋 Otteluohjelma</div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:2px">
      ${list.length} ottelua. ${esc(caption)}
    </div>
    ${
      withPreview
        ? `<div style="font-size:.58rem;color:var(--c-text-muted);margin-top:3px">
             📐 ${withPreview} ottelulle mallin arvio. Se kertoo mitä malli odottaa — EI sitä kannattaako vetoa lyödä,
             koska ilman kerrointa odotusarvoa ei voi laskea.
           </div>`
        : ''
    }
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
    calendarMatch,
    getCalendar,
    loadPreviews,
    previewFor,
  };
}
