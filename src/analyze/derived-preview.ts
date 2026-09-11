// Johdettu ottelu­ennakko — erikoistekijät kortille
//
// Kausiennakko (#103) on olemassa vain Liigalle: se jäsennetään toimituksen
// julkaisemasta dokumentista. Jalkapallokortilla 📋 Ennakko -nappi ei siis
// koskaan ilmestynyt, vaikka SAMASTA datasta jolla malli lasketaan on
// luettavissa se osa joka jää mallin numeron alle piiloon.
//
// Tämä rakentaa sen. Lähde on sama sarjataulukko, Elo ja muoto jota malli
// käyttää — mutta nämä havainnot EIVÄT ole mallin syöte. Malli laskee
// maaleista; nämä kertovat mikä syötteessä on poikkeavaa. Uutiset EIVÄT ole
// mukana: niillä on kortilla oma osionsa (ks. perustelu alempana).
//
// MIKSI EROTTELU ON TÄRKEÄ: jos nämä laskettaisiin mukaan todennäköisyyteen,
// sama havainto painaisi kahdesti (kerran maaleina, kerran "tekijänä"). Ne
// ovat lukijaa varten, eivät laskentaa varten, ja kortin alaviite sanoo sen.
//
// Ennakko merkitään `basis: 'derived'`, jotta kortti ei väitä sitä yhden
// toimituksen arvioksi kuten kausiennakkoa.

import { MatchPreview, PreviewSide, TeamSeasonStats } from '../types-football.js';

/** Kotietu Elo-pisteinä — sama luku kuin jalkapallon kausi-Elossa */
export const HOME_ADVANTAGE = 55;

/** Pienin Elo-ero (kotietu mukaan luettuna) joka kelpaa havainnoksi */
export const ELO_GAP_THRESHOLD = 40;

/** Lyhin yhtenäinen putki joka kelpaa havainnoksi */
export const MIN_STREAK = 3;

export interface DerivedPreviewInput {
  homeStats: TeamSeasonStats | null;
  awayStats: TeamSeasonStats | null;
  /** `league-average` tarkoittaa ettei joukkueesta ole pääsarjadataa */
  homeBasis?: string;
  awayBasis?: string;
  homeElo: number | null;
  awayElo: number | null;
  /** Lähteen nimi kortille, esim. "ESPN (tuloksista johdettu)" */
  sourceName: string;
}

/**
 * Yhtenäinen voitto- tai tappioputki muodon lopusta.
 *
 * VAIN YHTENÄINEN lasketaan: "3 voittoa viidestä" on jo mukana maaleissa
 * eikä siitä synny erillistä havaintoa. Yhtenäinen putki kertoo sen sijaan
 * jotain mitä maalisummat eivät — että tila on pysynyt samana.
 */
export function streak(form: string | null): { kind: 'W' | 'L' | 'D'; length: number } | null {
  if (!form) return null;
  const last = form[form.length - 1] as 'W' | 'L' | 'D';
  if (!last) return null;
  let n = 0;
  for (let i = form.length - 1; i >= 0 && form[i] === last; i--) n++;
  return n >= MIN_STREAK ? { kind: last, length: n } : null;
}

function perGame(total: number | null, played: number | null): string | null {
  if (total === null || !played) return null;
  return (total / played).toFixed(2);
}

/**
 * Yhden joukkueen plussat ja miinukset.
 *
 * `isHome` ratkaisee kumpaa splittiä katsotaan: kotijoukkueelle kotipelit,
 * vierasjoukkueelle vieraspelit. Ilman sitä osio näyttäisi lukuja jotka
 * eivät liity tähän otteluun.
 */
export function sideFor(
  stats: TeamSeasonStats | null,
  basis: string | undefined,
  elo: number | null,
  isHome: boolean
): PreviewSide {
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (stats) {
    const s = streak(stats.form);
    if (s?.kind === 'W') strengths.push(`${s.length} voittoa putkeen (${stats.form})`);
    if (s?.kind === 'L') weaknesses.push(`${s.length} tappiota putkeen (${stats.form})`);

    const played = isHome ? stats.home_played : stats.away_played;
    const gf = isHome ? stats.home_gf : stats.away_gf;
    const ga = isHome ? stats.home_ga : stats.away_ga;
    const where = isHome ? 'kotona' : 'vieraissa';

    if (played) {
      if (gf === 0) weaknesses.push(`Ei yhtään maalia ${where} (${played} ottelua)`);
      else {
        const avg = perGame(gf, played);
        if (avg) strengths.push(`${avg} maalia/peli ${where} (${played} ottelua)`);
      }
      const conceded = perGame(ga, played);
      if (conceded) {
        const line = `${conceded} päästettyä/peli ${where}`;
        if (Number(conceded) <= 1) strengths.push(line);
        else if (Number(conceded) >= 2) weaknesses.push(line);
      }
    }

    if (stats.played) {
      strengths.push(`${stats.points} pistettä ${stats.played} ottelusta (${stats.won}–${stats.draw}–${stats.lost})`);
    }
  }

  // Tämä on osion tärkein yksittäinen varaus: ilman pääsarjahistoriaa
  // joukkueen voimaluku on sarjan keskitaso eli arvaus, ja malli on juuri
  // sen ottelun kohdalla epävarmimmillaan.
  if (basis === 'league-average') {
    weaknesses.push('Ei pääsarjahistoriaa — voimaluku on sarjan keskitaso, ei mittaus');
  }

  return {
    rank: stats?.rank ?? null,
    elo,
    strengths,
    weaknesses,
  };
}

// UUTISET EIVAT OLE TASSA OSIOSSA, ja se on tietoinen valinta.
//
// Ensimmainen versio tyonsi tyypitetyt uutiset `weaknesses`-listaan. Kaksi
// vikaa: kortilla on jo oma 📰 Uutiset -osio otsikoineen ja linkkeineen, eli
// sama tieto nakyisi kahdesti — ja miinuslistalla oleva otsikko VAITTAA
// uutisen olevan huono uutinen. Oikeasta datasta: "Chelsea hand Pedro Neto
// new deal" paatyi Chelsean miinuksiin, vaikka se on painvastainen uutinen.
//
// Luokittelu kertoo tapahtuman TYYPIN (injury, transfer, lineup_change), ei
// sen suuntaa. Suunnan paattely otsikosta olisi arvaus, ja arvaus joka
// esitetaan miinuksena on pahempi kuin puuttuva tieto.

/**
 * Johdettu ennakko, tai null jos kummastakaan joukkueesta ei ole mitään
 * sanottavaa. Tyhjä osio napin takana on huonompi kuin ei nappia.
 */
export function buildDerivedPreview(input: DerivedPreviewInput): MatchPreview | null {
  const home = sideFor(input.homeStats, input.homeBasis, input.homeElo, true);
  const away = sideFor(input.awayStats, input.awayBasis, input.awayElo, false);

  // Elo-ero on ottelutason havainto, joten se menee suosikin plussiin ja
  // altavastaajan miinuksiin — kotietu mukaan luettuna, koska ilman sitä
  // luku vastaa väärään kysymykseen (neutraali kenttä).
  if (input.homeElo !== null && input.awayElo !== null) {
    const net = Math.round(input.homeElo + HOME_ADVANTAGE - input.awayElo);
    if (Math.abs(net) >= ELO_GAP_THRESHOLD) {
      const note = `Elo-ero ${net > 0 ? '+' : ''}${net} kotietu mukaan luettuna`;
      if (net > 0) {
        home.strengths.push(note);
        away.weaknesses.push(note);
      } else {
        away.strengths.push(note);
        home.weaknesses.push(note);
      }
    }
  }

  const empty = !home.strengths.length && !home.weaknesses.length && !away.strengths.length && !away.weaknesses.length;
  if (empty) return null;

  return {
    source: { name: input.sourceName, url: null, readAt: null },
    basis: 'derived',
    home,
    away,
  };
}
