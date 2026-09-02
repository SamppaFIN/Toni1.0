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
  hasFlag,
  getDataSource,
  getMockRound,
  getMockRoundCount,
} from './snapshot.js';
import { isVisible } from './football-prefs.js';
import * as calc from './football-calc.js';
import { archivedDay, toCardShape } from './football-archive.js';
import { LEAGUE_CODES, fetchFixtures, ymd, fetchH2H } from './football-espn.js';
import * as timeline from './football-timeline.js';
import { serverArchiveDay } from './football-server-archive.js';
import { hasReview, reviewSection } from './football-liiga-review.js';

// ─── Päiväsuodatin (tiketti #46) ──────────────────────────────────────────
//
// Snapshotin aikaikkuna on 72 h, joten lista sisältää myös huomisen ja
// ylihuomisen ottelut — ja cron-ajojen välissä myös jo alkaneita. Alkanut
// ottelu on aktiivisesti haitallinen kortilla: sen kerroin on vanhentunut
// eikä siihen voi enää lyödä, mutta se näyttää samalta kuin pelattava kohde.
//
// Oletus on siis "vain tänään, ei alkaneita". Myöhemmät ottelut eivät katoa
// — ne ovat toggle-napin takana, koska niiden analyysi on täysin validi,
// vain ajankohta on eri.

const SPORT_KEY = 'bt_sport';

/**
 * Ottelun laji tunnisteesta (tiketti #95).
 *
 * Sama paattely kuin palvelimen sportOf():ssa, mutta ilman
 * sarjarekisteria: `id` alkaa aina kerroinrajapinnan sarjatunnisteella,
 * ja se kertoo lajin yksiselitteisesti. Tuntematon tulkitaan
 * jalkapalloksi -- se on enemmisto.
 */
export function sportOfMatch(match) {
  return String(match?.id ?? '').startsWith('icehockey_') ? 'hockey' : 'football';
}

/** Nakyva laji: hockey | football | both. Oletus jaakiekko. */
export function sportMode() {
  try {
    const v = localStorage.getItem(SPORT_KEY);
    return v === 'football' || v === 'both' ? v : 'hockey';
  } catch {
    return 'hockey';
  }
}

/**
 * Suodata ottelut nakyvan lajin mukaan.
 *
 * Snapshot sisaltaa MOLEMMAT lajit, koska sarjarekisterissa on seka
 * jalkapallo- etta jaakiekkosarjoja. Ilman tata jaakiekkotilassa
 * nakyisivat myos jalkapallo-ottelut.
 */
export function visibleBySport(list) {
  const mode = sportMode();
  if (mode === 'both') return list;
  return list.filter((m) => sportOfMatch(m) === mode);
}

const DAY_FILTER_KEY = 'bt_football_day_filter';

/**
 * Nakyva paiva: siirtyma tastä paivasta (-1 eilen, 0 tanaan, 1 huomenna) tai
 * "all" koko aikaikkunalle.
 *
 * Vanha arvo "today" migroidaan nollaksi, jotta aiemmin tallennettu asetus ei
 * jata kayttajaa tuntemattomaan tilaan.
 */
export function getDayFilter() {
  try {
    const v = localStorage.getItem(DAY_FILTER_KEY);
    if (v === 'all') return 'all';
    if (v === null || v === 'today') return 0;
    const n = Number(v);
    return Number.isInteger(n) && n >= -7 && n <= 7 ? n : 0;
  } catch {
    return 0;
  }
}

export function setDayFilter(mode) {
  try {
    localStorage.setItem(DAY_FILTER_KEY, mode === 'all' ? 'all' : String(Number(mode) || 0));
  } catch {
    /* privaatti-ikkuna: valinta toimii silti istunnon ajan */
  }
  renderAllCards();
}

/** Paikallinen kalenteripäivä — kortti näyttää kellonajat paikallisessa ajassa, joten myös päivä on paikallinen */
function localDayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Jaa ottelut kolmeen: jo alkaneet, tänään pelattavat, myöhemmät */
export function partitionByDay(matches, now = new Date()) {
  const today = localDayKey(now);
  const started = [];
  const todayUpcoming = [];
  const later = [];
  for (const m of matches) {
    const t = Date.parse(m.kickoff);
    if (Number.isFinite(t) && t < now.getTime()) started.push(m);
    else if (localDayKey(m.kickoff) === today) todayUpcoming.push(m);
    else later.push(m);
  }
  return { started, todayUpcoming, later };
}

// ─── Toimistolinkit (tiketti #47) ─────────────────────────────────────────
//
// The Odds APIn ilmaistaso EI palauta ottelukohtaisia syvälinkkejä
// (`includeLinks` on maksullisten pakettien ominaisuus), joten linkki vie
// toimiston jalkapallosivulle eikä suoraan tähän otteluun. Se sanotaan
// käyttäjälle vihjetekstissä — väärin luvattu syvälinkki olisi pahempi kuin
// rehellinen etusivulinkki.
//
// Jos API joskus alkaa palauttaa `link`-kentän, se käytetään automaattisesti:
// rivikohtainen linkki voittaa aina tämän kartan.

const BOOKMAKER_SITES = {
  football: {
    pinnacle: 'https://www.pinnacle.com/en/soccer/matchups/',
    onexbet: 'https://1xbet.com/en/line/football/',
    betfair_ex_eu: 'https://www.betfair.com/exchange/plus/football',
    marathonbet: 'https://www.marathonbet.com/en/betting/Football/',
    williamhill: 'https://sports.williamhill.com/betting/en-gb/football',
    unibet_se: 'https://www.unibet.se/betting/sports/filter/football',
    unibet_eu: 'https://www.unibet.com/betting/sports/filter/football',
    coolbet: 'https://www.coolbet.com/en/sports/football',
    nordicbet: 'https://www.nordicbet.com/en/sportsbook/football',
    betsson: 'https://www.betsson.com/en/sportsbook/football',
    matchbook: 'https://www.matchbook.com/exchange/sports/soccer',
    // Tiketti #103: Veikkaus ei tule rajapinnasta vaan kasisyotosta
    // (data/veikkaus-odds-manual.json). Linkki vie kerroinsivulle; syvalinkkia
    // yksittaiseen otteluun ei ole, koska Veikkauksen kohdetunnistetta ei ole
    // saatavilla ilman rajapintaa — vaarin luvattu syvalinkki olisi pahempi.
    veikkaus: 'https://www.veikkaus.fi/fi/vedonlyonti',
  },
  // Tiketti #98: jaakiekkokortilta linkki vei toimiston JALKAPALLOSIVULLE.
  // Kartta oli yksilajinen ajalta jolloin putki oli, ja laji lisattiin sen
  // ymparilta huomaamatta.
  hockey: {
    pinnacle: 'https://www.pinnacle.com/en/hockey/matchups/',
    onexbet: 'https://1xbet.com/en/line/ice-hockey/',
    betfair_ex_eu: 'https://www.betfair.com/exchange/plus/ice-hockey',
    marathonbet: 'https://www.marathonbet.com/en/betting/Ice+Hockey/',
    williamhill: 'https://sports.williamhill.com/betting/en-gb/ice-hockey',
    unibet_se: 'https://www.unibet.se/betting/sports/filter/ice_hockey',
    unibet_eu: 'https://www.unibet.com/betting/sports/filter/ice_hockey',
    coolbet: 'https://www.coolbet.com/en/sports/ice-hockey',
    nordicbet: 'https://www.nordicbet.com/en/sportsbook/ice-hockey',
    betsson: 'https://www.betsson.com/en/sportsbook/ice-hockey',
    matchbook: 'https://www.matchbook.com/exchange/sports/ice-hockey',
    veikkaus: 'https://www.veikkaus.fi/fi/vedonlyonti',
  },
};

/**
 * Rivikohtainen linkki jos API antoi sen, muuten toimiston LAJIN mukainen
 * etusivu, muuten null.
 *
 * Etusivut ovat parasta arvausta eivatka todennettuja: rivikohtainen
 * syvalinkki (tiketti #54) on ainoa joka varmasti osuu otteluun. Se
 * sanotaan kayttajalle vihjetekstissa.
 */
export function bookmakerUrl(row, sport = 'football') {
  if (row?.link && /^https:\/\//i.test(row.link)) return row.link;
  const kartta = BOOKMAKER_SITES[sport] ?? BOOKMAKER_SITES.football;
  return kartta[row?.key] ?? null;
}

/**
 * Toimiston nimi linkkinä. rel="noopener noreferrer" on pakollinen:
 * target="_blank" ilman sitä antaisi kohdesivulle pääsyn window.openeriin.
 */
function bookmakerLabel(row, sport = 'football') {
  const url = bookmakerUrl(row, sport);
  // Kasisyotetylla rivilla `link` on toimiston kerroinsivu, ei taman ottelun
  // sivu. Se ei siis ansaitse ↗-merkkia eika lupausta syvalinkista.
  const deep = Boolean(row?.link) && !row?.manual;
  const lajiSana = sport === 'hockey' ? 'jääkiekkosivun' : 'jalkapallosivun';

  const tip = [
    url
      ? `${row.bookmaker} — avaa ${deep ? 'tämän ottelun sivun' : `toimiston ${lajiSana}`} uuteen välilehteen`
      : row.bookmaker,
    // Tiketti #103: kasin syotetty hinta voi olla vanhentunut tavalla jota
    // haettu ei voi olla. Kayttajan ei kuulu joutua arvaamaan kumpi on kyseessa.
    row?.manual ? `✍️ Käsin syötetty kerroin${row.note ? ` — ${row.note}` : ''}` : '',
    row?.manual && row.fetched_at ? `Syötetty ${esc(String(row.fetched_at).slice(0, 16).replace('T', ' '))} UTC` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const nimi = `${esc(row.bookmaker)}${row?.manual ? ' <span style="font-size:.7em;opacity:.75">✍️</span>' : ''}`;

  if (!url) return `<span class="bk-name" title="${esc(tip)}">${nimi}</span>`;

  return `<a class="bk-name bk-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="${esc(tip)}" onclick="event.stopPropagation()">${nimi}${deep ? ' ↗' : ''}</a>`;
}

/** Joukkueen logo värillisenä ympyränä — sama tyyli kuin jääkiekkopuolella */
function teamLogo(team, size = 26) {
  return `<span class="team-logo" style="background:${esc(team.color)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.34)}px" title="${esc(team.name)}">${esc(team.short)}</span>`;
}

// ─── Kerroinruudun taustaväri (tiketti #88) ───────────────────────────────
//
// Väri kertoo YHDEN ruudun odotusarvon, ei ottelun suositusta.
//
// Aiemmin väri piirtyi vain ⭐-ruutuun, koska snapshot laskee edgen pelkästä
// parhaasta hinnasta. Käytännössä se tarkoitti että 10.00 saattoi olla
// värillinen ja saman kohteen 9.80 musta — vaikka jos 10.00 on ylikerroin,
// niin on 9.80 myös, vain pienemmällä marginaalilla. Nyt jokainen ruutu saa
// oman edgensä omasta hinnastaan.
//
// Kynnykset ovat samat kuin jääkiekkokortilla (demo.html: evBgClass) ja
// palvelimen snapshotissa (VALUE_THRESHOLD, STRONG_THRESHOLD). Yksikkötesti
// lukitsee ne yhteen — kolmessa paikassa asuva kynnys eriytyy muuten hiljaa.

export const EV_CANDIDATE = 0.03;
export const EV_STRONG = 0.05;
export const EV_ELITE = 0.08;

/**
 * Palvelimen lippukynnys todennäköisyyserolle (snapshot.ts: MIN_PROB_EDGE).
 * Tarvitaan tässä vain SELITTÄMISEEN: pitkän maksun kerroin saa suuren edgen
 * pienestäkin erosta mallin ja markkinan välillä, ja juuri silloin ruutu on
 * värillinen muttei suositeltu.
 */
export const MIN_PROB_EDGE = 0.02;

/** Yhden ruudun edge: mallin todennäköisyys × tämän ruudun tehollinen hinta − 1 */
export function cellEdge(modelProb, odds, commission = 0) {
  if (!(modelProb > 0) || !(odds > 1)) return null;
  return modelProb * effectiveOdds(odds, commission) - 1;
}

/**
 * Taustavariluokka: '' = musta eli ei suositusta.
 *
 * VAATII MYOS TODENNAKOISYYSERON (tiketti #97). Aiemmin vari katsoi pelkkaa
 * edgea, jolloin kortti saattoi nayttaa vihreaa ruutua ja samaan aikaan
 * sanoa "ei value-kohdetta, ei panossuositusta". Nain kavi juuri pitkan
 * maksun kohteissa: 4.30 kertoimella 0.0 pp:n ero mallin ja markkinan
 * valilla tuottaa +6.9 % edgen, mutta se on mallin virherajojen sisalla.
 *
 * Selitysteksti oli olemassa, mutta vari on vahvempi signaali kuin teksti --
 * kayttaja nakee vihrean ennen kuin lukee mitaan. Nyt vari noudattaa samaa
 * kahden ehdon saantoa kuin palvelimen lippu ja panossuositus, joten kortti
 * ei enaa sano kahta eri asiaa.
 *
 * `probEdge` puuttuessa vari annetaan pelkan edgen mukaan -- vanhat
 * kutsupaikat eivat riko, ja puuttuva tieto ei ole sama kuin nolla.
 */
export function edgeBgClass(edge, probEdge = null) {
  if (edge == null) return '';
  // Riittamaton ero mallin ja markkinan valilla -> ei varia, kuten ei lippuakaan
  if (probEdge != null && probEdge < MIN_PROB_EDGE) return '';
  if (edge > EV_ELITE) return 'value-elite';
  if (edge > EV_STRONG) return 'value-strong';
  if (edge > EV_CANDIDATE) return 'value-candidate';
  return '';
}

/** Ruudun sisällä näkyvän prosenttiluvun väriluokka */
export function edgeTextClass(edge) {
  if (edge == null) return 'ev-flat';
  if (edge > EV_ELITE) return 'ev-wow';
  if (edge > EV_STRONG) return 'ev-good';
  if (edge > EV_CANDIDATE) return 'ev-ok';
  if (edge < 0) return 'ev-bad';
  return 'ev-flat';
}

/** Sanallinen taso vihjetekstiin — sama sanasto kuin jääkiekkokortilla */
export function edgeLabel(edge) {
  if (edge == null) return '';
  if (edge > EV_ELITE) return '🌈 poikkeuksellinen — epäile mallia ennen markkinaa';
  if (edge > EV_STRONG) return '🟢 vahva signaali';
  if (edge > EV_CANDIDATE) return '🟡 kandidaatti';
  if (edge < 0) return '🔴 negatiivinen odotusarvo';
  return '⚪ nolla-alue (alle 3 % on mallin virherajojen sisällä)';
}

/**
 * Mallin todennäköisyys per kohde, luettuna snapshotin edge-riveiltä.
 *
 * Lähde on edge-rivi eikä model.probs, jotta ⭐-ruudun väri lasketaan samasta
 * luvusta jonka analyysi näyttää. Jos lähteet eroaisivat, sama kortti
 * näyttäisi kahta eri edgeä samasta hinnasta.
 */
function modelProbBySide(match) {
  const probs = {};
  for (const e of match.analysis?.edges ?? []) probs[e.side] = e.model_prob;
  return probs;
}

/**
 * Miksi värillinen ruutu jäi ilman panossuositusta.
 *
 * Kaksi eri syytä, ja ero on olennainen käyttäjälle:
 *   - ruutu ei ole paras hinta → suositus on laskettu toiselle toimistolle
 *   - todennäköisyysero jää alle kynnyksen → malli ei ole tarpeeksi eri
 *     mieltä markkinasta, vaikka pitkä maksu tekee edgestä suuren
 */
function stakeGateNote(snapshotEdge, isBest) {
  if (!isBest) return 'panossuositus lasketaan parhaasta hinnasta';
  if (!snapshotEdge) return '';
  const pp = (snapshotEdge.model_prob - snapshotEdge.implied_prob) * 100;
  if (pp < MIN_PROB_EDGE * 100) {
    return `malli ja markkina eroavat vain ${pp.toFixed(1)} pp (kynnys ${(MIN_PROB_EDGE * 100).toFixed(0)} pp) → ei panossuositusta`;
  }
  return '';
}

/**
 * Kertoimet toimisto per rivi.
 *
 * Kolme eri asiaa, kolme eri merkintää — ero on tarkoituksellinen:
 *
 *   ⭐ paras hinta = pelkkä hintavertailun voittaja komission jälkeen.
 *                    Kertoo mistä veto kannattaa lyödä JOS sen lyö.
 *   taustaväri     = TÄMÄN ruudun odotusarvo (ks. edgeBgClass). Keltainen yli
 *                    3 %, vihreä yli 5 %, kultainen yli 8 %, musta alle sen.
 *   🟡/💎 ikoni    = palvelimen panossuositus, joka vaatii edgen LISÄKSI
 *                    riittävän todennäköisyyseron (MIN_PROB_EDGE).
 *
 * Väri ja ikoni voivat siis olla eri mieltä. Se ei ole ristiriita vaan juuri
 * se tieto joka aiemmin puuttui — vihjeteksti kertoo kumpi tilanne on
 * käsillä, ja value-rivi kortin ylälaidassa sanoo saman sanoin.
 */
function oddsTable(match, index) {
  if (!match.odds?.length) return '<div class="empty" style="font-size:.7rem">Ei kertoimia</div>';

  const head = `<div class="odds-row odds-head"><span>Toimisto</span><span>1</span><span>X</span><span>2</span></div>`;

  // Arkistoitu ottelu on jo pelattu: hinta nayteta&auml;n historiana muttei
  // klikattavana. Vedon lyominen menneeseen otteluun ei ole mahdollista, ja
  // klikattava nappi lupaisi jotain mita ei voi tehda.
  const historic = Boolean(match.fromArchive);
  const edgeBySide = new Map(match.analysis.edges.map((e) => [e.side, e]));
  const probs = modelProbBySide(match);

  const rows = match.odds
    .map((row) => {
      const cell = (side) => {
        const value = row[side];
        const isBest = match.best[`${side}_book`] === row.bookmaker && Math.abs(match.best[side] - value) < 1e-9;
        const snapshotEdge = edgeBySide.get(side) ?? null;
        // Lippu ja panossuositus on laskettu parhaasta hinnasta, joten ikoni
        // kuuluu vain sille ruudulle jota luku koskee
        const flag = isBest && snapshotEdge && snapshotEdge.flag !== 'none' ? snapshotEdge.flag : null;
        const ev = cellEdge(probs[side], value, row.commission);
        // Todennakoisyysero on sama kaikille saman kohteen ruuduille: se
        // kertoo kuinka paljon malli ja markkina eroavat, ei mita yksi
        // toimisto maksaa. Ilman sita vari ja panossuositus voivat erota.
        const probEdge = snapshotEdge ? snapshotEdge.model_prob - snapshotEdge.implied_prob : null;
        const bg = edgeBgClass(ev, probEdge);
        const evHtml = ev == null ? '' : `<span class="ev ${edgeTextClass(ev)}">${ev > 0 ? '+' : ''}${(ev * 100).toFixed(1)} %</span>`;
        const icon = flag ? ` ${FLAG_META[flag].icon}` : isBest ? ' ⭐' : '';
        const cls = `bk-odds${isBest ? ' best' : ''}${bg ? ` ${bg}` : ''}`;
        const inner = `<span>${value.toFixed(2)}${icon}</span>${evHtml}`;

        const tip = [
          `${row.bookmaker} — ${SIDE_LABELS[side]} ${value.toFixed(2)}`,
          isBest ? 'paras hinta' : '',
          // Pörssin komissio näkyy vihjeessä: näytetty hinta ei ole se mitä veto maksaa
          row.commission > 0
            ? `pörssin komissio ${(row.commission * 100).toFixed(1)} % → tehollinen ${effectiveOdds(value, row.commission).toFixed(2)}`
            : '',
          ev == null ? '' : `odotusarvo ${ev > 0 ? '+' : ''}${(ev * 100).toFixed(1)} % · ${edgeLabel(ev)}`,
          ev != null && ev > EV_CANDIDATE && !flag ? stakeGateNote(snapshotEdge, isBest) : '',
          historic ? 'arkistoitu hinta' : '',
        ]
          .filter(Boolean)
          .join('\n');

        if (historic) {
          return `<span class="${cls}" style="opacity:.75;cursor:default" title="${esc(tip)}">${inner}</span>`;
        }
        return `<button class="${cls}" onclick="event.stopPropagation();window.BTF.openBetPopup('${esc(match.id)}','${side}',${value},'${esc(row.bookmaker)}')" title="${esc(tip)}">${inner}</button>`;
      };
      return `<div class="odds-row">${bookmakerLabel(row, sportOfMatch(match))}${cell('home')}${cell('draw')}${cell('away')}</div>`;
    })
    .join('');

  return `<div class="odds-list">${head}${rows}</div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:4px;line-height:1.5">
      👆 Klikkaa kerrointa asettaaksesi vedon · toimiston nimestä sen sivulle (↗ = suora linkki tähän otteluun)<br>
      Taustaväri ja prosentti = <b>tämän hinnan</b> odotusarvo: keltainen yli 3 %, vihreä yli 5 %, kultainen yli 8 %<br>
      ⭐ paras hinta komission jälkeen — <i>ei</i> tarkoita että veto kannattaa<br>
      🟡/💎 panossuositus — vaatii odotusarvon lisäksi ${(MIN_PROB_EDGE * 100).toFixed(0)} pp:n eron mallin ja markkinan välillä
      ${match.odds.some((r) => r.manual)
        ? '<br>✍️ käsin syötetty hinta — toimistolla ei ole kerroinrajapintaa, joten luku voi olla vanhentunut. Tarkista toimiston sivulta ennen vetoa.'
        : ''}
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
  if (stats.elo_provisional) {
    return `<span style="color:var(--c-text-muted);opacity:.7" title="Kauden lahtotaso — ei viela pelattuja otteluita">${stats.elo} <i style="font-size:.55rem">lahtotaso</i></span>`;
  }
  const change = stats.elo_change;
  const color = change > 0 ? 'var(--c-success)' : change < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '·';
  const rank = stats.elo_rank ? `<span style="color:var(--c-text-muted);font-size:.55rem"> #${stats.elo_rank}</span>` : '';
  return `<b style="font-variant-numeric:tabular-nums">${stats.elo}</b>${rank} <span style="color:${color};font-size:.58rem">${arrow}${Math.abs(change ?? 0)}</span>`;
}

/** Elo suluissa joukkueen nimen perään — luku siinä missä se koskee joukkuetta */
function eloParen(stats) {
  if (!isVisible('elo') || stats?.elo == null) return '';

  // Lahtotaso naytetaan mutta EI samannakoisena kuin mitattu luku: himmeampi,
  // ilman muutosnuolta ja omalla selitteella. Merkitsematon 1500 vaittaisi
  // mitattua tietoa siella missa sita ei ole.
  if (stats.elo_provisional) {
    return ` <span style="font-weight:400;font-size:.62rem;color:var(--c-text-muted);opacity:.65;font-variant-numeric:tabular-nums" title="Kauden lahtotaso ${stats.elo} — joukkue ei ole viela pelannut, luku ei ole mitattu">(${stats.elo} lahtotaso)</span>`;
  }

  const change = stats.elo_change;
  const color = change > 0 ? 'var(--c-success)' : change < 0 ? 'var(--c-danger)' : 'var(--c-text-muted)';
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '·';
  return ` <span style="font-weight:500;font-size:.68rem;color:var(--c-text-muted);font-variant-numeric:tabular-nums" title="Kauden Elo (lähtötaso 1500)${stats.elo_rank ? `, sija #${stats.elo_rank}` : ''}${change != null ? `, muutos kauden alusta ${change > 0 ? '+' : ''}${change}` : ''}">(${stats.elo}<span style="color:${color};font-size:.56rem">${arrow}${Math.abs(change ?? 0)}</span>)</span>`;
}

// ─── Otsakkeen tekijäpillerit ─────────────────────────────────────────────
//
// Kortin otsake näytti aiemmin vain Elon ja mallin todennäköisyydet. Moni
// asia joka VAIKUTTAA analyysiin — mistä kaudesta tunnusluvut on laskettu,
// onko malli edes olemassa tälle sarjalle, kuinka moni uutinen liittyy
// otteluun ja onko markkina ehtinyt hinnoitella tuoreen tiedon — jäi
// nähtäväksi vain avaamalla Analyysi- tai Uutiset-osio. Pillerit tuovat
// nämä näkyviin ilman avaamista.

function pill(icon, text, tone = 'muted') {
  return `<span class="factor-pill tone-${tone}">${icon} ${esc(text)}</span>`;
}

/** Mallin peruste: parsitaan adjustments-tekstistä, ei lasketa uudelleen */
function basisPill(match) {
  const reason = match.model.adjustments?.find((a) => a.reason?.startsWith('Voimat:'))?.reason;
  if (!reason) return null;
  const usesPrior = /viime kausi/.test(reason);
  return usesPrior
    ? pill('📐', 'osittain viime kaudelta', 'warning')
    : pill('📐', 'tämän kauden data', 'muted');
}

function modelBasisPill(match) {
  if (match.model.lambda_home === null) return pill('⚖️', 'ei tilastolähdettä — pelkkä markkina', 'warning');
  const w = match.model.blend_weight;
  if (w >= 1) return pill('⚖️', 'pelkkä oma malli — ei sharp-ankkuria', 'warning');
  return pill('⚖️', `${Math.round(w * 100)} % oma malli / ${Math.round((1 - w) * 100)} % markkina`, 'muted');
}

function newsPill(match) {
  const count = match.news?.length ?? 0;
  const strong = (match.news ?? []).filter((n) => n.confidence !== null && n.confidence > 0.7).length;
  if (!count) return pill('📰', 'ei uutisia', 'muted');
  return pill('📰', `${count} uutis${count > 1 ? 'ta' : ''}${strong ? `, ${strong} vaikuttavaa` : ''}`, strong ? 'success' : 'muted');
}

/** Kaikki analyysiin vaikuttavat tekijät yhtenä pilleririvinä otsakkeessa */
function factorPills(match) {
  const items = [];
  const h = match.stats?.home;
  const a = match.stats?.away;

  if (isVisible('elo') && h?.elo != null && a?.elo != null) {
    const diff = h.elo - a.elo;
    const exp = (eloExpected(h.elo, a.elo) * 100).toFixed(0);
    items.push(pill('📈', `Elo-ero ${diff > 0 ? '+' : ''}${diff} · odotusarvo ${exp} %`, diff > 0 ? 'success' : diff < 0 ? 'danger' : 'muted'));
  }

  const basis = basisPill(match);
  if (basis) items.push(basis);
  items.push(modelBasisPill(match));
  items.push(newsPill(match));
  if (match.analysis.news_window) items.push(pill('⚡', 'uutisikkuna auki', 'warning'));

  return items.length ? `<div class="factor-pills">${items.join('')}</div>` : '';
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
    // Kaksi eri syytä olla ilman kohdetta, ja aiemmin kortti kertoi vain
    // toisen: iso edge pienestä todennäköisyyserosta sai lukemaan "jää alle
    // 3 %:n kynnyksen" +11 %:n vieressä, mikä on suoraan väärä väite.
    const pp = (best.model_prob - best.implied_prob) * 100;
    const reason =
      best.edge > EV_CANDIDATE
        ? `edge tulee pitkästä maksusta: malli ja markkina eroavat vain <b>${pp.toFixed(1)} pp</b>, ja panossuositus vaatii ${(MIN_PROB_EDGE * 100).toFixed(0)} pp`
        : 'jää alle 3 %:n kynnyksen';
    return `<div style="margin-top:6px;padding:6px 8px;border-radius:7px;background:oklch(1 1 0/0.05);font-size:.63rem;color:var(--c-text-muted);line-height:1.45">
      ⚫ <b>Ei value-kohdetta.</b> Paras edge ${SIDE_LABELS[best.side]} ${esc(name(best.side))} @ ${num(best.odds)}
      = <b>${best.edge > 0 ? '+' : ''}${(best.edge * 100).toFixed(1)} %</b> — ${reason}, joten panossuositusta ei anneta.
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

  // Keskinaiset kohtaamiset (tiketti #69): snapshot ei sisalla niita, koska
  // sarjataulukossa ei ole ottelukohtaisia tuloksia. Haetaan ESPN:sta vasta
  // kun kayttaja avaa taman osion -- se on toisen palvelin, eika jokaista
  // ottelua katsota.
  const h2hId = `h2h-${matchIndex(match.id)}`;
  const h2h = match.stats.h2h?.length
    ? renderH2H(match.stats.h2h)
    : `<div id="${h2hId}" style="margin-top:8px;font-size:.65rem;color:var(--c-text-muted)">Haetaan aiempia kohtaamisia…</div>`;

  if (!match.stats.h2h?.length) loadH2H(match, h2hId);

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
    <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;font-size:.7rem;margin-bottom:4px;color:var(--c-text-muted)">
      <span style="text-align:right">${esc(match.home.short)}</span><span></span><span>${esc(match.away.short)}</span>
    </div>
    ${rows.join('')}
    ${h2h}
  </div>`;
}

/**
 * Ennakon karjet suoraan kortille, ilman osion avaamista.
 *
 * Kayttaja pyysi etta plussat ja miinukset NAKYVAT kortilla. Pelkka nappi
 * ei ole nakymista: se on lupaus siita etta jossain on jotain. Tassa
 * naytetaan kummankin joukkueen ENSIMMAINEN plussa ja miinus — kaikki
 * neljasta kuuteen kohtaa per joukkue tayttaisi kortin ja hukuttaisi
 * kertoimet, jotka ovat kortin paaasia.
 *
 * Loput ovat 📋 Ennakko -osiossa.
 */
function previewStrip(match) {
  const p = match.preview;
  if (!p || !isVisible('preview')) return '';

  const rivi = (team, side) => {
    const plus = side.strengths?.[0];
    const miinus = side.weaknesses?.[0];
    if (!plus && !miinus) return '';
    const lisaa = (side.strengths?.length ?? 0) + (side.weaknesses?.length ?? 0) - (plus ? 1 : 0) - (miinus ? 1 : 0);
    return `<div style="display:flex;gap:5px;align-items:baseline;font-size:.6rem;line-height:1.45">
      <b style="flex:none;color:var(--c-text-muted);min-width:38px">${esc(team.short)}</b>
      <span>
        ${plus ? `<span style="color:var(--c-success)">+</span> ${esc(plus)}` : ''}
        ${plus && miinus ? '<span style="opacity:.35"> · </span>' : ''}
        ${miinus ? `<span style="color:var(--c-danger)">−</span> ${esc(miinus)}` : ''}
        ${lisaa > 0 ? `<span style="color:var(--c-text-muted);opacity:.7"> +${lisaa} muuta</span>` : ''}
      </span>
    </div>`;
  };

  const rivit = [rivi(match.home, p.home), rivi(match.away, p.away)].filter(Boolean).join('');
  if (!rivit) return '';

  return `<div style="margin-top:5px;padding:5px 7px;background:oklch(1 1 0/0.035);border-radius:6px;border-left:2px solid oklch(1 1 0/0.12)"
    title="Kausiennakon nostot — ${esc(p.source?.name ?? 'kausiennakko')}. Avaa 📋 Ennakko nähdäksesi kaikki.">
    ${rivit}
  </div>`;
}

// ─── Osio: Kausiennakko (tiketti #103) ────────────────────────────────────
//
// Ennakon plussat ja miinukset olivat jo snapshotissa, mutta VAIN mallin
// perustelutekstissa (`model.adjustments`) — yhtena pitkana pilkkuluettelona
// Analyysi-osion pohjalla. Kayttaja ei nahnyt niita ilman etta tiesi etsia.
//
// Nyt sama tieto on kortilla rakenteisena: plussat ja miinukset erikseen,
// joukkue kerrallaan. Teksti sailyy adjustments-kentassa koska LLM-kysely ja
// laskentaerittely lukevat sita.
//
// LAHDE SANOTAAN AINA. Tama ei ole mittaus vaan yhden toimituksen arvio, ja
// kayttajan pitaa nahda kenen arvio se on ennen kuin han punnitsee sen.

function previewNotes(items, icon, color) {
  if (!items?.length) return `<div style="font-size:.62rem;color:var(--c-text-muted)">—</div>`;
  return items
    .map(
      (t) =>
        `<div style="font-size:.63rem;line-height:1.45;display:flex;gap:5px"><span style="color:${color};flex:none">${icon}</span><span>${esc(t)}</span></div>`
    )
    .join('');
}

function previewTeam(team, side) {
  const elo = side.elo != null ? `lähtö-Elo ${side.elo}` : '';
  const rank = side.rank != null ? `ennakon sija #${side.rank}` : '';
  const meta = [rank, elo].filter(Boolean).join(' · ');

  const moves = [
    side.arrivals?.length ? `➡️ tulleet: ${side.arrivals.map(esc).join(', ')}` : '',
    side.departures?.length ? `⬅️ lähteneet: ${side.departures.map(esc).join(', ')}` : '',
  ].filter(Boolean);

  return `<div style="flex:1 1 46%;min-width:150px">
    <div style="display:flex;align-items:center;gap:5px;margin-bottom:4px">
      ${teamLogo(team, 18)}<b style="font-size:.7rem">${esc(team.name)}</b>
    </div>
    ${meta ? `<div style="font-size:.58rem;color:var(--c-text-muted);margin-bottom:5px">${esc(meta)}</div>` : ''}
    ${previewNotes(side.strengths, '+', 'var(--c-success)')}
    <div style="height:4px"></div>
    ${previewNotes(side.weaknesses, '−', 'var(--c-danger)')}
    ${moves.length ? `<div style="font-size:.56rem;color:var(--c-text-muted);margin-top:5px;line-height:1.4">${moves.join('<br>')}</div>` : ''}
  </div>`;
}

function previewSection(match) {
  const p = match.preview;
  if (!p) {
    return `<div style="font-size:.7rem;color:var(--c-text-muted);padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
      Tälle sarjalle ei ole kausiennakkoa, tai malli ei nojaa siihen — kausiennakkoa
      käytetään vain kun pelattuja otteluita ei vielä ole.
    </div>`;
  }

  const lahde = p.source?.url
    ? `<a href="${esc(p.source.url)}" target="_blank" rel="noopener noreferrer" style="color:var(--c-accent)" onclick="event.stopPropagation()">${esc(p.source.name)} ↗</a>`
    : esc(p.source?.name ?? 'kausiennakko');

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
    <div style="display:flex;flex-wrap:wrap;gap:12px">
      ${previewTeam(match.home, p.home)}
      ${previewTeam(match.away, p.away)}
    </div>
    <div style="font-size:.56rem;color:var(--c-text-muted);margin-top:8px;line-height:1.5;border-top:1px dashed oklch(1 1 0/0.1);padding-top:6px">
      Lähde: ${lahde}${p.source?.readAt ? ` · luettu ${esc(p.source.readAt)}` : ''}<br>
      Ennakko on <b>yhden toimituksen arvio</b>, ei mittaus. Se on lähtöarvo kauden alkuun
      ja väistyy oikeiden otteluiden tieltä sitä mukaa kun niitä pelataan.
    </div>
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

/**
 * Tiketti #45: sama voimaluku jota λ-laskenta käytti (src/analyze/strength.ts),
 * rinnakkain molemmille joukkueille — vertailukelpoinen Joukkueet-tabin
 * taulukon kanssa. Puolustuksessa pienempi luku on parempi.
 */
function teamStrengthRow(match) {
  const h = match.model.home_strength;
  const a = match.model.away_strength;
  if (!h || !a) return '';
  return `<div style="font-size:.62rem;color:var(--c-text-muted);margin-top:4px">
    Voimaluku (1.00 = sarjan keskitaso): hyökkäys <b>${esc(match.home.short)} ${num(h.attack)}</b> − <b>${esc(match.away.short)} ${num(a.attack)}</b>
    · puolustus <b>${esc(match.home.short)} ${num(h.defense)}</b> − <b>${esc(match.away.short)} ${num(a.defense)}</b>
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
        ${teamStrengthRow(match)}
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

/**
 * Kortin oma säiliö LLM-analyysille (tiketti #38, laajennus per ottelu).
 *
 * football-llm.js renderöi TÄHÄN säiliöön imperatiivisesti, samaan tapaan
 * kuin round-wide-paneeli renderöi #llm-content:iin Vetolapulla. Tämä
 * moduuli ei tuo football-llm.js:ää importilla — silta kulkee window.BTL:n
 * kautta, sama kapea rajapinta kuin muuallakin (window.BT / window.BTF).
 */

/** Kohtaamislista yhtenaisessa muodossa riippumatta lahteesta */
function renderH2H(list) {
  return `<div style="margin-top:8px;font-size:.68rem"><b>Aiemmat kohtaamiset</b><br>${list
    .map((g) => `<span style="color:var(--c-text-muted)">${esc(g.date)}</span> ${esc(g.score)} <span style="font-size:.6rem;color:var(--c-text-muted)">(${g.venue === 'home' ? 'kotona' : 'vieraissa'})</span>`)
    .join('<br>')}</div>`;
}

/**
 * Hae kohtaamiset taustalla ja korvaa latausteksti.
 *
 * Epaonnistuminen kerrotaan eika jateta latausviestia roikkumaan: pysyva
 * "Haetaan..." nayttaa jumilta eika kerro etta dataa ei yksinkertaisesti ole.
 */
async function loadH2H(match, containerId) {
  let list = [];
  try {
    list = await fetchH2H(match.league, match.home.name, match.away.name, match.kickoff);
  } catch {
    list = [];
  }
  const el = document.getElementById(containerId);
  if (!el) return;
  el.outerHTML = list.length
    ? renderH2H(list)
    : `<div style="margin-top:8px;font-size:.65rem;color:var(--c-text-muted)">Aiempia kohtaamisia ei loytynyt talle parille.</div>`;
}
// ─── Kerroinlaskuri (tiketti #49) ─────────────────────────────────────────
//
// Käyttäjä lisää omia tekijöitä ("avainhyökkääjä poissa −15 %"), jotka
// siirtävät λ:aa ja siten koko ketjua: Poisson → blendi → edge → Kelly.
//
// Yksikkö on PROSENTTIMUUTOS λ:aan, ei maalimäärä eikä Elo-piste. Syy: se on
// sama yksikkö jota mallin omat uutissäädöt käyttävät (adjustLambda), joten
// käyttäjän tekijä ja mallin säätö ovat yhteismitallisia eivätkä kilpaile
// eri asteikoilla.
//
// Snapshotin luku näytetään AINA säädetyn rinnalla. Näin käyttäjä näkee mitä
// hänen oma arvionsa teki, eikä sekoita sitä mallin sanomaan.

/** Rivi jossa alkuperäinen ja säädetty arvo rinnakkain */
function beforeAfter(label, before, after, format = (v) => pct(v, 1)) {
  const moved = Math.abs(after - before) > 0.0005;
  return `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;font-size:.65rem;padding:2px 0;align-items:center">
    <span style="color:var(--c-text-muted)">${esc(label)}</span>
    <span style="color:var(--c-text-muted)">${format(before)}</span>
    <span style="color:var(--c-text-muted)">→</span>
    <span style="font-weight:700;color:${moved ? 'var(--c-accent)' : 'var(--c-text)'}">${format(after)}</span>
  </div>`;
}

function factorsSection(match, index) {
  if (match.model.lambda_home === null || match.model.lambda_away === null) {
    return `<div style="font-size:.7rem;color:var(--c-text-muted);padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
      Tälle ottelulle ei ole maalimallia (<b>market-only</b>), joten λ:aa ei ole olemassa eikä sitä voi säätää.
      Kerroinlaskuri vaatii tunnuslukulähteen sarjalle.
    </div>`;
  }

  const factors = calc.factorsFor(match.id);
  const bankroll = window.BT?.getBankroll?.() ?? 100;
  const r = calc.recalculate(match, factors, bankroll);
  if (!r) return '<div class="empty" style="font-size:.7rem">Laskenta ei onnistunut.</div>';

  const list = factors.length
    ? factors
        .map(
          (f) => `<div class="row" style="font-size:.66rem;padding:4px 0;border-bottom:1px dashed oklch(1 1 0/0.1)">
        <span>${f.side === 'home' ? '🏠' : '✈️'} ${esc(f.label)}
          <b style="color:${f.delta > 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${f.delta > 0 ? '+' : ''}${(f.delta * 100).toFixed(0)} %</b>
        </span>
        <button class="btn btn-danger" style="font-size:.55rem;padding:2px 7px;min-height:24px;border-radius:12px" onclick="event.stopPropagation();window.BTF.removeFactor('${esc(match.id)}',${f.id})">✕</button>
      </div>`
        )
        .join('')
    : '<div style="font-size:.64rem;color:var(--c-text-muted);padding:4px 0">Ei omia tekijöitä — luvut ovat mallin omat.</div>';

  const edgeRows = r.edges
    .map((e) => {
      const label = e.side === 'home' ? match.home.short : e.side === 'away' ? match.away.short : 'Tasapeli';
      const color = e.edge > 0.05 ? 'var(--c-success)' : e.edge > 0.03 ? 'var(--c-warning)' : e.edge > 0 ? 'var(--c-text-muted)' : 'var(--c-danger)';
      const moved = Math.abs(e.edge - e.base_edge) > 0.0005;
      return `<div style="display:grid;grid-template-columns:auto 1fr auto auto;gap:6px;font-size:.65rem;padding:3px 0;align-items:center">
        <span style="font-weight:700;width:14px">${SIDE_LABELS[e.side]}</span>
        <span style="color:var(--c-text-muted)">${esc(label)} @ ${num(e.odds)}</span>
        <span style="color:var(--c-text-muted)">${(e.base_edge * 100).toFixed(1)} % →</span>
        <span style="font-weight:700;color:${color}">${e.edge > 0 ? '+' : ''}${(e.edge * 100).toFixed(1)} %${moved ? '' : ''}</span>
      </div>
      ${e.stake_suggestion > 0 || e.base_stake > 0
        ? `<div style="font-size:.6rem;color:var(--c-text-muted);padding-left:20px;margin-bottom:2px">panos ${e.base_stake.toFixed(2)} € → <b style="color:${e.stake_suggestion > 0 ? 'var(--c-success)' : 'var(--c-text-muted)'}">${e.stake_suggestion.toFixed(2)} €</b></div>`
        : ''}`;
    })
    .join('');

  return `<div style="padding:8px;background:oklch(1 1 0/0.04);border-radius:8px">
    <div style="font-size:.68rem;font-weight:700;margin-bottom:4px">🧮 Omat tekijät</div>
    <div style="font-size:.62rem;color:var(--c-text-muted);line-height:1.5;margin-bottom:6px">
      Tekijä siirtää odotettua maalimäärää prosentteina — sama yksikkö jota mallin omat uutissäädöt käyttävät.
      Esim. <i>avainhyökkääjä poissa</i> → koti <b>−15 %</b>. Muutos vaikuttaa edgeen ja panossuositukseen.
    </div>

    ${list}

    <div style="display:grid;grid-template-columns:1fr auto auto;gap:5px;margin-top:8px">
      <input type="text" id="fac-label-${index}" placeholder="esim. avainhyökkääjä poissa" maxlength="40"
        style="padding:6px;border-radius:4px;border:1px solid var(--c-text-muted);background:var(--c-bg);color:var(--c-text);font-size:.68rem">
      <select id="fac-side-${index}" style="padding:6px;border-radius:4px;border:1px solid var(--c-text-muted);background:var(--c-bg);color:var(--c-text);font-size:.68rem">
        <option value="home">🏠 ${esc(match.home.short)}</option>
        <option value="away">✈️ ${esc(match.away.short)}</option>
      </select>
      <input type="number" id="fac-delta-${index}" value="-15" step="5" min="-90" max="200"
        style="width:64px;padding:6px;border-radius:4px;border:1px solid var(--c-text-muted);background:var(--c-bg);color:var(--c-text);font-size:.68rem;text-align:center" title="Muutos prosentteina">
    </div>
    <div style="display:flex;gap:5px;margin-top:5px">
      <button class="btn btn-primary" style="flex:1;font-size:.65rem;min-height:32px" onclick="event.stopPropagation();window.BTF.addFactor('${esc(match.id)}',${index})">➕ Lisää tekijä</button>
      ${factors.length ? `<button class="btn" style="font-size:.65rem;min-height:32px;background:oklch(1 1 0/0.1);color:var(--c-text)" onclick="event.stopPropagation();window.BTF.clearFactors('${esc(match.id)}')">🔄 Nollaa</button>` : ''}
    </div>

    <div style="margin-top:10px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.12)">
      <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:6px;font-size:.58rem;color:var(--c-text-muted);border-bottom:1px solid oklch(1 1 0/0.1);padding-bottom:2px">
        <span></span><span>malli</span><span></span><span>säädetty</span>
      </div>
      ${beforeAfter(`λ ${match.home.short}`, match.model.lambda_home, r.lambdaHome, (v) => num(v, 2))}
      ${beforeAfter(`λ ${match.away.short}`, match.model.lambda_away, r.lambdaAway, (v) => num(v, 2))}
      ${beforeAfter('1 kotivoitto', match.model.probs.home, r.probs.home)}
      ${beforeAfter('X tasapeli', match.model.probs.draw, r.probs.draw)}
      ${beforeAfter('2 vierasvoitto', match.model.probs.away, r.probs.away)}
      ${match.model.over25 !== null ? beforeAfter('Yli 2.5 maalia', match.model.over25, r.over25) : ''}
      ${match.model.btts !== null ? beforeAfter('Molemmat maalin', match.model.btts, r.btts) : ''}
    </div>

    <div style="margin-top:8px;padding-top:6px;border-top:1px dashed oklch(1 1 0/0.12)">
      <div style="font-size:.64rem;font-weight:700;margin-bottom:3px">Edge ja panos</div>
      ${edgeRows}
    </div>

    <div style="font-size:.58rem;color:var(--c-text-muted);margin-top:7px;line-height:1.5">
      Laskenta tehdään selaimessa samoilla kaavoilla kuin palvelimella (todennettu yksikkötesteillä).
      Omat tekijät ovat <b>sinun arviosi</b>, eivät mallin — ne tallentuvat vain tähän selaimeen.
    </div>
  </div>`;
}

export function llmContainerId(match) {
  return `fllm-${match.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

const SECTIONS = {
  stats: { icon: '📊', label: 'Tunnusluvut', render: statsSection },
  // `available` rajaa napin niihin otteluihin joilla ennakko oikeasti on.
  // Ilman sita jokainen jalkapallokortti saisi napin joka avaa tyhjan osion.
  preview: { icon: '📋', label: 'Ennakko', render: previewSection, available: (m) => Boolean(m.preview) },
  news: { icon: '📰', label: 'Uutiset', render: newsSection },
  analysis: { icon: '💎', label: 'Analyysi', render: analysisSection },
  calc: { icon: '🔬', label: 'Laskenta', render: calcSection },
  factors: { icon: '🧮', label: 'Kerroinlaskuri', render: factorsSection },
  llm: { icon: '🤖', label: 'Kysy LLM:ltä', render: (match) => `<div id="${llmContainerId(match)}"></div>` },
  // Tiketti #105: jälkiarvio näkyy vain päättyneille jääkiekko-otteluille
  // joille cron on ehtinyt tuottaa data/liiga-reviews.json:in rivin.
  // `available` lataa tiedoston tarvittaessa taustalla (hasReview) — se ei
  // saa estää muiden napppien piirtymistä sillä välin kun lataus on kesken.
  review: { icon: '🔍', label: 'Jälkiarvio', render: reviewSection, available: (m) => sportOfMatch(m) === 'hockey' && hasReview(m) },
};

/** Avoimet osiot pidetään muistissa, jotta uudelleenrenderöinti ei sulje niitä */
const openSections = new Map();

export function toggleSection(index, key) {
  const current = openSections.get(index);
  openSections.set(index, current === key ? null : key);
  renderAllCards();
}

// ─── Kerroinlaskurin käsittelijät (tiketti #49) ───────────────────────────

export function addFactorFromForm(matchId, index) {
  const label = document.getElementById(`fac-label-${index}`)?.value.trim();
  const side = document.getElementById(`fac-side-${index}`)?.value;
  const percent = parseFloat(document.getElementById(`fac-delta-${index}`)?.value ?? '');

  if (!label) {
    window.BT?.toast?.('⚠️ Anna tekijälle nimi');
    return;
  }
  if (!Number.isFinite(percent) || percent === 0) {
    window.BT?.toast?.('⚠️ Anna muutos prosentteina (esim. −15)');
    return;
  }
  // −90 % on käytännön alaraja: λ ei mene nollaan (adjustLambda lattioi 0.1),
  // mutta sitä pienempi luku ei enää tarkoita mitään tulkittavaa.
  const clamped = Math.max(-90, Math.min(200, percent));

  calc.addFactor(matchId, { label, side: side === 'away' ? 'away' : 'home', delta: clamped / 100 });
  renderAllCards();
  window.BT?.toast?.(`🧮 ${label} ${clamped > 0 ? '+' : ''}${clamped} %`);
}

export function removeFactorById(matchId, factorId) {
  calc.removeFactor(matchId, factorId);
  renderAllCards();
}

export function clearFactorsFor(matchId) {
  calc.clearFactors(matchId);
  renderAllCards();
  window.BT?.toast?.('🔄 Omat tekijät nollattu');
}

function sectionButtons(match, index) {
  const visible = Object.entries(SECTIONS).filter(
    ([key, s]) => isVisible(key) && (!s.available || s.available(match))
  );
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
/**
 * Ottelun lopputulos jos se on tiedossa (tiketti #84).
 *
 * Kortti nayttoi "alkanut" myos ottelulle joka oli pelattu loppuun tunteja
 * sitten. Se on teknisesti tosi mutta hyodyton: se ei kerro mita tapahtui.
 *
 * Kaksi lahdetta, kumpikin oikea:
 *   1. palvelinarkiston `result` — tulee odds-history.json:ista
 *   2. kalenterin pistemaara    — ESPN:n otteluohjelmasta
 * Ensimmainen voittaa koska se on jo tulkittu lopputulokseksi (1X2).
 */
function finalScore(match) {
  const r = match.result;
  if (r && Number.isFinite(r.home_score) && Number.isFinite(r.away_score)) {
    return { home: r.home_score, away: r.away_score, outcome: r.outcome };
  }

  const fx = timeline.calendarMatch(match.id);
  if (fx?.status === 'finished' && Number.isFinite(fx.home_score) && Number.isFinite(fx.away_score)) {
    const outcome = fx.home_score > fx.away_score ? 'home' : fx.away_score > fx.home_score ? 'away' : 'draw';
    return { home: fx.home_score, away: fx.away_score, outcome };
  }
  return null;
}

  const flag = best && best.flag !== 'none' ? FLAG_META[best.flag] : null;
  const flagBadge = flag
    ? `<span class="badge ${flag.badge}" title="${flag.label}: ${SIDE_LABELS[best.side]} @ ${best.odds.toFixed(2)} (${esc(best.book ?? '')})">${flag.icon} ${(best.edge * 100).toFixed(1)} %</span>`
    : '';

  // Ratkennut ottelu kertoo tuloksen; muuten aika aloitukseen
  const score = finalScore(match);
  const statusLabel = score
    ? `<b style="color:var(--c-text);font-variant-numeric:tabular-nums">${score.home}–${score.away}</b> · ratkennut`
    : esc(timeUntil(match.kickoff));

  return `<div class="card">
    <div style="display:flex;justify-content:space-between;align-items:center;font-size:.62rem;color:var(--c-text-muted)">
      <span>${esc(match.league)} · ${kickoffLabel(match.kickoff)}</span>
      <span>${statusLabel}</span>
    </div>

    <div class="row" style="margin-top:5px">
      <span class="matchup">${teamLogo(match.home)}<strong>${esc(match.home.name)}${eloParen(match.stats?.home)}</strong><span class="vs">–</span><strong>${esc(match.away.name)}${eloParen(match.stats?.away)}</strong>${teamLogo(match.away)}</span>
      ${flagBadge}
    </div>

    ${factorPills(match)}
    ${previewStrip(match)}
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
/**
 * Lähdebanneri.
 *
 * `day` on katsottava päivä. Se on olennainen, koska vanhentuneisuus on
 * SUHTEELLINEN KATSOTTAVAAN PÄIVÄÄN eikä kelloon: mennyttä kierrosta
 * katsottaessa kertoimien KUULUU olla vanhoja, eikä "aja putki uudelleen"
 * ole silloin ohje vaan hämmennystä — putken ajaminen ei tuo takaisin
 * hintoja jotka olivat voimassa eilen.
 */
function sourceBanner(snapshot, day = null) {
  const isMock = snapshot.source === 'mock';
  const ageMin = Math.round((Date.now() - Date.parse(snapshot.generated_at)) / 60000);
  const isPast = Boolean(day) && day < localDayKey(new Date());
  const stale = ageMin > 240 && !isPast;

  const warning = isMock
    ? `<div class="badge badge-yellow" style="font-size:.55rem">ESIMERKKIDATA</div>`
    : isPast
      ? `<div class="badge badge-muted" style="font-size:.55rem">ARKISTO</div>`
      : stale
        ? `<div class="badge badge-yellow" style="font-size:.55rem">VANHENTUNUT</div>`
        : `<div class="badge badge-green" style="font-size:.55rem">OIKEAT KERTOIMET</div>`;

  const note = isMock
    ? 'Nämä eivät ole oikeita kertoimia. Aja <code>npm run snapshot:live</code> hakeaksesi oikeat.'
    : isPast
      ? 'Mennyt kierros. Kertoimet ovat ne jotka olivat voimassa ennen ottelua — vetoa ei voi enää lyödä.'
      : stale
        ? `Kertoimet haettu ${ageMin} min sitten — ne ovat todennäköisesti liikkuneet. Aja putki uudelleen.`
        : `Kertoimet haettu ${ageMin} min sitten.`;

  const border = isMock || stale ? 'var(--c-warning)' : isPast ? 'oklch(1 1 0/0.14)' : 'oklch(0.62 0.20 145 / 0.4)';

  return `<div class="card" style="border:1px solid ${border}">
    <div class="row"><strong style="font-size:.8rem">${isPast ? '📜 Menneen päivän kohteet' : '⚽ Päivän kohteet'}</strong>${warning}</div>
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

  // Harjoitustilassa yksikkö on kierros eikä päivä: harjoituskierrosten
  // ottelupäivät ovat kiinteitä eivätkä seuraa kalenteria, joten
  // päivänavigointi piilottaisi koko kierroksen.
  const practice = getDataSource() === 'mock';
  if (practice) {
    renderMatchList(visibleBySport(currentSnapshot.matches), { practice: true });
    return;
  }

  const mode = getDayFilter();

  if (mode === 'all') {
    // TAMA HAARA ON TARKOITUKSELLA JALJELLA vaikka "Kaikki"-nappi poistui
    // tiketissa #82. Kaksi syyta:
    //
    //   1. Aiemmin napin painanut kayttaja on 'all' localStoragessaan.
    //      Ilman tata haaraa han nakisi tyhjaa; nyt paivan klikkaus
    //      siirtaa hanet pois (ks. timeline.select()).
    //   2. E2E-fikstuuri asettaa sen tahallaan: sen ottelut ovat
    //      nyt+2h...nyt+5h ja valuvat kahdelle kalenteripaivalle jos testi
    //      ajetaan illalla. Paivasuodatin piilottaisi osan, ja testit
    //      alkaisivat hailya kellonajan mukaan.
    //
    // "Kaikki" tarkoittaa kaikkia, myos jo alkaneita. Aiemmin tama
    // suodatti alkaneet pois, jolloin "Kaikki" saattoi nayttaa VAHEMMAN
    // otteluita kuin "Tanaan" -- epajohdonmukaisuus jonka testi nappasi.
    const ordered = visibleBySport(currentSnapshot.matches).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
    renderMatchList(ordered, { mode });
    return;
  }

  // Päivänäkymä: snapshot + arkisto samalle päivälle.
  //
  // Snapshot sisältää vain sen mitä API tarjoaa juuri nyt — eiliset ottelut
  // ovat pudonneet siitä pois. Arkisto (tiketti #60) täydentää ne takaisin,
  // jotta eilisen kertoimet ja mallin arvio ovat yhä nähtävissä.
  const day = selectedDayKey(mode);
  const fromSnapshot = visibleBySport(currentSnapshot.matches).filter((m) => localDayKey(m.kickoff) === day);

  // Kolme lahdetta, heikoimmasta vahvimpaan:
  //   1. palvelinarkisto  — mita cron on kerannyt, kaikilla sama
  //   2. selainarkisto    — mita TAMA selain on nahnyt, tuoreempi
  //   3. snapshot         — mita API tarjoaa juuri nyt
  //
  // Tiketti #83: ilman kohtaa 1 tyhjalla selaimella mennyt paiva nayttaisi
  // tyhjalta, vaikka palvelimella on kertoimet, tunnusluvut ja tulos.
  const byId = new Map();
  for (const a of visibleBySport(serverArchiveDay(day))) byId.set(a.id, a);
  for (const a of visibleBySport(archivedDay(day))) byId.set(a.id, toCardShape(a));
  for (const m of fromSnapshot) byId.set(m.id, m);

  const all = [...byId.values()].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  // Tänään: alkaneet pois toimintalistalta (ne näkyvät "Tänään pelatut"
  // -osiossa). Menneet ja tulevat päivät näytetään kokonaan.
  // Tanaan: alkaneet pois toimintalistalta (ne nakyvat "Tanaan pelatut"
  // -osiossa). Menneet ja tulevat paivat naytetaan kokonaan.
  const upcoming = mode === 0 ? all.filter((m) => Date.parse(m.kickoff) >= Date.now() || m.fromArchive) : all;

  // VARAKEINO: jos suodatus ei jata mitaan mutta naytettavaa olisi, naytetaan
  // alkaneet merkittyna. Alkaneen piilottaminen on oikein niin kauan kuin
  // muuta on jaljella -- tyhja sivu on aina huonompi kuin vanhentunut kortti
  // jonka vieressa lukee etta se on vanhentunut.
  //
  // Tama logiikka oli olemassa ennen tiketin #60 refaktorointia ja katosi
  // siina. Seuraus: kun paivan ainoa ottelu oli alkanut, koko kierrosnakyma
  // oli tyhja. Regressiotesti lukitsee taman nyt.
  const fellBackToStarted = mode === 0 && upcoming.length === 0 && all.length > 0;
  const visible = fellBackToStarted ? all : upcoming;

  renderMatchList(visible, { mode, day, total: all.length, fellBackToStarted });
}

/**
 * Näytettävä päivä.
 *
 * Aikajanan valinta on absoluuttinen päivä ja voittaa siirtymäpohjaisen
 * suodattimen. Ilman kalenteria (fixtures.json puuttuu tai ei latautunut)
 * palataan vanhaan siirtymään, jolloin kortit toimivat kuten ennen.
 */
function selectedDayKey(mode) {
  const cal = timeline.getCalendar();
  if (cal?.days?.length) {
    const today = timeline.todayKey();
    return timeline.getSelectedDay() ?? timeline.nearestDay(cal.days, today);
  }
  return dayKeyForOffset(mode);
}

/** Päiväavain siirtymän mukaan: -1 = eilen, 0 = tänään, 1 = huomenna */
function dayKeyForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDayKey(d);
}

/**
 * Paivanavigointi: viisi nappia (tiketti #82).
 *
 * Varit tulevat .day-btn-luokasta (demo.html) eivatka inline-tyyleista:
 * kovakoodattu tausta katosi kasino-teeman gradientilla (tiketti #66).
 *
 * Renderoidaan MYOS 'all'-tilassa, vaikka sita ei voi enaa valita: aiemmin
 * "Kaikki"-napin painanut on se localStoragessaan, ja ilman navigointia han
 * jaisi tilaan josta ei paase pois. Paivan klikkaus siirtaa pois (ks.
 * timeline.select()), joten yksi painallus riittaa.
 */
function dayNav() {
  return timeline.renderNav();
}

/** Yhteinen renderöinti kaikille päivänäkymille */
function renderMatchList(list, opts = {}) {
  const { practice = false, mode = 0, day = null, total = list.length, fellBackToStarted = false } = opts;

  // Value-kohteet ensin, sitten aikajärjestyksessä — käyttäjä näkee löydöt heti
  const ordered = [...list].sort((a, b) => {
    // Sama kriteeri kuin laskurissa ja korteissa: palvelimen lippu.
    const fa = hasFlag(a) ? 1 : 0;
    const fb = hasFlag(b) ? 1 : 0;
    if (fb !== fa) return fb - fa;
    // Liputettujen kesken suurin edge ensin
    if (fa === 1) return (bestEdge(b)?.edge ?? 0) - (bestEdge(a)?.edge ?? 0);
    return Date.parse(a.kickoff) - Date.parse(b.kickoff);
  });

  const flaggedCount = list.filter(hasFlag).length;
  const archived = list.filter((m) => m.fromArchive).length;

  const notes = [];
  if (archived) notes.push(`${archived} arkistosta — kertoimet ovat historiaa, vetoa ei voi enää lyödä`);
  if (fellBackToStarted) notes.push('⚠️ paivan ottelut ovat alkaneet — kertoimet ovat vanhentuneet');
  else if (mode === 0 && total > list.length) notes.push(`${total - list.length} alkanutta piilotettu`);

  const summary = `<div style="font-size:.65rem;color:var(--c-text-muted);margin:0 0 8px 2px">
    <b style="color:var(--c-text)">${list.length}</b> ottelua ·
    ${flaggedCount ? `<b style="color:var(--c-success)">${flaggedCount} value-kohdetta</b>` : 'ei value-kohteita — markkina on tiukka'}
    ${notes.length ? `<br><span style="font-size:.58rem">${notes.join(' · ')}</span>` : ''}
  </div>`;

  const nav = practice ? '' : dayNav();

  if (!list.length) {
    // Tyhja paiva ei ole umpikuja. Menneelle paivalle kerrotaan miksi arkisto
    // on tyhja, tulevalle tarjotaan HAKUNAPPI joka noutaa ottelut ESPN:sta.
    // Haku tehdaan vasta napista: se on toisen palvelin, eika kayttajaa
    // kiinnosta huominen ennen kuin han sita kysyy.
    // Tulevaisuus ratkaisee, ei siirtymä: aikajanan valinta on absoluuttinen
    // päivä, joten mode voi olla 0 vaikka katsottaisiin ensi viikkoa.
    const today = localDayKey(new Date());
    const isFuture = Boolean(day) && day > today;
    const isPast = Boolean(day) && day < today;
    const canFetch = mode !== 'all' && isFuture;
    const explain = isPast
      ? 'Arkistoituja kohteita ei ole talle paivalle.'
      : canFetch
        ? 'Kertoimia ei ole viela haettu talle paivalle.'
        : '';

    container.innerHTML =
      roundNav() +
      nav +
      sourceBanner(currentSnapshot, day) +
      summary +
      `<div class="empty">Ei otteluita talle paivalle.${explain ? ' ' + explain : ''}</div>` +
      (canFetch
        ? `<button class="btn btn-primary btn-block" style="margin-top:8px;font-size:.7rem" onclick="window.BTF.fetchDay('${day}')">🔎 Hae ottelut ja kertoimet</button>`
        : '') +
      `<div id="day-preview"></div>` +
      // Kertoimia ei ole, mutta otteluohjelma voi silti olla
      (day ? timeline.renderDayFixtures(day, new Set()) : '');
    return;
  }

  // Indeksi pitää olla uniikki DOM-tunnisteita varten. Arkistokortti ei ole
  // snapshotissa, joten sille annetaan oma numeroavaruus.
  const indexOf = (m) => {
    const i = currentSnapshot.matches.indexOf(m);
    return i >= 0 ? i : 1000 + ordered.indexOf(m);
  };

  // Tiketti #79: samana päivänä pelattavat ottelut joille ei ole kertoimia.
  // Ne EIVÄT ole kortteja vaan pelkkä lista — kertoimeton ottelu ei ole
  // vedonlyöntikohde, mutta sen piilottaminen saisi näyttämään siltä ettei
  // ottelua ole.
  const knownIds = new Set(ordered.map((m) => m.id));
  const alsoToday = practice || !day ? '' : timeline.renderDayFixtures(day, knownIds);

  container.innerHTML =
    roundNav() +
    nav +
    sourceBanner(currentSnapshot, day) +
    summary +
    ordered.map((m) => matchCard(m, indexOf(m))).join('') +
    alsoToday;
  renderPlacedBets();
  renderOpenLlmPanels();
}


/**
 * Täytä auki olevat "Kysy LLM:ltä" -säiliöt.
 *
 * Placeholder-div syntyy vasta innerHTML-asetuksessa, joten renderForMatch
 * voidaan kutsua vasta tämän jälkeen. Suljetuille kortin osioille säiliötä
 * ei ole DOM:ssa — niitä ei yritetä täyttää.
 */
function renderOpenLlmPanels() {
  if (!window.BTL || !currentSnapshot) return;
  currentSnapshot.matches.forEach((match, index) => {
    if (openSections.get(index) !== 'llm') return;
    const bets = window.BT?.getBets?.()?.filter((b) => b.game_id === match.id) ?? [];
    window.BTL.renderForMatch(llmContainerId(match), match, bets);
  });
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

// ─── Tulevan päivän ennakkohaku (tiketti #63) ─────────────────────────────

/**
 * Hae yhden päivän ottelut ESPN:stä napin takaa.
 *
 * MIKSI VASTA NAPISTA: tämä on toisen palvelin, eikä käyttäjää kiinnosta
 * huominen ennen kuin hän sitä kysyy. Automaattinen haku joka päivänvaihdolla
 * kuormittaisi turhaan.
 *
 * MIKSI EI EDGEÄ: ESPN antaa kertoimet vain yhdeltä toimistolta (DraftKings).
 * Analyysimme rakentuu kymmenen eurooppalaisen toimiston konsensuksen ja
 * Pinnacle-ankkurin varaan — yhden toimiston hinnasta laskettu edge olisi eri
 * mittari samalla nimellä. Siksi tämä on ENNAKKO, ei analyysi.
 */
/**
 * Hae yhden päivän ottelut ESPN:stä.
 *
 * Hyväksyy sekä päivämäärän ("2026-08-29") että siirtymän (2). Päivämäärä
 * on se jota aikajana käyttää; siirtymä säilyy, koska ilman kalenteria
 * kortit palaavat vanhaan päivänavigointiin ja kutsuvat tätä numerolla.
 */
export async function fetchDay(dayOrOffset) {
  const el = document.getElementById('day-preview');
  if (!el) return;

  let stamp;
  if (typeof dayOrOffset === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dayOrOffset)) {
    stamp = dayOrOffset.replace(/-/g, '');
  } else {
    const d = new Date();
    d.setDate(d.getDate() + Number(dayOrOffset || 0));
    stamp = ymd(d);
  }

  const snap = getSnapshot();
  const names = new Set((snap?.matches ?? []).map((m) => m.league));
  const codes = [...names].map((n) => LEAGUE_CODES[n]).filter(Boolean);
  const leagues = codes.length ? [...new Set(codes)] : ['eng.1'];

  el.innerHTML = '<div style="font-size:.68rem;color:var(--c-text-muted);padding:8px">Haetaan…</div>';

  const found = [];
  const failed = [];
  for (const code of leagues) {
    try {
      for (const m of await fetchFixtures(code, stamp, stamp)) found.push(m);
    } catch (err) {
      failed.push(code);
    }
  }
  found.sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));

  if (!found.length) {
    el.innerHTML = `<div style="font-size:.68rem;color:var(--c-text-muted);padding:8px">
      Ei otteluita tälle päivälle näissä sarjoissa.${failed.length ? ` (${failed.length} sarjan haku epäonnistui)` : ''}
    </div>`;
    return;
  }

  const rows = found
    .map((m) => {
      const p = m.preview;
      const price = (v) => (v ? v.toFixed(2) : '—');
      const odds = p
        ? `<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:5px;font-size:.7rem;text-align:center">
             <span>1 <b>${price(p.home)}</b></span>
             <span>X <b>${price(p.draw)}</b></span>
             <span>2 <b>${price(p.away)}</b></span>
           </div>
           <div style="font-size:.55rem;color:var(--c-text-muted);margin-top:3px">Lähde: ${esc(p.provider)} — yksi toimisto, ei mallin arviota</div>`
        : '<div style="font-size:.6rem;color:var(--c-text-muted);margin-top:4px">Kertoimia ei vielä saatavilla</div>';

      return `<div class="card">
        <div class="row">
          <span style="font-size:.74rem">${esc(m.home)} – ${esc(m.away)}</span>
          <span style="font-size:.62rem;color:var(--c-text-muted)">${esc(kickoffLabel(m.kickoff))}</span>
        </div>
        ${odds}
      </div>`;
    })
    .join('');

  el.innerHTML = `<div style="font-size:.63rem;color:var(--c-text-muted);margin:10px 0 6px 2px">
      🔎 <b style="color:var(--c-text)">${found.length} ottelua</b> — ennakkotieto ESPN:stä.
      Täysi analyysi (10 toimistoa, malli, edge, panossuositus) tulee snapshot-putkesta.
    </div>${rows}`;
}
