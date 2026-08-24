// Tiketti #68: Nousijan voima edellisen kauden alemmasta sarjasta
//
// MIKÄ TÄSSÄ PARANEE:
// Tiketissä #53 nousija sai kiinteän priorin 0.85 / 1.15 — "keskiverto
// nousija". Se oli oikea suunta mutta karkea: Championshipin ylivoimainen
// mestari ja karsintojen kautta noussut eivät ole samanlaisia joukkueita,
// ja markkina tietää sen.
//
// Nyt priori lasketaan joukkueen OMASTA edellisen kauden datasta alemmassa
// sarjassa. Kiinteä 0.85 / 1.15 säilyy KESKIARVONA, josta joukkueen oma
// suoritus poikkeuttaa — eli malli degradoituu täsmälleen entiseen jos
// dataa ei löydy.
//
// MIKSI PELKKÄ SARJAVOIMA EI RIITÄ:
// Joukkuevoima on suhdeluku OMAAN sarjaansa: 1.30 Championshipissä ei ole
// 1.30 Valioliigassa. Muunnos tehdään kahdessa osassa — tasosiirto (nousijat
// ovat keskimäärin heikompia) ja hajonnan kutistus (sarjojen sisäinen ero
// kutistuu kun kaikki vastustajat ovat kovempia).

import { pathToFileURL } from 'node:url';
import { TeamStrength } from '../analyze/poisson.js';
import { LeagueSeasonStats } from '../types-football.js';
import { rawStrength, PROMOTED_STRENGTH } from '../analyze/strength.js';
import { findTeam } from './team-match.js';
import { fetchLeagueStats } from './stats-footballdata.js';
import { leagueFor } from '../leagues.js';

/**
 * Kuinka paljon alemman sarjan sisäisestä hajonnasta jää voimaan ylemmässä.
 *
 * 0.5 tarkoittaa: joukkue joka oli Championshipissä 30 % keskitasoa parempi
 * on Valioliigassa 15 % keskiverto-nousijaa parempi. Kutistus on välttämätön,
 * koska ylemmässä sarjassa kaikki vastustajat ovat kovempia — sama joukkue
 * ei voi toistaa alemman sarjan eroaan.
 */
export const DIVISION_SPREAD = 0.5;

/**
 * Muunna alemman sarjan voima ylemmän sarjan prioriksi.
 *
 * Keskiverto nousija (voima 1.0 omassa sarjassaan) saa täsmälleen
 * PROMOTED_STRENGTH-arvot, eli sama tulos kuin tiketissä #53. Poikkeama
 * keskitasosta siirtyy kutistettuna.
 */
export function projectToTopFlight(lower: TeamStrength, base: TeamStrength = PROMOTED_STRENGTH): TeamStrength {
  return {
    attack: base.attack * (1 + (lower.attack - 1) * DIVISION_SPREAD),
    // Puolustuksessa PIENEMPI on parempi, joten hyvä puolustus (< 1) laskee
    // kerrointa myös projisoituna — etumerkki menee samaan suuntaan.
    defense: base.defense * (1 + (lower.defense - 1) * DIVISION_SPREAD),
  };
}

/** Nousijan voima nimellä alemman sarjan taulukosta. null jos ei löydy. */
export function promotedStrengthFrom(teamName: string, lowerSeason: LeagueSeasonStats): TeamStrength | null {
  const stats = findTeam(lowerSeason.teams, teamName);
  // Alle 10 ottelua ei ole kausi vaan otos — priori on silloin parempi
  if (!stats || stats.played < 10) return null;

  const lower = rawStrength(stats, { homeGoals: lowerSeason.homeGoalsAvg, awayGoals: lowerSeason.awayGoalsAvg });
  return projectToTopFlight(lower);
}

/**
 * Hae ylemmän sarjan edellisen kauden alempi sarja.
 *
 * Palauttaa null jos rekisterissä ei ole toisen tason vastinetta tai haku
 * pettää — kutsuja putoaa silloin kiinteään prioriin, mikä on entinen
 * käytös eikä virhe.
 */
export async function fetchLowerDivision(sportKey: string, seasonYear: number): Promise<LeagueSeasonStats | null> {
  const league = leagueFor(sportKey);
  if (!league?.secondTier) return null;

  try {
    return await fetchLeagueStats(league.secondTier, seasonYear - 1);
  } catch (err) {
    console.warn(`[Nousija] ${league.secondTier} (${seasonYear - 1}): haku epäonnistui — ${(err as Error).message}`);
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sportKey = process.argv[2] || 'soccer_epl';
  const year = Number(process.argv[3] || new Date().getUTCFullYear());

  fetchLowerDivision(sportKey, year)
    .then((lower) => {
      if (!lower) {
        console.error('Alemman sarjan dataa ei saatu');
        process.exit(1);
      }
      console.log(`${lower.league} ${lower.season} — ${lower.teams.length} joukkuetta\n`);
      console.log('  joukkue                    hyokkays  puolustus   (projisoitu ylempaan)');
      for (const t of lower.teams.slice(0, 8)) {
        const p = promotedStrengthFrom(t.name, lower);
        console.log(
          `  ${t.name.padEnd(26)} ${p ? p.attack.toFixed(2).padStart(8) : '       —'} ${p ? p.defense.toFixed(2).padStart(10) : '         —'}`
        );
      }
    })
    .catch((err) => {
      console.error('Virhe:', err.message);
      process.exit(1);
    });
}
