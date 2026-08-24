// Tiketti #60: Kerroin- ja analyysiarkisto selaimessa
//
// MIKSI TÄMÄ ON OLEMASSA:
// Snapshot on aina VAIN NYKYHETKI. Cron kirjoittaa today.json:in uusiksi
// kahdesti vuorokaudessa, ja pelatut ottelut putoavat siitä pois heti kun
// The Odds API lakkaa tarjoamasta niille kertoimia. Eilisen kertoimet — ja
// se mitä malli niistä sanoi — katoavat siis pysyvästi ellei niitä talleteta.
//
// Ilman arkistoa jälkikäteisarviointi on mahdotonta: "olisiko tuo veto
// kannattanut" ei ole vastattavissa jos hinta jota vastaan arvio tehtiin on
// hävinnyt. Palvelinpuolella tämä on ratkaistu history/-hakemistolla
// (CLV-mittarit, tiketti #33), mutta se sisältää vain cron-hetket eikä ole
// käytettävissä selaimessa ilman erillistä hakua.
//
// MITÄ TALLENNETAAN: kertoimet, mallin arvio, markkinan arvio ja edget.
// EI uutisia, tarkkoja tuloksia eikä säätöjä — ne ovat suurin osa datasta
// eivätkä tarvita hinnan jälkikäteisarviointiin. Tiivistys pudottaa
// ottelun 5.8 kt:sta 3.1 kt:hen.

const KEY = 'bt_odds_archive';

/** Kuinka monta päivää säilytetään. 30 pv x ~47 kt = ~1.4 Mt, hyvin alle rajan. */
export const MAX_DAYS = 30;

/**
 * Kova katto tavuina. localStorage-raja on selaimesta riippuen 5–10 Mt ja se
 * on JAETTU kaikkien avainten kesken — arkisto ei saa syödä tilaa vedoilta ja
 * kassalta, joten se karsiutuu ennen kuin muu tila on vaarassa.
 */
export const MAX_BYTES = 2_000_000;

/** Paikallinen kalenteripäivä — sama määritelmä kuin päiväsuodattimessa */
export function dayKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function readArchive() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function writeArchive(archive) {
  try {
    localStorage.setItem(KEY, JSON.stringify(archive));
    return true;
  } catch {
    // Kiintiö täynnä tai tallennus estetty. Arkisto on mukavuustoiminto:
    // sen epäonnistuminen ei saa estää vetoja eikä kaataa näkymää.
    return false;
  }
}

/** Ottelu tiivistettynä — vain se mitä jälkikäteisarviointi tarvitsee */
export function compactMatch(m) {
  return {
    id: m.id,
    league: m.league,
    kickoff: m.kickoff,
    home: { name: m.home.name, short: m.home.short, color: m.home.color },
    away: { name: m.away.name, short: m.away.short, color: m.away.color },
    odds: (m.odds ?? []).map((o) => ({
      bookmaker: o.bookmaker,
      key: o.key,
      home: o.home,
      draw: o.draw,
      away: o.away,
      commission: o.commission,
      link: o.link ?? null,
    })),
    best: m.best ?? null,
    market: m.market
      ? {
          margin: m.market.margin,
          implied: m.market.implied,
          sharp: m.market.sharp,
          sharp_source: m.market.sharp_source,
        }
      : null,
    model: m.model
      ? {
          method: m.model.method,
          probs: m.model.probs,
          poisson_probs: m.model.poisson_probs,
          blend_weight: m.model.blend_weight,
          lambda_home: m.model.lambda_home,
          lambda_away: m.model.lambda_away,
        }
      : null,
    edges: (m.analysis?.edges ?? []).map((e) => ({
      side: e.side,
      odds: e.odds,
      odds_effective: e.odds_effective,
      book: e.book,
      model_prob: e.model_prob,
      implied_prob: e.implied_prob,
      edge: e.edge,
      flag: e.flag,
      stake_suggestion: e.stake_suggestion,
    })),
  };
}

/**
 * Karsi arkisto rajoihin. Vanhin päivä lähtee ensin — tuore data on
 * arvokkaampaa, koska sen ottelut ovat vielä ratkeamassa.
 */
export function prune(archive, maxDays = MAX_DAYS, maxBytes = MAX_BYTES) {
  let days = Object.keys(archive).sort(); // vanhin ensin
  const out = { ...archive };

  while (days.length > maxDays) {
    delete out[days[0]];
    days = days.slice(1);
  }
  while (days.length > 1 && JSON.stringify(out).length > maxBytes) {
    delete out[days[0]];
    days = days.slice(1);
  }
  return out;
}

/**
 * Talleta snapshotin ottelut päiväkohtaisesti.
 *
 * Ottelu talletetaan sen OTTELUPÄIVÄN alle, ei hakupäivän — muuten huomisen
 * ottelu joka näkyy tänään päätyisi väärälle päivälle eikä löytyisi silloin
 * kun sitä tarvitaan.
 *
 * Sama ottelu ylikirjoitetaan uudemmalla havainnolla: viimeisin ennen
 * ottelun alkua nähty hinta on se jota vasten veto tosiasiassa lyötiin.
 * Avaushinta säilyy palvelimen history/-hakemistossa (tiketti #33).
 */
export function archiveSnapshot(snapshot, now = new Date()) {
  if (!snapshot?.matches?.length) return { saved: 0, ok: true };

  const archive = readArchive();
  let saved = 0;

  for (const m of snapshot.matches) {
    const day = dayKey(m.kickoff);
    if (!day) continue;

    const entry = archive[day] ?? { matches: {} };
    entry.matches[m.id] = { ...compactMatch(m), archived_at: now.toISOString() };
    entry.updated_at = now.toISOString();
    archive[day] = entry;
    saved++;
  }

  const ok = writeArchive(prune(archive));
  return { saved, ok };
}

/** Yhden päivän arkistoidut ottelut aikajärjestyksessä */
export function archivedDay(day) {
  const entry = readArchive()[day];
  if (!entry?.matches) return [];
  return Object.values(entry.matches).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
}

/** Päivät joilta arkistossa on dataa, uusin ensin */
export function archivedDays() {
  return Object.keys(readArchive()).sort().reverse();
}

/** Arkiston koko käyttäjälle näytettäväksi */
export function archiveStats() {
  const archive = readArchive();
  const days = Object.keys(archive);
  const matches = days.reduce((n, d) => n + Object.keys(archive[d].matches ?? {}).length, 0);
  return { days: days.length, matches, bytes: JSON.stringify(archive).length };
}

export function clearArchive() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* tyhjennys on paras yritys */
  }
}

/**
 * Arkistoitu ottelu takaisin korttimuotoon.
 *
 * Tiivistetystä muodosta puuttuvat tunnusluvut, uutiset ja tarkat tulokset —
 * ne palautetaan tyhjinä eikä keksittyinä. Korttirenderöijä osaa jo näyttää
 * `stats: null` ja tyhjän uutislistan kertoen miksi ne puuttuvat, joten
 * arkistokortti näyttää rehellisesti sen mitä siitä on tallessa.
 */
export function toCardShape(compact) {
  return {
    ...compact,
    stats: null,
    news: [],
    analysis: { edges: compact.edges ?? [], news_window: false, bankroll_basis: 100 },
    model: compact.model
      ? { ...compact.model, over25: null, btts: null, top_scores: [], adjustments: [], home_strength: null, away_strength: null }
      : null,
    fromArchive: true,
  };
}
