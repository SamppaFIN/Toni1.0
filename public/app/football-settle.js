// Tiketti #91: Vetojen ratkaisu OIKEISTA tuloksista
//
// Tähän asti ottelun lopputulos tuli vain simulaatiosta (#32): käyttäjä
// painoi "Simuloi kierros", ja arvotut maalit ratkaisivat vedot. Kun
// ottelusimulaatio poistetaan, vedot jäisivät ilman tätä ikuisesti auki.
//
// Tämä moduuli ratkaisee ne siitä mitä oikeasti tapahtui. Lähteitä on kolme,
// vahvimmasta heikoimpaan — sama järjestys kuin korttinäkymässä (#83):
//
//   1. palvelinarkisto   odds-history.json  -> result, jo tulkittu 1X2:ksi
//   2. kalenteri         fixtures.json      -> home_score / away_score
//   3. päivän tulokset   results.json       -> outcome
//
// KOLME SÄÄNTÖÄ, ja jokainen on syystä:
//
//   1. VAIN ALKANEET OTTELUT. Ottelua joka ei ole alkanut ei ratkaista
//      vaikka jokin lähde antaisi sille tuloksen — se olisi datavirhe, ja
//      sen seuraus olisi rahan siirtyminen väärin.
//
//   2. simulated: false. Historiaan kirjattava lippu erottaa oikean tuoton
//      simuloidusta (#33). Sekoitettuna ROI-luku ei mittaisi mitään.
//
//   3. EI ARVAUKSIA. Jos tulosta ei löydy, veto jää auki ja käyttäjälle
//      kerrotaan miksi. Auki jäänyt veto on rehellinen; väärin ratkaistu
//      veto siirtää rahaa.

/** Ottelun lopputulos 1X2-muodossa, tai null jos ei tiedossa */
function outcomeFromScore(homeScore, awayScore) {
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  if (homeScore > awayScore) return 'home';
  if (awayScore > homeScore) return 'away';
  return 'draw';
}

/**
 * Etsi ottelun tulos kaikista lähteistä.
 *
 * Palauttaa `{ outcome, label, source }` tai null. `source` kulkee mukana
 * jotta käyttäjälle voi kertoa mistä tulos tuli — sama läpinäkyvyysperiaate
 * kuin laskennan välivaiheissa (#39).
 */
export function findResult(gameId, sources = {}) {
  const { serverArchive, calendar, results } = sources;

  // 1. Palvelinarkisto: tulos on jo tulkittu 1X2:ksi
  const archived = serverArchive?.find?.((m) => m.match_id === gameId || m.id === gameId);
  const ar = archived?.result;
  if (ar?.outcome) {
    return {
      outcome: ar.outcome,
      label: `${ar.home_score}–${ar.away_score}`,
      source: 'arkisto',
    };
  }

  // 2. Kalenteri: pistemäärä, tulkitaan itse
  const fx = calendar?.find?.((m) => m.match_id === gameId);
  if (fx?.status === 'finished') {
    const outcome = outcomeFromScore(fx.home_score, fx.away_score);
    if (outcome) return { outcome, label: `${fx.home_score}–${fx.away_score}`, source: 'otteluohjelma' };
  }

  // 3. results.json
  const r = results?.find?.((x) => x.match_id === gameId);
  if (r?.outcome) {
    const label = Number.isFinite(r.home_score) ? `${r.home_score}–${r.away_score}` : r.outcome;
    return { outcome: r.outcome, label, source: 'tulospalvelu' };
  }

  return null;
}

/** Onko ottelu alkanut — ilman tätä tulos ei voi olla oikea */
export function hasStarted(bet, now = Date.now()) {
  const t = Date.parse(bet.kickoff);
  // Ilman aloitusaikaa emme voi todeta ettei ottelu ole alkanut. Sallitaan
  // ratkaisu, koska tulos on silloin ainoa signaali jonka varassa ollaan.
  return !Number.isFinite(t) || t <= now;
}

/**
 * Ratkaise kaikki avoimet vedot joille löytyy tulos.
 *
 * Palauttaa yhteenvedon: mitä ratkaistiin ja mikä jäi auki miksi. Kutsuja
 * näyttää sen käyttäjälle — hiljainen ratkaisu on huono, koska raha liikkuu.
 */
export function settleOpenBets(sources = {}, deps = {}) {
  // Vartija: yksikkotestit tuovat taman Nodeen jossa windowia ei ole
  const bt = deps.bt ?? (typeof window !== 'undefined' ? window.BT : null);
  const now = deps.now ?? Date.now();
  if (!bt?.getBets) return { settled: [], pending: [], reason: 'silta puuttuu' };

  const settled = [];
  const pending = [];

  // Kopio, koska settleFootballBet muokkaa alkuperaista listaa kesken iteroinnin
  for (const bet of [...bt.getBets()]) {
    // Manuaalisesti ratkaistavat harjoituskohteet eivat kuulu tanne
    if (bet.manual) continue;

    if (!hasStarted(bet, now)) {
      pending.push({ bet, why: 'ei ole alkanut' });
      continue;
    }

    const result = findResult(bet.game_id, sources);
    if (!result) {
      pending.push({ bet, why: 'tulosta ei ole viela julkaistu' });
      continue;
    }

    const won = bet.side === result.outcome;
    bt.settleFootballBet(bet.id, won, result.label, { simulated: false });
    settled.push({ ...bet, won, result });
  }

  return { settled, pending };
}

/** Lataa lähteet ja ratkaise. Palauttaa saman yhteenvedon kuin settleOpenBets. */
export async function settleFromLiveData(deps = {}) {
  const w = typeof window !== 'undefined' ? window : {};
  const archiveMod = deps.serverArchive ?? w.BTSA;
  const timelineMod = deps.timeline ?? w.BTL2;

  const sources = {
    serverArchive: archiveMod?.getCalendarMatches?.() ?? archiveMod?.allMatches?.() ?? null,
    calendar: timelineMod?.getCalendar?.()?.matches ?? null,
    results: deps.results ?? null,
  };

  return settleOpenBets(sources, deps);
}

if (typeof window !== 'undefined') {
  window.BTST = { settleOpenBets, settleFromLiveData, findResult, hasStarted };
}
