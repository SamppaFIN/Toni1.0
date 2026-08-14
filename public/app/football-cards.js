// Tiketti #30: Jalkapallo-ottelukortin renderöinti
//
// Kortti näyttää kolme asiaa jotka käyttäjä pyysi, kolmena avattavana osiona:
//   📊 Tunnusluvut — sarjasija, form, maalit per peli, koti/vieras, H2H
//   📰 Uutiset     — otteluun liittyvät uutiset lähteineen
//   💎 Analyysi    — marginaali, malli vs markkina, edge, Kelly-panos, kaavat
//
// Kaikki luvut tulevat valmiiksi laskettuna snapshotista. Kortti ei laske
// analytiikkaa uudelleen: yksi totuus, sama luku lokissa ja ruudulla.

import {
  pct,
  num,
  fairOdds,
  kickoffLabel,
  timeUntil,
  esc,
  FLAG_META,
  SIDE_LABELS,
  METHOD_LABELS,
  bestEdge,
} from './snapshot.js';

/** Joukkueen logo värillisenä ympyränä — sama tyyli kuin jääkiekkopuolella */
function teamLogo(team, size = 26) {
  return `<span class="team-logo" style="background:${esc(team.color)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px" title="${esc(team.name)}">${esc(team.short)}</span>`;
}

/** Kertoimet toimisto per rivi, paras korostettuna */
function oddsTable(match, index) {
  if (!match.odds?.length) return '<div class="empty" style="font-size:.7rem">Ei kertoimia</div>';

  const head = `<div class="odds-row odds-head"><span>Toimisto</span><span>1</span><span>X</span><span>2</span></div>`;

  const rows = match.odds
    .map((row) => {
      const cell = (side) => {
        const value = row[side];
        const isBest = match.best[`${side}_book`] === row.bookmaker && Math.abs(match.best[side] - value) < 1e-9;
        // Pörssin komissio näkyy vihjeessä: näytetty hinta ei ole se mitä veto maksaa
        const commissionNote = row.commission > 0 ? ` — pörssin komissio ${(row.commission * 100).toFixed(1)} %` : '';
        return `<button class="bk-odds${isBest ? ' best' : ''}" onclick="event.stopPropagation();window.BTF.openBetPopup('${esc(match.id)}','${side}',${value},'${esc(row.bookmaker)}')" title="${esc(row.bookmaker)} — ${SIDE_LABELS[side]} ${value.toFixed(2)}${isBest ? ' (paras)' : ''}${commissionNote}">${value.toFixed(2)}${isBest ? ' ⭐' : ''}</button>`;
      };
      return `<div class="odds-row"><span class="bk-name" title="${esc(row.bookmaker)}">${esc(row.bookmaker)}</span>${cell('home')}${cell('draw')}${cell('away')}</div>`;
    })
    .join('');

  return `<div class="odds-list">${head}${rows}</div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:4px">👆 Klikkaa kerrointa asettaaksesi vedon · ⭐ paras hinta komission jälkeen</div>
    <div id="fbetpop-${index}" style="display:none;margin-top:4px"></div>`;
}

/** Mallin todennäköisyydet palkkina */
function probBar(probs) {
  const h = (probs.home * 100).toFixed(0);
  const d = (probs.draw * 100).toFixed(0);
  const a = (probs.away * 100).toFixed(0);
  return `<div class="progress-bar"><span class="progress-fill fill-home" style="width:${h}%"></span><span class="progress-fill fill-draw" style="width:${d}%"></span><span class="progress-fill fill-away" style="width:${a}%"></span></div>`;
}

// ─── Osio: Tunnusluvut ────────────────────────────────────────────────────

function statRow(label, homeValue, awayValue) {
  return `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;font-size:.7rem;padding:3px 0;border-bottom:1px dashed oklch(1 1 0/0.07)">
    <span style="text-align:right;font-weight:600">${homeValue}</span>
    <span style="color:var(--c-text-muted);font-size:.65rem;min-width:96px;text-align:center">${label}</span>
    <span style="font-weight:600">${awayValue}</span>
  </div>`;
}

function formBadges(form) {
  if (!form) return '<span style="color:var(--c-text-muted)">—</span>';
  const colors = { W: 'var(--c-success)', D: 'var(--c-warning)', L: 'var(--c-danger)' };
  return form
    .split('')
    .map((r) => `<span style="display:inline-block;width:14px;height:14px;line-height:14px;text-align:center;border-radius:3px;background:${colors[r] || 'var(--c-text-muted)'};color:#000;font-size:.55rem;font-weight:700;margin-right:2px">${r}</span>`)
    .join('');
}

function statsSection(match) {
  if (!match.stats) {
    return `<div style="font-size:.7rem;color:var(--c-text-muted);padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
      Tälle sarjalle ei ole ilmaista tunnuslukulähdettä, joten joukkuetilastoja ei näytetä.
      Analyysi nojaa pelkkään kerroinvertailuun — ks. 💎 Analyysi.
    </div>`;
  }

  const h = match.stats.home;
  const a = match.stats.away;
  const rows = [
    statRow('sarjasija', h.rank ?? '—', a.rank ?? '—'),
    statRow('pelatut', h.played, a.played),
    statRow('pisteet / peli', num(h.ppg), num(a.ppg)),
    statRow('maalit / peli', num(h.gf_pg), num(a.gf_pg)),
    statRow('päästetyt / peli', num(h.ga_pg), num(a.ga_pg)),
  ];
  if (h.home_gf_pg !== null || a.away_gf_pg !== null) {
    rows.push(statRow('maalit kotona / vieraissa', num(h.home_gf_pg), num(a.away_gf_pg)));
  }
  if (h.form || a.form) rows.push(statRow('viime ottelut', formBadges(h.form), formBadges(a.form)));

  const h2h = match.stats.h2h?.length
    ? `<div style="margin-top:8px;font-size:.68rem"><b>Aiemmat kohtaamiset</b><br>${match.stats.h2h
        .map((g) => `<span style="color:var(--c-text-muted)">${g.date}</span> ${esc(g.score)} <span style="font-size:.6rem;color:var(--c-text-muted)">(${g.venue === 'home' ? 'kotona' : 'vieraissa'})</span>`)
        .join('<br>')}</div>`
    : `<div style="margin-top:8px;font-size:.65rem;color:var(--c-text-muted)">Aiempia kohtaamisia ei vielä haeta (tiketti 29).</div>`;

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;font-size:.7rem;margin-bottom:4px;color:var(--c-text-muted)">
      <span style="text-align:right">${esc(match.home.short)}</span><span></span><span>${esc(match.away.short)}</span>
    </div>
    ${rows.join('')}
    ${h2h}
  </div>`;
}

// ─── Osio: Uutiset ────────────────────────────────────────────────────────

const EVENT_LABELS = {
  injury: '🤕 Loukkaantuminen',
  lineup_change: '🔄 Kokoonpanomuutos',
  transfer: '➡️ Siirto',
  hot_streak: '🔥 Kuuma putki',
  bench: '🪑 Penkitys',
  other: '📄 Muu',
};

function newsSection(match) {
  if (!match.news?.length) {
    return `<div style="font-size:.7rem;color:var(--c-text-muted);padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
      Otteluun liittyviä uutisia ei ole vielä haettu — uutisputki on tiketti 29.
      <br><br>Kun se on käytössä, tähän tulevat otsikot lähteineen ja LLM:n erittelemät tapahtumat
      (loukkaantuminen, kokoonpanomuutos) varmuusarvioineen. Yli 0.7 varmuuden tapahtuma säätää
      mallin maaliodotusta, ja säätö näkyy 💎 Analyysi -osiossa.
    </div>`;
  }

  const items = match.news
    .map((n) => {
      const type = EVENT_LABELS[n.event_type] ?? '📄';
      const confidence = n.confidence !== null ? `<span class="badge ${n.confidence > 0.7 ? 'badge-green' : 'badge-muted'}" style="font-size:.5rem">varmuus ${(n.confidence * 100).toFixed(0)} %</span>` : '';
      return `<div style="padding:6px 0;border-bottom:1px dashed oklch(1 1 0/0.08)">
        <div style="font-size:.7rem;line-height:1.4"><a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:var(--c-accent);text-decoration:none">${esc(n.title)}</a></div>
        <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:2px">${type}${n.team ? ` · ${esc(n.team)}` : ''}${n.player ? ` · ${esc(n.player)}` : ''} · ${esc(n.source)} ${confidence}</div>
        ${n.impact ? `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:2px"><i>${esc(n.impact)}</i></div>` : ''}
      </div>`;
    })
    .join('');

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">${items}</div>`;
}

// ─── Osio: Analyysi ───────────────────────────────────────────────────────

function edgeCard(edge, match) {
  const meta = FLAG_META[edge.flag];
  const color = edge.edge > 0.05 ? 'var(--c-success)' : edge.edge > 0.03 ? 'var(--c-warning)' : edge.edge > 0 ? 'var(--c-text-muted)' : 'var(--c-danger)';
  const label = edge.side === 'home' ? match.home.short : edge.side === 'away' ? match.away.short : 'Tasapeli';

  // Komissio näytetään vain kun se muuttaa hintaa — muuten se on melua
  const commissionRow =
    Math.abs(edge.odds - edge.odds_effective) > 0.005
      ? `<div style="font-size:.55rem;color:var(--c-warning)">komission jälkeen ${edge.odds_effective.toFixed(2)}</div>`
      : '';

  const stakeRow =
    edge.stake_suggestion > 0
      ? `<div style="font-size:.6rem;margin-top:3px;color:var(--c-success);font-weight:700">panos ${edge.stake_suggestion.toFixed(2)} €</div>`
      : '';

  return `<div style="padding:6px 4px;border-radius:6px;background:oklch(1 1 0/0.06);text-align:center">
    <div style="font-size:.6rem;color:var(--c-text-muted)">${SIDE_LABELS[edge.side]} · ${esc(label)}</div>
    <div style="font-weight:800;font-size:.85rem">${edge.odds.toFixed(2)}</div>
    ${commissionRow}
    <div style="font-size:.55rem;color:var(--c-text-muted)">${esc(edge.book ?? '')}</div>
    <div style="font-size:.55rem;color:var(--c-text-muted);margin-top:3px">reilu ${fairOdds(edge.model_prob)}</div>
    <div style="font-weight:700;font-size:.72rem;color:${color}">${meta.icon} ${edge.edge > 0 ? '+' : ''}${(edge.edge * 100).toFixed(1)} %</div>
    ${stakeRow}
  </div>`;
}

function analysisSection(match) {
  const method = METHOD_LABELS[match.model.method] ?? { short: match.model.method, long: '' };
  const hasPoisson = match.model.poisson_probs !== null;

  // Malli vs markkina rinnakkain — tämä on koko analyysin ydin
  const compare = ['home', 'draw', 'away']
    .map((side) => {
      const model = match.model.probs[side];
      const market = match.market.implied[side];
      const diff = model - market;
      const poisson = hasPoisson ? match.model.poisson_probs[side] : null;
      return `<div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr auto;gap:4px;font-size:.65rem;padding:2px 0;align-items:center">
        <span style="font-weight:700;width:14px">${SIDE_LABELS[side]}</span>
        <span style="color:var(--c-text-muted)">${poisson !== null ? pct(poisson, 0) : '—'}</span>
        <span style="color:var(--c-text-muted)">${pct(market, 0)}</span>
        <span style="font-weight:700">${pct(model, 0)}</span>
        <span style="color:${diff > 0 ? 'var(--c-success)' : 'var(--c-danger)'};font-size:.6rem">${diff > 0 ? '+' : ''}${(diff * 100).toFixed(1)}</span>
      </div>`;
    })
    .join('');

  const goalMarkets = hasPoisson
    ? `<div style="margin-top:8px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.1)">
        <div style="font-size:.68rem;font-weight:700;margin-bottom:3px">⚽ Maalimarkkinat</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.65rem">
          <div>Yli 2.5 maalia: <b>${pct(match.model.over25)}</b> <span style="color:var(--c-text-muted)">(reilu ${fairOdds(match.model.over25)})</span></div>
          <div>Molemmat maalin: <b>${pct(match.model.btts)}</b> <span style="color:var(--c-text-muted)">(reilu ${fairOdds(match.model.btts)})</span></div>
        </div>
        <div style="font-size:.65rem;margin-top:4px">Odotetut maalit: <b>${num(match.model.lambda_home)}</b> − <b>${num(match.model.lambda_away)}</b></div>
        <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:3px">Todennäköisimmät tulokset: ${match.model.top_scores
          .slice(0, 5)
          .map((s) => `<b>${esc(s.score)}</b> ${pct(s.p, 0)}`)
          .join(' · ')}</div>
      </div>`
    : '';

  const adjustments = match.model.adjustments?.length
    ? `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:6px">${match.model.adjustments.map((a) => `⚙️ ${esc(a.reason)}`).join('<br>')}</div>`
    : '';

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
    <div style="font-size:.68rem;margin-bottom:6px">
      <b>Malli:</b> ${esc(method.short)}
      <div style="color:var(--c-text-muted);font-size:.62rem;margin-top:2px">${esc(method.long)}</div>
    </div>

    <div style="display:grid;grid-template-columns:auto 1fr 1fr 1fr auto;gap:4px;font-size:.58rem;color:var(--c-text-muted);border-bottom:1px solid oklch(1 1 0/0.1);padding-bottom:2px">
      <span style="width:14px"></span><span>Poisson</span><span>markkina</span><span>malli</span><span>ero</span>
    </div>
    ${compare}

    <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:6px">
      Markkinan kate <b>${pct(match.market.margin, 2)}</b> · ankkuri <b>${esc(match.market.sharp_source ?? '—')}</b>
      ${match.model.blend_weight > 0 && match.model.blend_weight < 1 ? ` · oman mallin paino <b>${(match.model.blend_weight * 100).toFixed(0)} %</b>` : ''}
    </div>

    ${goalMarkets}

    <div style="margin-top:8px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.1)">
      <div style="font-size:.68rem;font-weight:700;margin-bottom:4px">💰 Edge ja panossuositus</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px">${match.analysis.edges.map((e) => edgeCard(e, match)).join('')}</div>
      <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:5px;line-height:1.6">
        <b>Edge = mallin todennäköisyys × kerroin − 1.</b> Lasketaan parhaasta hinnasta komission jälkeen.<br>
        🟡 yli 3 % kandidaatti · 💎 yli 5 % vahva signaali · alle 3 % ei panossuositusta, koska ero on mallin virherajojen sisällä.<br>
        Panos on murto-Kelly (25 %) katolla 2 % kassasta. Laskettu ${match.analysis.bankroll_basis.toFixed(0)} €:n kassalla.
      </div>
    </div>

    ${adjustments}
  </div>`;
}

// ─── Kortti ───────────────────────────────────────────────────────────────

const SECTIONS = {
  stats: { icon: '📊', label: 'Tunnusluvut', render: statsSection },
  news: { icon: '📰', label: 'Uutiset', render: newsSection },
  analysis: { icon: '💎', label: 'Analyysi', render: analysisSection },
};

/** Avoimet osiot pidetään muistissa, jotta uudelleenrenderöinti ei sulje niitä */
const openSections = new Map();

export function toggleSection(index, key) {
  const current = openSections.get(index);
  openSections.set(index, current === key ? null : key);
  renderAllCards();
}

function sectionButtons(match, index) {
  const open = openSections.get(index);
  const buttons = Object.entries(SECTIONS)
    .map(([key, s]) => {
      const count = key === 'news' ? match.news?.length ?? 0 : null;
      const active = open === key;
      return `<button class="btn" style="flex:1;font-size:.62rem;padding:5px 4px;min-height:32px;border-radius:6px;background:${active ? 'var(--c-accent)' : 'oklch(1 1 0/0.08)'};color:${active ? '#000' : 'var(--c-text)'};font-weight:${active ? 700 : 500}" onclick="event.stopPropagation();window.BTF.toggleSection(${index},'${key}')">${s.icon} ${s.label}${count ? ` (${count})` : ''}</button>`;
    })
    .join('');

  const body = open ? `<div style="margin-top:6px">${SECTIONS[open].render(match)}</div>` : '';
  return `<div style="display:flex;gap:4px;margin-top:8px">${buttons}</div>${body}`;
}

function matchCard(match, index) {
  const best = bestEdge(match);
  const flag = best && best.flag !== 'none' ? FLAG_META[best.flag] : null;
  const flagBadge = flag
    ? `<span class="badge ${flag.badge}" title="${flag.label}: ${SIDE_LABELS[best.side]} @ ${best.odds.toFixed(2)} (${esc(best.book ?? '')})">${flag.icon} ${(best.edge * 100).toFixed(1)} %</span>`
    : '';

  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:.62rem;color:var(--c-text-muted)">
      <span>${esc(match.league)} · ${kickoffLabel(match.kickoff)}</span>
      <span>${timeUntil(match.kickoff)}</span>
    </div>

    <div class="row" style="margin-top:5px">
      <span class="matchup">${teamLogo(match.home)}<strong>${esc(match.home.name)}</strong><span class="vs">–</span><strong>${esc(match.away.name)}</strong>${teamLogo(match.away)}</span>
      ${flagBadge}
    </div>

    <div style="font-size:.65rem;margin-top:5px;color:var(--c-text-muted)">
      Malli: <b style="color:var(--c-text)">${pct(match.model.probs.home, 0)}</b> / <b style="color:var(--c-text)">${pct(match.model.probs.draw, 0)}</b> / <b style="color:var(--c-text)">${pct(match.model.probs.away, 0)}</b>
    </div>
    ${probBar(match.model.probs)}

    ${oddsTable(match, index)}
    ${sectionButtons(match, index)}
    <div id="fbets-${index}" style="margin-top:4px"></div>
  </div>`;
}

// ─── Näkymä ───────────────────────────────────────────────────────────────

let currentSnapshot = null;
let currentError = null;
let container = null;

export function initCards(el) {
  container = el;
}

export function setSnapshot(snapshot, error) {
  currentSnapshot = snapshot;
  currentError = error;
  openSections.clear();
}

export function getSnapshot() {
  return currentSnapshot;
}

/** Snapshotin tila ja lähteet — käyttäjän pitää tietää mistä luvut tulevat */
function sourceBanner(snapshot) {
  const isMock = snapshot.source === 'mock';
  const ageMin = Math.round((Date.now() - Date.parse(snapshot.generated_at)) / 60000);
  const stale = ageMin > 240;

  const warning = isMock
    ? `<div class="badge badge-yellow" style="font-size:.55rem">ESIMERKKIDATA</div>`
    : stale
      ? `<div class="badge badge-yellow" style="font-size:.55rem">VANHENTUNUT</div>`
      : `<div class="badge badge-green" style="font-size:.55rem">OIKEAT KERTOIMET</div>`;

  const note = isMock
    ? 'Nämä eivät ole oikeita kertoimia. Aja <code>npm run snapshot:live</code> hakeaksesi oikeat.'
    : stale
      ? `Kertoimet haettu ${ageMin} min sitten — ne ovat todennäköisesti liikkuneet. Aja putki uudelleen.`
      : `Kertoimet haettu ${ageMin} min sitten.`;

  return `<div class="card" style="border:1px solid ${isMock || stale ? 'var(--c-warning)' : 'oklch(0.62 0.20 145 / 0.4)'}">
    <div class="row"><strong style="font-size:.8rem">⚽ Päivän kohteet</strong>${warning}</div>
    <div style="font-size:.62rem;color:var(--c-text-muted);margin-top:4px">${note}</div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:3px">Lähteet: ${(snapshot.providers ?? []).map(esc).join(' · ') || '—'}</div>
  </div>`;
}

export function renderAllCards() {
  if (!container) return;

  if (currentError || !currentSnapshot) {
    container.innerHTML = `<div class="card" style="border:1px solid var(--c-danger)">
      <strong style="font-size:.8rem">⚠️ Kohteita ei voitu ladata</strong>
      <div style="font-size:.68rem;color:var(--c-text-muted);margin-top:6px">${esc(currentError ?? 'Tuntematon virhe')}</div>
      <div style="font-size:.65rem;color:var(--c-text-muted);margin-top:8px">
        Hae päivän kohteet ajamalla projektin juuressa:<br>
        <code style="font-size:.7rem;color:var(--c-accent)">npm run snapshot:live</code><br><br>
        Ilman API-avaimia esimerkkidatan saa komennolla:<br>
        <code style="font-size:.7rem;color:var(--c-accent)">npm run snapshot:mock</code>
      </div>
    </div>`;
    return;
  }

  if (!currentSnapshot.matches.length) {
    container.innerHTML = `${sourceBanner(currentSnapshot)}<div class="empty">Ei otteluita aikaikkunassa.</div>`;
    return;
  }

  // Value-kohteet ensin, sitten aikajärjestyksessä — käyttäjä näkee löydöt heti
  const ordered = [...currentSnapshot.matches].map((m, i) => ({ m, i })).sort((a, b) => {
    const ea = bestEdge(a.m)?.edge ?? -1;
    const eb = bestEdge(b.m)?.edge ?? -1;
    const flagged = (e) => (e > 0.03 ? 1 : 0);
    if (flagged(eb) !== flagged(ea)) return flagged(eb) - flagged(ea);
    return Date.parse(a.m.kickoff) - Date.parse(b.m.kickoff);
  });

  const flaggedCount = currentSnapshot.matches.filter((m) => (bestEdge(m)?.edge ?? 0) > 0.03).length;
  const summary = `<div style="font-size:.65rem;color:var(--c-text-muted);margin:0 0 8px 2px">
    ${currentSnapshot.matches.length} ottelua · ${flaggedCount ? `<b style="color:var(--c-success)">${flaggedCount} value-kohdetta</b>` : 'ei value-kohteita — markkina on tiukka'}
  </div>`;

  container.innerHTML = sourceBanner(currentSnapshot) + summary + ordered.map(({ m, i }) => matchCard(m, i)).join('');
  renderPlacedBets();
}

/** Näytä tälle ottelulle asetetut vedot kortin alaosassa */
export function renderPlacedBets() {
  if (!currentSnapshot) return;
  const bets = window.BT?.getBets?.() ?? [];

  currentSnapshot.matches.forEach((match, index) => {
    const el = document.getElementById(`fbets-${index}`);
    if (!el) return;
    const mine = bets.filter((b) => b.game_id === match.id);
    el.innerHTML = mine.length
      ? `<div style="padding-top:4px;border-top:1px dashed oklch(1 1 0/0.12);font-size:.65rem">${mine
          .map((b) => {
            const label = b.side === 'home' ? match.home.short : b.side === 'away' ? match.away.short : 'Tasapeli';
            return `<div class="row"><span>🎫 ${esc(label)} ${b.stake.toFixed(0)} € @ ${b.odds.toFixed(2)}${b.bookmaker ? ` · ${esc(b.bookmaker)}` : ''}</span><span style="color:var(--c-success)">→ ${(b.stake * b.odds).toFixed(2)} €</span></div>`;
          })
          .join('')}</div>`
      : '';
  });
}

export function findMatch(id) {
  return currentSnapshot?.matches.find((m) => m.id === id) ?? null;
}

export function matchIndex(id) {
  return currentSnapshot?.matches.findIndex((m) => m.id === id) ?? -1;
}
