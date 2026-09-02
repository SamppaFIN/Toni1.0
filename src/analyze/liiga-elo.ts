// Tiketti #104: Liigan Elo kausiennakosta + pelatuista otteluista
//
// Kauden alussa Elo tuli pelkästä kausiennakosta (#96): Tappara 1620,
// Jukurit 1380, muutos nolla. Se oli oikein kun otteluita ei ollut yhtään.
//
// Nyt niitä on. Elo lasketaan ennakon lähtöarvoista ja päivitetään
// toteutuneilla tuloksilla, jolloin `change` kertoo vihdoin jotain:
// kuinka paljon joukkue on liikkunut siitä mihin ennakko sen asetti.
//
// KAKSI JÄÄKIEKKOKOHTAISTA ASIAA:
//
//   1. VARSINAINEN PELIAIKA. Elo lasketaan 60 minuutin tuloksesta, ei
//      loppulukemasta. Jatkoajalla ratkennut ottelu on Elon kannalta
//      tasapeli — sama periaate kuin tilastoissa (#92) ja samasta syystä:
//      1X2 hinnoitellaan varsinaisen peliajan mukaan.
//
//   2. K-ARVO. Liigan runkosarja on 60 ottelua joukkuetta kohden, kun
//      Veikkausliigassa niitä on ~27. Pidempi kausi kestää pienemmän K:n,
//      mutta pidämme saman 20:n: kausi on vasta alussa, ja liian pieni K
//      jättäisi Elon roikkumaan ennakon arvoissa pitkäksi aikaa.

import { calculateSeasonElo, SeasonEloResult, DEFAULT_K } from './season-elo.js';
import { SeasonMatch } from '../ingest/results-veikkausliiga.js';
import { priorEloMap, normalizeLiigaName } from './liiga-priors.js';
import { regulationScore } from '../ingest/stats-liiga.js';
// Sama muoto kuin tilastoingestiossa — yksi totuus rajapinnan rakenteesta
import type { LiigaApiGame as LiigaGame } from '../ingest/stats-liiga.js';

/**
 * Kotietu Elo-pisteinä.
 *
 * Jalkapallossa 55. Jääkiekossa kotietu on mitattuna suurempi: kaudella 2026
 * kotijoukkueet tekivät 2.92 maalia vieraiden 2.52:ta vastaan varsinaisella
 * peliajalla, ja avauskierroksella 4/7 ottelusta päättyi kotivoittoon.
 *
 * Arvo on silti MALTILLINEN eikä johdettu yhdestä kierroksesta: 60 on
 * hieman jalkapalloa suurempi, mikä vastaa mitattua maalieroa. Tarkempi
 * viritys vaatii kalibroinnin toteutuneita tuloksia vasten — sama menetelmä
 * kuin blend-painolla (#86) — eikä sitä voi tehdä ennen kuin otteluita on
 * riittävästi.
 */
export const LIIGA_HOME_ADVANTAGE = 60;

/**
 * Muunna Liigan ottelut Elo-laskennan muotoon.
 *
 * VAIN PÄÄTTYNEET, ja tulos varsinaiselta peliajalta. Jatkoajalla ratkennut
 * kirjautuu tasapeliksi, jolloin kumpikin saa puolikkaan — se on Elon
 * kannalta oikein, koska 60 minuutissa kumpikaan ei voittanut.
 */
export function toSeasonMatches(games: LiigaGame[]): SeasonMatch[] {
  const out: SeasonMatch[] = [];

  for (const g of games) {
    if (g.ended !== true) continue;
    const home = g.homeTeam?.teamName?.trim();
    const away = g.awayTeam?.teamName?.trim();
    const hg = g.homeTeam?.goals;
    const ag = g.awayTeam?.goals;
    if (!home || !away || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;

    const reg = regulationScore(hg as number, ag as number, g.finishedType);
    out.push({
      date: String(g.start ?? '').slice(0, 10),
      home,
      away,
      homeScore: reg.home,
      awayScore: reg.away,
      outcome: reg.wentToOvertime ? 'draw' : reg.home > reg.away ? 'home' : 'away',
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Liigan Elo: kausiennakon lähtöarvot + pelatut ottelut.
 *
 * Palauttaa myös `preSeason`-arvon per joukkue, jotta kortti voi näyttää
 * kuinka paljon Elo on liikkunut ennakon arviosta. Pelkkä nykyinen luku ei
 * kerro sitä, ja juuri liike on se mitä kauden alussa halutaan nähdä.
 */
export function calculateLiigaElo(games: LiigaGame[]): SeasonEloResult & {
  preSeason: Map<string, number>;
} {
  const matches = toSeasonMatches(games);
  const priorit = priorEloMap();

  // Lahtoarvot normalisoidulla avaimella
  const startingElos = new Map<string, number>();
  for (const [avain, v] of priorit) startingElos.set(avain, v.elo);

  const result = calculateSeasonElo(matches, {
    k: DEFAULT_K,
    homeAdvantage: LIIGA_HOME_ADVANTAGE,
    startingElos,
    normalizeKey: normalizeLiigaName,
  });

  return { ...result, preSeason: startingElos };
}

/**
 * Elo-kartta ottelukortille.
 *
 * Sama muoto kuin `EloLookup`:lla, mutta `change` mitataan KAUSIENNAKON
 * LÄHTÖARVOSTA eikä kauden alun 1500:sta. Näin kortin luku vastaa
 * kysymykseen "onko joukkue ollut ennakkoa parempi vai huonompi", joka on
 * kauden alussa se ainoa mielekäs vertailu.
 */
export function liigaEloMap(games: LiigaGame[]): Map<string, { elo: number; change: number; rank: number }> {
  const { ratings, preSeason } = calculateLiigaElo(games);
  const map = new Map<string, { elo: number; change: number; rank: number }>();

  const sorted = [...ratings].sort((a, b) => b.elo - a.elo);
  for (const [i, r] of sorted.entries()) {
    const avain = normalizeLiigaName(r.team);
    const lahto = preSeason.get(avain);
    map.set(avain, {
      elo: Math.round(r.elo),
      // Ilman lahtoarvoa muutosta ei voi laskea -> nolla, ei arvausta
      change: lahto === undefined ? 0 : Math.round(r.elo - lahto),
      rank: i + 1,
    });
  }

  // Joukkueet jotka eivat ole viela pelanneet: ennakon lahtoarvo sellaisenaan
  for (const [avain, v] of preSeason) {
    if (!map.has(avain)) map.set(avain, { elo: v, change: 0, rank: 0 });
  }

  // Sijaluvut uudelleen koko joukolle, jotta pelaamattomatkin saavat sijan
  const kaikki = [...map.entries()].sort((a, b) => b[1].elo - a[1].elo);
  for (const [i, [avain, v]] of kaikki.entries()) map.set(avain, { ...v, rank: i + 1 });

  return map;
}
