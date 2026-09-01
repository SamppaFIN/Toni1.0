// Tiketti #103: käsin syötetyt kertoimet olemassa olevaan snapshottiin
//
// MIKSI TÄMÄ ON ERILLINEN AJO, vaikka `snapshot:live` tekee saman lennossa:
//
//   1. Kerroinhaku maksaa kvoottaa. Kun käsisyötettyä tiedostoa muokataan
//      (uusi kierros, korjattu hinta), koko putken ajaminen uudelleen
//      polttaisi krediittejä pelkän tekstitiedoston takia.
//   2. Cron-ajossa tämä on NÄKYVÄ VAIHE. Jos rivit eivät täsmää, se
//      sanotaan lokissa omalla rivillään eikä hukkaannu kerroinhaun sekaan.
//
// TÄMÄ EI OLE PELKKÄ LISÄYS LISTAAN. Käsisyötetty hinta osallistuu kaikkeen
// mitä hinnoista johdetaan: paras hinta, kate, markkinamediaani, edge ja
// Kelly-panos. Siksi kortti rakennetaan kokonaan uudelleen `buildMatchCard`:lla
// eikä riviä työnnetä valmiiseen korttiin — muuten kerroinlista näyttäisi
// hinnan jota analyysi ei tunne, ja kortti sanoisi kahta eri asiaa.
//
// Ajo: npm run odds:manual

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config } from '../config.js';
import { sportOf } from '../leagues.js';
import { applyDrawBoost } from '../analyze/hockey-draws.js';
import { predictFromLambda } from '../analyze/poisson.js';
import { applyManualOdds, loadManualOdds, unmatchedEvents, ManualOddsTarget } from '../ingest/odds-manual.js';
import { priorModelFields } from './live-snapshot.js';
import { priorEloMap } from '../analyze/liiga-priors.js';
import { buildMatchCard, buildSnapshot, writeSnapshot } from './snapshot.js';
import { MatchCard, Snapshot } from '../types-football.js';

/** Sarjatunniste ottelun id:stä: "icehockey_liiga:2026-09-01:JUK-HPK" */
export function sportKeyOf(matchId: string): string {
  return String(matchId ?? '').split(':')[0] ?? '';
}

/**
 * Kortti takaisin kerroinhaun tapahtuman muotoon.
 *
 * Vain ne kentät joita täsmäytys ja kortin uudelleenrakennus tarvitsevat —
 * tämä ei yritä olla täydellinen käänteisoperaatio.
 */
function asTarget(m: MatchCard): ManualOddsTarget & { card: MatchCard } {
  return {
    sportKey: sportKeyOf(m.id),
    kickoff: m.kickoff,
    home: m.home,
    away: m.away,
    odds: m.odds,
    card: m,
  };
}

/**
 * Rakenna kortti uudelleen samoilla kertoimilla mutta täydellä laskennalla.
 *
 * Mallin lähde valitaan samalla säännöllä kuin `live-snapshot.ts:buildCard`:
 *
 *   - λ tallessa  -> Poisson palautetaan λ-arvoista (`predictFromLambda`).
 *     Jääkiekolle tasapelikorjaus uudelleen, koska se on osa 1X2-jakaumaa
 *     eikä λ:aa (tiketti #93) — ilman sitä tasapelin todennäköisyys putoaisi
 *     hiljaa joka ajolla.
 *   - λ puuttuu   -> kausiennakko jos sarjalle on sellainen, muuten
 *     market-only kuten ennenkin.
 *
 * Tunnusluvut, perustelut ja voimaluvut kannetaan sellaisenaan: ne eivät
 * riipu kertoimista, joten niiden uudelleenlaskenta ei toisi mitään.
 */
export function rebuildCard(m: MatchCard, bankroll = 100): MatchCard {
  const sportKey = sportKeyOf(m.id);
  const base = {
    id: m.id,
    league: m.league,
    kickoff: m.kickoff,
    home: m.home,
    away: m.away,
    odds: m.odds,
    news: m.news ?? [],
    newsWindow: m.analysis?.news_window ?? false,
    bankroll,
  };

  if (m.model.lambda_home !== null && m.model.lambda_away !== null) {
    let poisson = predictFromLambda(m.model.lambda_home, m.model.lambda_away, config.model.rho);
    if (sportOf(sportKey) === 'hockey') poisson = { ...poisson, probs: applyDrawBoost(poisson.probs) };

    return buildMatchCard({
      ...base,
      poisson,
      stats: m.stats,
      adjustments: m.model.adjustments ?? [],
      blendWeight: m.model.blend_weight,
      homeStrength: m.model.home_strength ?? null,
      awayStrength: m.model.away_strength ?? null,
      ...(m.preview ? { preview: m.preview } : {}),
    });
  }

  // Ei λ:aa: kausiennakko on ainoa jäljellä oleva malli. Se rakennetaan
  // samasta lähteestä kuin putkessa, joten luku ei voi erota.
  const prior = priorModelFields(
    { sportKey, league: m.league, kickoff: m.kickoff, home: m.home, away: m.away } as never,
    sportOf(sportKey) === 'hockey' ? priorEloMap() : null
  );

  return buildMatchCard(prior ? { ...base, ...prior } : { ...base, poisson: null, stats: m.stats });
}

export interface ApplyResult {
  snapshot: Snapshot;
  added: number;
  unmatched: number;
}

/**
 * Lisää käsisyötetyt kertoimet snapshottiin ja laske kortit uudelleen.
 *
 * Kortit rakennetaan uudelleen VAIN jos rivejä oikeasti lisättiin: turha
 * uudelleenlaskenta muuttaisi `generated_at`-leiman ja tuottaisi committiin
 * diffin joka ei vastaa mitään muutosta.
 */
export function applyToSnapshot(snapshot: Snapshot, file = loadManualOdds(), bankroll = 100): ApplyResult {
  const targets = snapshot.matches.map(asTarget);
  const added = applyManualOdds(targets, file);
  const missed = unmatchedEvents(targets, file);

  for (const m of missed) {
    console.warn(`[Kasisyotto] rivi ei tasmannyt yhteenkaan otteluun: ${m.date} ${m.home} vs ${m.away}`);
  }
  if (!added) return { snapshot, added: 0, unmatched: missed.length };

  const providerName = `${file!.bookmaker} (kasin syotetty)`;
  const providers = snapshot.providers.includes(providerName)
    ? snapshot.providers
    : [...snapshot.providers, providerName];

  const rebuilt = buildSnapshot(
    snapshot.matches.map((m) => rebuildCard(m, bankroll)),
    snapshot.source,
    new Date().toISOString(),
    providers
  );

  return { snapshot: rebuilt, added, unmatched: missed.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
  const todayPath = path.join(publicDir, 'data', 'today.json');

  let snapshot: Snapshot;
  try {
    snapshot = JSON.parse(readFileSync(todayPath, 'utf8')) as Snapshot;
  } catch (err) {
    // Puuttuva snapshot ei ole tämän ajon vika: se tarkoittaa että
    // kerroinhaku ei ole vielä tuottanut mitään. Ei kaadeta cronia.
    console.warn(`⚠️  ${todayPath} ei luettavissa (${(err as Error).message}) — ei mitään mihin lisätä.`);
    process.exit(0);
  }

  const file = loadManualOdds();
  if (!file) {
    console.log('Ei käsin syötettyjä kertoimia (data/veikkaus-odds-manual.json puuttuu tai ei kelpaa).');
    process.exit(0);
  }

  console.log(`Käsisyöttö: ${file.bookmaker} · ${file.events.length} riviä · syötetty ${file.entered_at}`);
  console.log(`Lähde: ${file.source}`);

  const { snapshot: next, added, unmatched } = applyToSnapshot(snapshot, file);

  if (!added) {
    console.log(`Ei lisättävää — ${unmatched} riviä ei täsmännyt yhteenkään otteluun snapshotissa.`);
    process.exit(0);
  }

  const { todayPath: written } = writeSnapshot(next, publicDir);
  console.log(`\n✓ ${added} ottelulle lisätty ${file.bookmaker}-kertoimet, kortit laskettu uudelleen`);
  console.log(`  ${written}\n`);

  for (const m of next.matches) {
    const row = m.odds.find((o) => o.key === file.key);
    if (!row) continue;
    const best = m.analysis.edges.reduce((a, b) => (b.edge > a.edge ? b : a));
    console.log(
      `  ${m.home.short}–${m.away.short}  ${file.bookmaker} ${row.home.toFixed(2)} / ${row.draw.toFixed(2)} / ${row.away.toFixed(2)}` +
        `  | paras ${best.side} @ ${best.odds.toFixed(2)} (${best.book}) edge ${(best.edge * 100).toFixed(1)} %`
    );
  }
}
