// Tiketti #32: Jalkapallon päiväsimulaatio
//
// KESKEINEN SUUNNITTELURATKAISU: simulaatio arpoo lopputuloksen kortilla
// näkyvistä mallin todennäköisyyksistä, ei λ-arvoista suoraan.
//
// Miksi: kortti näyttää blendatun mallin (Poisson + markkina), esim. 74/16/10.
// Jos simulaatio arpoisi maalit pelkästä λ:sta, pitkällä aikavälillä
// kotivoittoja tulisi Poissonin osuudella (esim. 77 %) eikä sen mitä kortti
// lupasi. Käyttäjä ei voisi luottaa kumpaankaan lukuun.
//
// Siksi: 1) arvo lopputulos mallin todennäköisyyksillä
//        2) arvo maalimäärä λ:sta ehdolla että lopputulos täsmää
// Näin tulokset ja näytetyt todennäköisyydet ovat samaa mieltä.
//
// EI keksittyjä maalintekijöitä. Kokoonpanodataa ei ole ilmaistasolla, ja
// tekaistu "Ville Virtanen 34'" näyttäisi oikealta datalta. Maali kirjataan
// joukkueelle ja minuutille.

import { esc, pct, num } from './snapshot.js';

/** Simulaation kesto sekunteina ja tikin pituus millisekunteina */
const DURATION_S = 20;
const TICK_MS = 200;
const TOTAL_TICKS = (DURATION_S * 1000) / TICK_MS;

/** Sarjan tyypilliset λ-arvot kun ottelulla ei ole omaa mallia (market-only) */
const FALLBACK_LAMBDA = { home: 1.45, away: 1.15 };

// ─── Satunnaisluvut ───────────────────────────────────────────────────────

/** Poisson-arvonta (Knuth). Pieni λ → nopea. */
function poissonSample(lambda) {
  if (lambda <= 0) return 0;
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > limit);
  return k - 1;
}

/** Arvo yksi vaihtoehto painotetusta jakaumasta */
function weightedPick(weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (const [key, w] of Object.entries(weights)) {
    r -= w;
    if (r <= 0) return key;
  }
  return Object.keys(weights)[0];
}

/**
 * Maalimäärät ehdolla että lopputulos on annettu.
 *
 * Hylkäysotanta: arvotaan λ:sta kunnes lopputulos täsmää. Epätodennäköisillä
 * lopputuloksilla (esim. altavastaajan voitto) tämä voi vaatia satoja
 * kierroksia, siksi yläraja ja varasuunnitelma.
 */
function sampleScoreline(lambdaHome, lambdaAway, outcome, maxTries = 600) {
  for (let i = 0; i < maxTries; i++) {
    const h = poissonSample(lambdaHome);
    const a = poissonSample(lambdaAway);
    const result = h > a ? 'home' : h < a ? 'away' : 'draw';
    if (result === outcome) return { home: h, away: a };
  }

  // Varasuunnitelma: rakenna pienin lopputulokseen sopiva tulos
  if (outcome === 'draw') {
    const n = poissonSample((lambdaHome + lambdaAway) / 2);
    return { home: n, away: n };
  }
  const winner = Math.max(1, poissonSample(outcome === 'home' ? lambdaHome : lambdaAway));
  const loser = Math.floor(Math.random() * winner);
  return outcome === 'home' ? { home: winner, away: loser } : { home: loser, away: winner };
}

// ─── Ottelun simulointi ───────────────────────────────────────────────────

/**
 * Simuloi yksi ottelu kokonaan. Palauttaa lopputuloksen ja tapahtumat
 * minuutteineen; aikajana toistetaan sen jälkeen tikittäin.
 */
export function simulateMatch(match) {
  const lambdaHome = match.model.lambda_home ?? FALLBACK_LAMBDA.home;
  const lambdaAway = match.model.lambda_away ?? FALLBACK_LAMBDA.away;

  // 1) Lopputulos kortilla näkyvistä todennäköisyyksistä
  const outcome = weightedPick({
    home: match.model.probs.home,
    draw: match.model.probs.draw,
    away: match.model.probs.away,
  });

  // 2) Maalimäärä λ:sta ehdolla että lopputulos täsmää
  const score = sampleScoreline(lambdaHome, lambdaAway, outcome);

  // Lisäajat
  const addedFirst = 1 + Math.floor(Math.random() * 3);
  const addedSecond = 2 + Math.floor(Math.random() * 4);

  const events = [];

  // Maaliminuutit. Jalkapallossa maaleja tulee hieman enemmän loppua kohti,
  // siksi lievä painotus jälkimmäiselle puoliajalle.
  const goalMinute = () => (Math.random() < 0.55 ? 46 + Math.floor(Math.random() * 45) : 1 + Math.floor(Math.random() * 45));
  for (let i = 0; i < score.home; i++) events.push({ type: 'goal', side: 'home', minute: goalMinute() });
  for (let i = 0; i < score.away; i++) events.push({ type: 'goal', side: 'away', minute: goalMinute() });

  // Kortit: keltaisia ~3–5 per ottelu, punainen harvoin
  const yellows = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < yellows; i++) {
    events.push({ type: 'yellow', side: Math.random() < 0.5 ? 'home' : 'away', minute: 1 + Math.floor(Math.random() * 90) });
  }
  if (Math.random() < 0.22) {
    events.push({ type: 'red', side: Math.random() < 0.5 ? 'home' : 'away', minute: 40 + Math.floor(Math.random() * 50) });
  }

  events.sort((a, b) => a.minute - b.minute);

  // Kulmat ja xG korreloivat maalimäärään mutta eivät ole sama asia
  const corners = {
    home: 3 + Math.floor(Math.random() * 5) + score.home,
    away: 2 + Math.floor(Math.random() * 5) + score.away,
  };
  const xg = {
    home: Math.max(0.2, lambdaHome + (Math.random() - 0.5) * 0.9),
    away: Math.max(0.2, lambdaAway + (Math.random() - 0.5) * 0.9),
  };

  // Mallin todennäköisin lopputulos talteen, jotta raportti voi verrata
  // ennustetta toteumaan. Huom: tämä EI ole sama kuin arvottu `outcome` —
  // malli voi ennustaa kotivoiton ja arpa antaa tasapelin, aivan kuten oikeassa
  // ottelussa 74 %:n suosikki häviää joka neljäs kerta.
  const predicted = Object.entries(match.model.probs).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  return {
    matchId: match.id,
    home: match.home,
    away: match.away,
    league: match.league,
    finalScore: score,
    outcome,
    predicted,
    modelProbs: match.model.probs,
    events,
    corners,
    xg,
    addedFirst,
    addedSecond,
    // Sivumarkkinoiden toteuma — näillä näkee osuiko mallin arvio
    over25: score.home + score.away > 2.5,
    btts: score.home > 0 && score.away > 0,
    simulated: true,
  };
}

/** Ottelun tila tiettynä minuuttina */
function stateAtMinute(sim, minute) {
  const seen = sim.events.filter((e) => e.minute <= minute);
  return {
    home: seen.filter((e) => e.type === 'goal' && e.side === 'home').length,
    away: seen.filter((e) => e.type === 'goal' && e.side === 'away').length,
    events: seen,
    yellows: {
      home: seen.filter((e) => e.type === 'yellow' && e.side === 'home').length,
      away: seen.filter((e) => e.type === 'yellow' && e.side === 'away').length,
    },
    reds: {
      home: seen.filter((e) => e.type === 'red' && e.side === 'home').length,
      away: seen.filter((e) => e.type === 'red' && e.side === 'away').length,
    },
  };
}

// ─── Ajastus ──────────────────────────────────────────────────────────────

let timer = null;
let sims = [];
let currentMinute = 0;
let finished = false;

export function isRunning() {
  return timer !== null;
}

export function getSims() {
  return sims;
}

export function isFinished() {
  return finished;
}

export function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

/** Nollaa koko simulaatiotila — käytetään "Aloita alusta" -napissa */
export function clear() {
  stop();
  sims = [];
  currentMinute = 0;
  finished = false;
}

/**
 * Käynnistä päivän simulaatio.
 * @param matches snapshotin ottelut
 * @param onTick  kutsutaan joka tikillä (minuutti, tilat)
 * @param onDone  kutsutaan kun 90+ minuuttia on pelattu
 */
export function start(matches, onTick, onDone) {
  stop();
  sims = matches.map(simulateMatch);
  currentMinute = 0;
  finished = false;

  const maxMinute = 90 + Math.max(...sims.map((s) => s.addedSecond));
  const minutesPerTick = maxMinute / TOTAL_TICKS;
  let tick = 0;
  const notified = new Set();

  timer = setInterval(() => {
    tick++;
    currentMinute = Math.min(maxMinute, Math.round(tick * minutesPerTick));

    // Ilmoita uusista maaleista, jotta pikavedot ratkeavat ajallaan
    const newGoals = [];
    for (const sim of sims) {
      for (const e of sim.events) {
        if (e.type !== 'goal' || e.minute > currentMinute) continue;
        const key = `${sim.matchId}:${e.minute}:${e.side}`;
        if (notified.has(key)) continue;
        notified.add(key);
        newGoals.push({ sim, event: e });
      }
    }

    onTick(currentMinute, sims.map((s) => ({ sim: s, state: stateAtMinute(s, currentMinute) })), newGoals);

    if (tick >= TOTAL_TICKS) {
      stop();
      finished = true;
      onDone(sims);
    }
  }, TICK_MS);
}

export function minuteLabel(minute, sim) {
  if (minute > 90) return `90+${minute - 90}'`;
  if (minute === 45) return `45+${sim.addedFirst}'`;
  return `${minute}'`;
}

// ─── Renderöinti ──────────────────────────────────────────────────────────

const EVENT_ICONS = { goal: '⚽', yellow: '🟨', red: '🟥' };

function eventList(sim, state) {
  if (!state.events.length) return '';
  return `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:5px;line-height:1.7">${state.events
    .map((e) => `${EVENT_ICONS[e.type]} ${e.minute}' ${esc(e.side === 'home' ? sim.home.short : sim.away.short)}`)
    .join(' · ')}</div>`;
}

/** Yksi ottelukortti simulaation aikana tai sen jälkeen */
export function renderSimCard(sim, state, minute, live) {
  const period = !live ? 'Päättyi' : minute <= 45 ? '1. puoliaika' : minute >= 90 ? 'Lisäaika' : '2. puoliaika';
  const clock = live ? `<span style="color:var(--c-accent);font-weight:600">⏱️ ${minuteLabel(minute, sim)} · ${period}</span>` : `<span style="color:var(--c-text-muted)">${period}</span>`;

  const cards = [];
  if (state.yellows.home + state.yellows.away > 0) cards.push(`🟨 ${state.yellows.home}–${state.yellows.away}`);
  if (state.reds.home + state.reds.away > 0) cards.push(`🟥 ${state.reds.home}–${state.reds.away}`);

  return `<div class="card">
    <div class="row" style="font-size:.6rem;color:var(--c-text-muted)">
      <span>${esc(sim.league)}</span>
      <span>${clock} <span class="badge badge-yellow" style="font-size:.5rem">SIMULOITU</span></span>
    </div>
    <div class="row" style="margin-top:4px">
      <span style="font-size:.8rem;font-weight:600">${esc(sim.home.name)}</span>
      <span style="font-size:1.25rem;font-weight:800;font-variant-numeric:tabular-nums">${state.home} – ${state.away}</span>
      <span style="font-size:.8rem;font-weight:600">${esc(sim.away.name)}</span>
    </div>
    ${eventList(sim, state)}
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:4px">
      kulmat ${sim.corners.home}–${sim.corners.away} · xG ${num(sim.xg.home, 1)}–${num(sim.xg.away, 1)}${cards.length ? ` · ${cards.join(' ')}` : ''}
    </div>
    <div id="fsim-bets-${esc(sim.matchId)}"></div>
  </div>`;
}

/** Kierrosraportti: ennuste vs toteuma per ottelu */
export function renderReport(sims, settled) {
  const total = settled.length;
  const won = settled.filter((b) => b.won).length;
  const profit = settled.reduce((sum, b) => sum + (b.won ? b.stake * b.odds - b.stake : -b.stake), 0);

  const betRows = settled.length
    ? `<div style="margin-top:8px;padding-top:6px;border-top:1px solid oklch(1 1 0/0.1)">
        <div style="font-size:.72rem;font-weight:700;margin-bottom:4px">🎫 Vetojen tulokset</div>
        ${settled
          .map(
            (b) => `<div style="padding:4px 0;border-bottom:1px dashed oklch(1 1 0/0.08)">
              <div class="row" style="font-size:.68rem">
                <span><b>Odotus:</b> ${esc(b.sideLabel)} (${b.stake.toFixed(2)} € @ ${b.odds.toFixed(2)})</span>
                <span style="font-weight:700;color:${b.won ? 'var(--c-success)' : 'var(--c-danger)'}">${b.won ? `✅ +${(b.stake * b.odds - b.stake).toFixed(2)} €` : '❌ 0 €'}</span>
              </div>
              <div style="font-size:.6rem;color:var(--c-text-muted)"><b>Toteuma:</b> ${esc(b.resultLabel)}</div>
            </div>`
          )
          .join('')}
        <div class="row" style="margin-top:6px;font-weight:700;font-size:.72rem">
          <span>${won}/${total} osumaa (${total ? ((won / total) * 100).toFixed(0) : 0} %)</span>
          <span style="color:${profit >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${profit >= 0 ? '+' : ''}${profit.toFixed(2)} €</span>
        </div>
      </div>`
    : `<div style="font-size:.65rem;color:var(--c-text-muted);margin-top:6px">Et asettanut vetoja tälle kierrokselle.</div>`;

  // Mallin osumatarkkuus tässä kierroksessa — huom: simuloitua, ei oikeaa
  const modelHits = sims.filter((s) => s.outcome === s.predicted).length;

  const results = sims
    .map((s) => {
      const predicted = s.predicted;
      const hit = predicted === s.outcome;
      const label = (side) => (side === 'home' ? s.home.short : side === 'away' ? s.away.short : 'tasapeli');
      return `<div class="row" style="font-size:.66rem;padding:3px 0;border-bottom:1px dashed oklch(1 1 0/0.07)">
        <span>${esc(s.home.short)} ${s.finalScore.home}–${s.finalScore.away} ${esc(s.away.short)}</span>
        <span style="color:var(--c-text-muted)">malli: ${esc(label(predicted))} ${hit ? '✓' : '✗'} · O2.5 ${s.over25 ? 'yli' : 'alle'} · BTTS ${s.btts ? 'kyllä' : 'ei'}</span>
      </div>`;
    })
    .join('');

  return `<div class="card" style="border:2px solid var(--c-accent)">
    <div class="row"><strong style="font-size:.85rem">📋 Kierrosraportti</strong><span class="badge badge-yellow" style="font-size:.5rem">SIMULOITU</span></div>
    <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:3px">
      Nämä ovat arvottuja tuloksia, eivät oikeita. Ne eivät kirjaudu mallin tarkkuustilastoon.
    </div>
    <div style="margin-top:8px">${results}</div>
    <div style="font-size:.66rem;margin-top:6px">Malli osui ${modelHits}/${sims.length} ottelussa <span style="color:var(--c-text-muted)">(simuloitua — yhden kierroksen otos ei kerro mallin laadusta mitään)</span></div>
    ${betRows}
  </div>`;
}
