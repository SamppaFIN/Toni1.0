// Tiketti #45: Valioliigan joukkuetaulukko
//
// Sama idea kuin jääkiekon "Joukkueet"-välilehdellä (renderTeams() demo.html:ssä):
// koko sarjan joukkueet listattuna voimaluvun mukaan. Ero on että jalkapallolla
// ei ole Elo:a — voimaluku on sama hyökkäys-/puolustuskerroin jota Poisson-malli
// käyttää ottelukorteilla (src/analyze/strength.ts), joten taulukko ja
// ottelukortin analyysi kertovat aina samaa tarinaa.

import { esc } from './snapshot.js';

let teams = null;
let loadError = null;

export async function load(url = 'data/football-teams.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      loadError = `Joukkuetaulukkoa ei löytynyt (HTTP ${res.status}). Aja \`npm run teams:football\`.`;
      teams = null;
      return null;
    }
    const file = await res.json();
    teams = file;
    loadError = null;
    return file;
  } catch (err) {
    loadError = `Joukkuetaulukon lataus epäonnistui: ${err.message}`;
    teams = null;
    return null;
  }
}

function formBadges(form) {
  if (!form) return '<span style="color:var(--c-text-muted)">—</span>';
  const colors = { W: 'var(--c-success)', D: 'var(--c-warning)', L: 'var(--c-danger)' };
  return form
    .split('')
    .map((r) => `<span style="display:inline-block;width:14px;height:14px;line-height:14px;text-align:center;border-radius:3px;background:${colors[r] || 'var(--c-text-muted)'};color:#000;font-size:.55rem;font-weight:700;margin-right:2px">${r}</span>`)
    .join('');
}

/**
 * Elo-merkki: luku, muutos kauden alusta ja sija. Sama esitystapa kuin
 * ottelukortilla (football-cards.js:eloParen) -- eri muotoilu samalle luvulle
 * saisi ne nayttamaan eri luvuilta.
 *
 * Pelaamaton joukkue nayttaa viivan eika lahtotasoa 1500: 1500 vaittaisi
 * mitattua tietoa siella missa sita ei ole.
 */
function eloCell(t) {
  if (t.elo == null) return '<span style="color:var(--muted)">—</span>';
  if (t.elo_provisional) {
    return `<span style="color:var(--muted);opacity:.7" title="Kauden lahtotaso — ei viela pelattuja otteluita">${t.elo} <i style="font-size:.55rem">lahtotaso</i></span>`;
  }
  const ch = t.elo_change;
  const color = ch > 0 ? 'var(--c-success)' : ch < 0 ? 'var(--c-danger)' : 'var(--muted)';
  const arrow = ch > 0 ? '▲' : ch < 0 ? '▼' : '·';
  const rank = t.elo_rank ? `<span style="color:var(--muted);font-size:.55rem"> #${t.elo_rank}</span>` : '';
  return `<b style="font-variant-numeric:tabular-nums">${t.elo}</b>${rank} <span style="color:${color};font-size:.58rem">${arrow}${Math.abs(ch ?? 0)}</span>`;
}
/** Voimaluku badge — sama kynnyslogiikka kuin hockeyn PDO-badgella (renderTeams()) */
function strengthBadge(value, betterWhenHigh) {
  const good = betterWhenHigh ? value > 1.1 : value < 0.9;
  const bad = betterWhenHigh ? value < 0.9 : value > 1.1;
  const cls = good ? 'badge-green' : bad ? 'badge-red' : 'badge-muted';
  return `<span class="badge ${cls}">${value.toFixed(2)}</span>`;
}

export function render(containerId = 'teams-fb-list') {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (loadError || !teams) {
    el.innerHTML = `<div class="empty">${esc(loadError ?? 'Joukkuetaulukkoa ei ole vielä ladattu.')}</div>`;
    return;
  }

  // Elo-jarjestys kun Elo on saatavilla -- sama kuin jaakiekon Joukkueet-tabissa.
  // Pelaamattomat (elo === null) jaavat loppuun sarjasijan mukaan.
  const hasElo = teams.teams.some((t) => t.elo != null);
  const ordered = hasElo
    ? [...teams.teams].sort((a, b) => (b.elo ?? -Infinity) - (a.elo ?? -Infinity) || (a.rank ?? 999) - (b.rank ?? 999))
    : teams.teams;

  const rows = ordered
    .map(
      (t) => `<div class="card"><div class="row">
        <div class="matchup"><span class="team-logo" style="background:${esc(t.team.color)};width:22px;height:22px;font-size:8px" title="${esc(t.team.name)}">${esc(t.team.short)}</span> <strong>#${t.rank ?? '—'} ${esc(t.team.name)}</strong></div>
        <span style="font-weight:700">${t.points} p</span>
      </div>
      <div class="row" style="font-size:.7rem;color:var(--muted);margin-top:3px">
        <span>${t.played} O · ${t.won}-${t.draw}-${t.lost} · ${t.gf}-${t.ga}</span>
        ${formBadges(t.form)}
      </div>
      <div class="row" style="font-size:.65rem;color:var(--muted);margin-top:3px">
        <span>Elo ${eloCell(t)}</span>
        <span>Hyökkäys ${strengthBadge(t.attack, true)}</span>
        <span>Puolustus ${strengthBadge(t.defense, false)}</span>
      </div></div>`
    )
    .join('');

  el.innerHTML = `<div style="font-size:.65rem;color:var(--muted);margin-bottom:6px">${esc(teams.league)} ${esc(teams.season)} · ${hasElo ? 'jarjestetty Elon mukaan · ' : ''}Elo lahtotaso 1500 · voimaluku 1.00 = sarjan keskitaso, puolustuksessa pienempi on parempi</div>${rows}`;
}

// BTL on jo varattu football-llm.js:lle (tiketti #38) — joukkuetaulukolle BTS (Sarjataulukko)
window.BTS = { load, render };
