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
  relativeAge,
  esc,
  FLAG_META,
  SIDE_LABELS,
  METHOD_LABELS,
  bestEdge,
  getDataSource,
  getMockRound,
  getMockRoundCount,
} from './snapshot.js';
import { isVisible } from './football-prefs.js';

/** Joukkueen logo värillisenä ympyränä — sama tyyli kuin jääkiekkopuolella */
function teamLogo(team, size = 26) {
  return `<span class="team-logo" style="background:${esc(team.color)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px" title="${esc(team.name)}">${esc(team.short)}</span>`;
}

/**
 * Kertoimet toimisto per rivi.
 *
 * Kaksi eri asiaa, kaksi eri merkintää — tämä ero on tarkoituksellinen:
 *
 *   ⭐ paras hinta   = pelkkä hintavertailun voittaja. Kertoo mistä veto
 *                      kannattaa lyödä JOS sen lyö. Ei ota kantaa siihen
 *                      onko veto järkevä.
 *   🟡/🟢 väritäyttö = edge ylittää kynnyksen eli odotusarvo on positiivinen.
 *
 * Aiemmin paras hinta sai vihreän taustan, jolloin jokaisella ottelulla oli
 * kolme vihreää ruutua vaikka yksikään ei olisi ollut pelaamisen arvoinen.
 * Vihreä menetti merkityksensä. Nyt väri tarkoittaa aina ylikerrointa.
 */
function oddsTable(match, index) {
  if (!match.odds?.length) return '<div class="empty" style="font-size:.7rem">Ei kertoimia</div>';

  const head = `<div class="odds-row odds-head"><span>Toimisto</span><span>1</span><span>X</span><span>2</span></div>`;
  const edgeBySide = new Map(match.analysis.edges.map((e) => [e.side, e]));

  const rows = match.odds
    .map((row) => {
      const cell = (side) => {
        const value = row[side];
        const isBest = match.best[`${side}_book`] === row.bookmaker && Math.abs(match.best[side] - value) < 1e-9;
        // Edge on laskettu parhaasta hinnasta, joten value-merkintä kuuluu
        // vain sille ruudulle jota luku koskee
        const edge = isBest ? edgeBySide.get(side) : null;
        const valueClass = edge && edge.flag !== 'none' ? ` value-${edge.flag === 'strong' ? 'strong' : 'candidate'}` : '';
        // Pörssin komissio näkyy vihjeessä: näytetty hinta ei ole se mitä veto maksaa
        const commissionNote = row.commission > 0 ? ` — pörssin komissio ${(row.commission * 100).toFixed(1)} %` : '';
        const valueNote = valueClass ? ` — ylikerroin, edge ${(edge.edge * 100).toFixed(1)} %` : '';
        const icon = edge && edge.flag !== 'none' ? ` ${FLAG_META[edge.flag].icon}` : isBest ? ' ⭐' : '';
        return `<button class="bk-odds${isBest ? ' best' : ''}${valueClass}" onclick="event.stopPropagation();window.BTF.openBetPopup('${esc(match.id)}','${side}',${value},'${esc(row.bookmaker)}')" title="${esc(row.bookmaker)} — ${SIDE_LABELS[side]} ${value.toFixed(2)}${isBest ? ' (paras hinta)' : ''}${commissionNote}${valueNote}">${value.toFixed(2)}${icon}</button>`;
      };
      return `<div class="odds-row"><span class="bk-name" title="${esc(row.bookmaker)}">${esc(row.bookmaker)}</span>${cell('home')}${cell('draw')}${cell('away')}</div>`;
    })
    .join('');

  return `<div class="odds-list">${head}${rows}</div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:4px;line-height:1.5">
      👆 Klikkaa kerrointa asettaaksesi vedon<br>
      ⭐ paras hinta komission jälkeen — <i>ei</i> tarkoita että veto kannattaa<br>
      🟡 edge yli 3 % · 💎 edge yli 5 % — vain nämä ovat ylikertoimia
    </div>
    <div id="fbetpop-${index}" style="display:none;margin-top:4px"></div>`;
}

// ─── Elo (tiketti #39) ────────────────────────────────────────────────────

export const ELO_HOME_ADVANTAGE = 55;

/**
 * Elo-eron odotusarvo. Sama kaava kuin analyze/season-elo.ts:n
 * expectedScore + kotietu — pidetään yhdessä rivissä jotta poikkeama
 * palvelinlaskennasta olisi ilmeinen jos joku muuttaa toista.
 *
 * Huom: tämä on kahden tuloksen odotusarvo (voitto = 1, tasapeli = 0.5),
 * EI kotivoiton todennäköisyys. Tasapeli on mukana puolikkaana.
 */
export function eloExpected(homeElo, awayElo, homeAdvantage = ELO_HOME_ADVANTAGE) {
  return 1 / (1 + 10 ** ((awayElo - homeElo - homeAdvantage) / 400));
}

function eloBadge(stats) {
  if (stats?.elo == null) return '<span style="color:var(--c-text-muted)">—</span>';
  const change = stats.elo_change;
  const color = change > 0 ? 'var(--c-success)' : change < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '·';
  const rank = stats.elo_rank ? `<span style="color:var(--c-text-muted);font-size:.55rem"> #${stats.elo_rank}</span>` : '';
  return `<b style="font-variant-numeric:tabular-nums">${stats.elo}</b>${rank} <span style="color:${color};font-size:.58rem">${arrow}${Math.abs(change ?? 0)}</span>`;
}

/** Elo suluissa joukkueen nimen perään — luku siinä missä se koskee joukkuetta */
function eloParen(stats) {
  if (!isVisible('elo') || stats?.elo == null) return '';
  const change = stats.elo_change;
  const color = change > 0 ? 'var(--c-success)' : change < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '·';
  return ` <span style="font-weight:500;font-size:.68rem;color:var(--c-text-muted);font-variant-numeric:tabular-nums" title="Kauden Elo (lähtötaso 1500)${stats.elo_rank ? `, sija #${stats.elo_rank}` : ''}${change != null ? `, muutos kauden alusta ${change > 0 ? '+' : ''}${change}` : ''}">(${stats.elo}<span style="color:${color};font-size:.56rem">${arrow}${Math.abs(change ?? 0)}</span>)</span>`;
}

/** Elo-ero ja siitä johdettu odotusarvo — vertailuluku, ei osa 1X2-mallia */
function eloLine(match) {
  if (!isVisible('elo')) return '';
  const h = match.stats?.home;
  const a = match.stats?.away;
  if (h?.elo == null || a?.elo == null) return '';

  const diff = h.elo - a.elo;
  return `<div style="font-size:.6rem;color:var(--c-text-muted);margin-top:3px">
    📈 Elo-ero <b style="color:${diff > 0 ? 'var(--c-success)' : diff < 0 ? 'var(--c-danger)' : 'var(--c-text)'}">${diff > 0 ? '+' : ''}${diff}</b>
    · kotietu mukaan lukien odotusarvo <b>${(eloExpected(h.elo, a.elo) * 100).toFixed(0)} %</b> kotijoukkueelle
  </div>`;
}

/**
 * Value-tieto joka kortille.
 *
 * Aiemmin tämä oli vain otsikkorivin laskurina ("2 value-kohdetta") ja
 * kortilla pelkkänä prosenttimerkkinä. Kortista ei nähnyt MIKÄ kohde on
 * arvokas ilman että avasi analyysin — ja juuri se on se yksi asia jonka
 * takia korttia katsotaan.
 *
 * Kun kohdetta ei ole, se sanotaan yhtä selvästi. "Ei value-kohdetta" on
 * useimmilla otteluilla oikea vastaus, ja sen näkeminen estää lukemasta
 * parasta hintaa vahingossa suositukseksi.
 */
function valueLine(match) {
  const flagged = match.analysis.edges
    .filter((e) => e.flag !== 'none')
    .sort((a, b) => b.edge - a.edge);

  const name = (side) => (side === 'home' ? match.home.name : side === 'away' ? match.away.name : 'Tasapeli');

  if (!flagged.length) {
    const best = [...match.analysis.edges].sort((a, b) => b.edge - a.edge)[0];
    return `<div style="margin-top:6px;padding:6px 8px;border-radius:7px;background:oklch(1 1 0/0.05);font-size:.63rem;color:var(--c-text-muted);line-height:1.45">
      ⚫ <b>Ei value-kohdetta.</b> Paras edge ${SIDE_LABELS[best.side]} ${esc(name(best.side))} @ ${num(best.odds)}
      = <b>${best.edge > 0 ? '+' : ''}${(best.edge * 100).toFixed(1)} %</b> — jää alle 3 %:n kynnyksen, joten panossuositusta ei anneta.
    </div>`;
  }

  const rows = flagged
    .map((e) => {
      const meta = FLAG_META[e.flag];
      return `<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;flex-wrap:wrap">
        <span>${meta.icon} <b>${SIDE_LABELS[e.side]} ${esc(name(e.side))}</b> @ <b>${num(e.odds)}</b> <span style="color:var(--c-text-muted)">${esc(e.book ?? '')}</span></span>
        <span>edge <b style="color:${e.flag === 'strong' ? 'var(--c-success)' : 'var(--c-warning)'}">+${(e.edge * 100).toFixed(1)} %</b>${e.stake_suggestion > 0 ? ` · panos <b style="color:var(--c-success)">${num(e.stake_suggestion)} €</b>` : ''}</span>
      </div>`;
    })
    .join('');

  const strong = flagged.some((e) => e.flag === 'strong');
  return `<div style="margin-top:6px;padding:6px 8px;border-radius:7px;font-size:.65rem;line-height:1.5;background:${strong ? 'oklch(0.62 0.20 145 / 0.14)' : 'oklch(0.72 0.16 85 / 0.14)'};border:1px solid ${strong ? 'oklch(0.62 0.20 145 / 0.4)' : 'oklch(0.72 0.16 85 / 0.4)'}">
    ${rows}
  </div>`;
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
    statRow('kauden Elo', eloBadge(h), eloBadge(a)),
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
    : `<div style="margin-top:8px;font-size:.65rem;color:var(--c-text-muted)">Aiempia kohtaamisia ei näytetä — sarjataulukko ei sisällä ottelukohtaisia tuloksia.</div>`;

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
      Tähän otteluun ei löytynyt uutisia kuudesta seuratusta lähteestä
      (BBC Sport, The Guardian, ESPN, Iltalehti, Ilta-Sanomat, Yle Urheilu).
      <br><br>Se on tavallista pienemmissä sarjoissa. Uutinen liitetään vain kun
      joukkue mainitaan selvästi jalkapallon yhteydessä — sinnepäin osuva uutinen
      olisi huonompi kuin ei uutista.
    </div>`;
  }

  const items = match.news
    .map((n) => {
      // Tapahtumatyyppi näytetään vain jos se on tunnistettu. Irrallinen
      // yleisikoni ilman merkitystä on pelkkää visuaalista melua.
      const meta = [
        EVENT_LABELS[n.event_type] ?? null,
        n.team ? esc(n.team) : null,
        n.player ? esc(n.player) : null,
        esc(n.source),
        relativeAge(n.published_at),
      ].filter(Boolean);

      // Varmuus näkyy vain kun se ylittää mallivaikutuksen kynnyksen tai on
      // muuten merkityksellinen — matala luku avainsanaosumasta ei kerro mitään
      const confidence =
        n.confidence !== null
          ? `<span class="badge ${n.confidence > 0.7 ? 'badge-green' : 'badge-muted'}" style="font-size:.5rem;margin-left:4px" title="${n.confidence > 0.7 ? 'Vaikuttaa mallin maaliodotukseen' : 'Ei vaikuta malliin — alle 70 %:n kynnys'}">varmuus ${(n.confidence * 100).toFixed(0)} %</span>`
          : '';

      return `<div style="padding:6px 0;border-bottom:1px dashed oklch(1 1 0/0.08)">
        <div style="font-size:.7rem;line-height:1.4"><a href="${esc(n.url)}" target="_blank" rel="noopener" style="color:var(--c-accent);text-decoration:none">${esc(n.title)}</a></div>
        <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:2px">${meta.join(' · ')}${confidence}</div>
        ${n.impact ? `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:2px"><i>${esc(n.impact)}</i></div>` : ''}
      </div>`;
    })
    .join('');

  const windowNote = match.analysis.news_window
    ? `<div style="margin-top:6px;padding:6px;border-radius:6px;background:oklch(0.72 0.16 85 / 0.15);font-size:.62rem">
        ⚡ <b>Uutisikkuna:</b> tuore korkean varmuuden tapahtuma. Markkina ei ole todennäköisesti vielä hinnoitellut sitä.
      </div>`
    : '';

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">${items}${windowNote}</div>`;
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

// ─── Osio: Laskennan vaiheet (tiketti #39) ────────────────────────────────
//
// Käyttäjä pyysi näkyviin kaikkien analyysilaskentojen tulokset. Tämä osio
// näyttää jokaisen välivaiheen luvuilla täytettynä: mistä numerosta seuraava
// numero syntyi. Tarkoitus on että laskun voi tarkistaa käsin — jos jokin
// luku on väärä, se näkyy tässä eikä piiloudu lopputuloksen sisään.
//
// Kaikki mitä tässä lasketaan uudelleen selaimessa (devig, tehollinen kerroin,
// edge, Kelly) on TARKISTUSLASKU, ei uusi totuus: lopputulosta verrataan
// snapshotin lukuun ja ero näytetään, jos sitä on.

/** Devig yhdelle riville: 1/kerroin, summa, normalisointi */
export function devigRow(home, draw, away) {
  const raw = { home: 1 / home, draw: 1 / draw, away: 1 / away };
  const sum = raw.home + raw.draw + raw.away;
  return {
    raw,
    sum,
    margin: sum - 1,
    probs: { home: raw.home / sum, draw: raw.draw / sum, away: raw.away / sum },
  };
}

/** Kerroin komission jälkeen — sama kaava kuin publish/snapshot.ts */
export function effectiveOdds(odds, commission = 0) {
  if (!(odds > 1)) return odds;
  return 1 + (odds - 1) * (1 - Math.min(Math.max(commission, 0), 1));
}

function step(number, title, body) {
  return `<div style="margin-top:9px;padding-top:7px;border-top:1px dashed oklch(1 1 0/0.1)">
    <div style="font-size:.66rem;font-weight:700;margin-bottom:3px"><span style="color:var(--c-accent)">${number}.</span> ${title}</div>
    <div style="font-size:.62rem;line-height:1.65;font-variant-numeric:tabular-nums">${body}</div>
  </div>`;
}

const mono = (s) => `<code style="font-size:.6rem;color:var(--c-accent)">${s}</code>`;

function calcSection(match) {
  const steps = [];
  let n = 0;

  // 1. Devig per toimisto — tämä on se vaihe jossa kate poistetaan
  const devigRows = match.odds.map((r) => ({ row: r, d: devigRow(r.home, r.draw, r.away) }));
  steps.push(
    step(
      ++n,
      'Marginaalin poisto per toimisto',
      `${mono('p = (1/kerroin) / Σ(1/kerroin)')}<br>
      <div style="display:grid;grid-template-columns:1.4fr repeat(4,1fr);gap:3px;font-size:.58rem;margin-top:4px">
        <span style="color:var(--c-text-muted)">toimisto</span><span style="color:var(--c-text-muted)">Σ1/k</span><span style="color:var(--c-text-muted)">1</span><span style="color:var(--c-text-muted)">X</span><span style="color:var(--c-text-muted)">2</span>
        ${devigRows
          .map(
            ({ row, d }) =>
              `<span title="${esc(row.bookmaker)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(row.bookmaker)}</span>
               <span title="kate ${(d.margin * 100).toFixed(2)} %">${d.sum.toFixed(4)}</span>
               <span>${pct(d.probs.home, 1)}</span><span>${pct(d.probs.draw, 1)}</span><span>${pct(d.probs.away, 1)}</span>`
          )
          .join('')}
      </div>
      <div style="color:var(--c-text-muted);margin-top:3px">Σ1/k yli ykkösen on toimiston kate. Devig jakaa sen pois suhteessa.</div>`
    )
  );

  // 2. Konsensus + sharp
  steps.push(
    step(
      ++n,
      'Konsensus ja sharp-ankkuri',
      `Mediaani devigatuista: <b>1 ${pct(match.market.implied.home)} · X ${pct(match.market.implied.draw)} · 2 ${pct(match.market.implied.away)}</b><br>
      ${match.market.sharp
        ? `Ankkuri <b>${esc(match.market.sharp_source ?? '—')}</b>: 1 ${pct(match.market.sharp.home)} · X ${pct(match.market.sharp.draw)} · 2 ${pct(match.market.sharp.away)}`
        : '<span style="color:var(--c-warning)">Ankkuria ei löytynyt — käytetään mediaania</span>'}
      <div style="color:var(--c-text-muted);margin-top:3px">Devig tehdään ensin per toimisto ja vasta sitten otetaan mediaani. Toisin päin kate vuotaisi lukuun mukaan.</div>`
    )
  );

  // 3. Elo (jos on)
  const he = match.stats?.home?.elo;
  const ae = match.stats?.away?.elo;
  if (he != null && ae != null) {
    const e = eloExpected(he, ae);
    steps.push(
      step(
        ++n,
        'Elo-odotusarvo',
        `${mono(`E = 1 / (1 + 10^((${ae} − ${he} − ${ELO_HOME_ADVANTAGE}) / 400))`)}<br>
        = <b>${(e * 100).toFixed(1)} %</b> kotijoukkueelle (voitto = 1, tasapeli = 0.5)
        <div style="color:var(--c-text-muted);margin-top:3px">Lähtötaso 1500, K = 20, kotietu ${ELO_HOME_ADVANTAGE} pistettä, maaliero painotettuna. Elo ei ole osa 1X2-mallia — se on riippumaton vertailuluku.</div>`
      )
    );
  }

  // 4. Poisson
  if (match.model.lambda_home !== null) {
    steps.push(
      step(
        ++n,
        'Poisson-malli',
        `λ koti = <b>${num(match.model.lambda_home, 3)}</b> · λ vieras = <b>${num(match.model.lambda_away, 3)}</b><br>
        ${mono('P(k maalia) = λ^k · e^(−λ) / k!')}<br>
        Tulosmatriisi Dixon-Coles-korjauksella (ρ = −0.05) → 1 ${pct(match.model.poisson_probs.home)} · X ${pct(match.model.poisson_probs.draw)} · 2 ${pct(match.model.poisson_probs.away)}<br>
        Yli 2.5 maalia <b>${pct(match.model.over25)}</b> · molemmat maalin <b>${pct(match.model.btts)}</b><br>
        <span style="color:var(--c-text-muted)">Todennäköisimmät: ${match.model.top_scores.slice(0, 5).map((s) => `${esc(s.score)} ${pct(s.p, 1)}`).join(' · ')}</span>`
      )
    );

    // 5. Blendi — vain kun molemmat osapuolet ovat olemassa
    const w = match.model.blend_weight;
    if (match.market.sharp && w > 0 && w < 1) {
      const rows = ['home', 'draw', 'away']
        .map(
          (s) =>
            `<div>${SIDE_LABELS[s]}: ${w.toFixed(2)} × ${pct(match.model.poisson_probs[s])} + ${(1 - w).toFixed(2)} × ${pct(match.market.sharp[s])} = <b>${pct(match.model.probs[s])}</b></div>`
        )
        .join('');
      steps.push(
        step(
          ++n,
          'Blendi: oma malli + markkina',
          `${mono('p = w × Poisson + (1 − w) × sharp')}, w = <b>${w.toFixed(2)}</b><br>${rows}
          <div style="color:var(--c-text-muted);margin-top:3px">Markkina painaa enemmän, koska se hinnoittelee myös sen mitä data ei kerro: kokoonpanot, motivaation, sään.</div>`
        )
      );
    }
  } else {
    steps.push(
      step(
        ++n,
        'Poisson-mallia ei laskettu',
        `Sarjalle ei ollut tilastolähdettä, joten maaliodotusta ei voi laskea. Malli on <b>${esc(METHOD_LABELS[match.model.method]?.short ?? match.model.method)}</b> ja edge syntyy pelkästä hintavertailusta.`
      )
    );
  }

  // 6. Paras hinta + komissio
  const bestRows = ['home', 'draw', 'away']
    .map((s) => {
      const odds = match.best[s];
      const eff = match.best[`${s}_effective`];
      const book = match.best[`${s}_book`];
      const changed = Math.abs(odds - eff) > 0.005;
      return `<div>${SIDE_LABELS[s]}: <b>${num(odds)}</b> ${esc(book ?? '—')}${changed ? ` → komission jälkeen <b>${num(eff)}</b>` : ''}</div>`;
    })
    .join('');
  steps.push(
    step(
      ++n,
      'Paras hinta komission jälkeen',
      `${mono('tehollinen = 1 + (kerroin − 1) × (1 − komissio)')}<br>${bestRows}
      <div style="color:var(--c-text-muted);margin-top:3px">Pörssissä komissio otetaan vain voitosta, joten panos palautuu kokonaan. Vertailu tehdään tällä luvulla — muuten pörssi voittaisi aina näennäisesti.</div>`
    )
  );

  // 7. Edge — tarkistuslasku snapshotin lukua vasten
  const edgeRows = match.analysis.edges
    .map((e) => {
      const recomputed = e.model_prob * e.odds_effective - 1;
      const drift = Math.abs(recomputed - e.edge) > 0.001;
      return `<div>${SIDE_LABELS[e.side]}: ${pct(e.model_prob)} × ${num(e.odds_effective)} − 1 = <b style="color:${e.edge > 0.05 ? 'var(--c-success)' : e.edge > 0.03 ? 'var(--c-warning)' : e.edge > 0 ? 'var(--c-text)' : 'var(--c-danger)'}">${e.edge > 0 ? '+' : ''}${(e.edge * 100).toFixed(2)} %</b>
        ${drift ? `<span style="color:var(--c-danger)"> ⚠️ tarkistuslasku antaa ${(recomputed * 100).toFixed(2)} %</span>` : ''}</div>`;
    })
    .join('');
  steps.push(
    step(
      ++n,
      'Edge',
      `${mono('edge = mallin todennäköisyys × tehollinen kerroin − 1')}<br>${edgeRows}
      <div style="color:var(--c-text-muted);margin-top:3px">Kynnykset: 🟡 yli 3 % · 💎 yli 5 %. Alle 3 % on mallin virherajojen sisällä eikä siitä anneta panossuositusta.</div>`
    )
  );

  // 8. Kelly
  const kellyRows = match.analysis.edges
    .map((e) => {
      const b = e.odds_effective - 1;
      const p = e.model_prob;
      const full = b > 0 ? (b * p - (1 - p)) / b : 0;
      if (e.stake_suggestion <= 0) {
        return `<div style="color:var(--c-text-muted)">${SIDE_LABELS[e.side]}: ei panosta${full > 0 ? ` (täysi Kelly olisi ${(full * 100).toFixed(2)} %, mutta edge ${(e.edge * 100).toFixed(1)} % ei ylitä kynnystä)` : ''}</div>`;
      }
      return `<div>${SIDE_LABELS[e.side]}: b = ${num(b)}, ${mono(`f* = (${num(b)}×${p.toFixed(4)} − ${(1 - p).toFixed(4)}) / ${num(b)}`)} = <b>${(full * 100).toFixed(2)} %</b><br>
        &nbsp;&nbsp;→ murto-Kelly 25 % → <b>${(e.kelly_fraction * 100).toFixed(2)} %</b> × ${num(match.analysis.bankroll_basis, 0)} € = <b style="color:var(--c-success)">${num(e.stake_suggestion)} €</b></div>`;
    })
    .join('');
  steps.push(
    step(
      ++n,
      'Kelly-panos',
      `${kellyRows}
      <div style="color:var(--c-text-muted);margin-top:3px">Täysi Kelly maksimoi kasvun mutta heiluu rajusti. Käytössä 25 % siitä, kovana kattona 2 % kassasta — mallin virhe ei saa tyhjentää kassaa.</div>`
    )
  );

  // 9. Mallin korjaukset
  if (match.model.adjustments?.length) {
    steps.push(
      step(
        ++n,
        'Mallin korjaukset',
        match.model.adjustments
          .map((a) => {
            const delta = [
              a.delta_lambda_home ? `λ koti ${a.delta_lambda_home > 0 ? '+' : ''}${num(a.delta_lambda_home, 3)}` : null,
              a.delta_lambda_away ? `λ vieras ${a.delta_lambda_away > 0 ? '+' : ''}${num(a.delta_lambda_away, 3)}` : null,
            ]
              .filter(Boolean)
              .join(', ');
            return `<div>⚙️ ${esc(a.reason)}${delta ? ` <b>(${delta})</b>` : ''}</div>`;
          })
          .join('')
      )
    );
  }

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
    <div style="font-size:.66rem;color:var(--c-text-muted);line-height:1.55">
      Jokainen välitulos kaavoineen. Luvut ovat samat kuin muualla kortilla —
      tämä ei laske mitään uudestaan vaan näyttää miten lopputulokseen päädyttiin.
    </div>
    ${steps.join('')}
  </div>`;
}

// ─── Kortti ───────────────────────────────────────────────────────────────

const SECTIONS = {
  stats: { icon: '📊', label: 'Tunnusluvut', render: statsSection },
  news: { icon: '📰', label: 'Uutiset', render: newsSection },
  analysis: { icon: '💎', label: 'Analyysi', render: analysisSection },
  calc: { icon: '🔬', label: 'Laskenta', render: calcSection },
};

/** Avoimet osiot pidetään muistissa, jotta uudelleenrenderöinti ei sulje niitä */
const openSections = new Map();

export function toggleSection(index, key) {
  const current = openSections.get(index);
  openSections.set(index, current === key ? null : key);
  renderAllCards();
}

function sectionButtons(match, index) {
  const visible = Object.entries(SECTIONS).filter(([key]) => isVisible(key));
  if (!visible.length) return '';

  // Jos avoin osio piilotettiin asetuksista, se ei saa jäädä auki
  let open = openSections.get(index);
  if (open && !visible.some(([key]) => key === open)) open = null;

  const buttons = visible
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
      <span class="matchup">${teamLogo(match.home)}<strong>${esc(match.home.name)}${eloParen(match.stats?.home)}</strong><span class="vs">–</span><strong>${esc(match.away.name)}${eloParen(match.stats?.away)}</strong>${teamLogo(match.away)}</span>
      ${flagBadge}
    </div>

    ${eloLine(match)}
    ${valueLine(match)}

    ${isVisible('probs')
      ? `<div style="font-size:.65rem;margin-top:5px;color:var(--c-text-muted)">
          Malli: <b style="color:var(--c-text)">${pct(match.model.probs.home, 0)}</b> / <b style="color:var(--c-text)">${pct(match.model.probs.draw, 0)}</b> / <b style="color:var(--c-text)">${pct(match.model.probs.away, 0)}</b>
        </div>
        ${probBar(match.model.probs)}`
      : ''}

    ${isVisible('odds') ? oddsTable(match, index) : `<div id="fbetpop-${index}" style="display:none"></div>`}
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

/**
 * Harjoitustilan kierrosnavigaatio (tiketti #37).
 *
 * Kierrosta ei voi vaihtaa vapaasti eteen ja taakse: harjoituksen idea on
 * pelata kierros läpi, simuloida se ja siirtyä eteenpäin — aivan kuten
 * oikeassa kaudessa. Siksi vain "seuraava kierros" ja "aloita alusta".
 */
function roundNav() {
  if (getDataSource() !== 'mock') return '';
  const index = getMockRound();
  const total = getMockRoundCount() || 5;

  const dots = Array.from({ length: total }, (_, i) => {
    const state = i < index ? 'var(--c-success)' : i === index ? 'var(--c-accent)' : 'oklch(1 1 0/0.15)';
    return `<span style="width:9px;height:9px;border-radius:50%;background:${state};display:inline-block"></span>`;
  }).join('');

  const atEnd = index >= total - 1;

  return `<div class="card" style="border:1.5px solid var(--c-accent)">
    <div class="row">
      <strong style="font-size:.8rem">🎯 Harjoituskierros ${index + 1} / ${total}</strong>
      <span style="display:flex;gap:5px;align-items:center">${dots}</span>
    </div>
    <div style="font-size:.63rem;color:var(--c-text-muted);margin-top:5px;line-height:1.5">
      Kertoimet on johdettu kauden oikeista Elo-luvuista. Aseta vetoja, simuloi kierros
      Seuranta-välilehdellä ja siirry eteenpäin — tappioketjua voi jahdata kierroksesta toiseen.
    </div>
    <div style="display:flex;gap:6px;margin-top:8px">
      ${atEnd
        ? `<button class="btn btn-block" style="background:oklch(1 1 0/0.1);color:var(--c-text);font-size:.7rem" onclick="window.BTF.restartMockRounds()">🔄 Aloita kierrokset alusta</button>`
        : `<button class="btn btn-primary btn-block" style="font-size:.72rem" onclick="window.BTF.nextMockRound()">Seuraava kierros →</button>`}
    </div>
  </div>`;
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

  container.innerHTML = roundNav() + sourceBanner(currentSnapshot) + summary + ordered.map(({ m, i }) => matchCard(m, i)).join('');
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
