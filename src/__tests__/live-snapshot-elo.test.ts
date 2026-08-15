// Tiketti #39 seuranta: tilastolähteen ja Elo-lähteen nimet eroavat
//
// Havaittu tuotannossa: today.json antoi Elo-luvun vain 1/4 päivän ottelulle,
// koska Wikipedian/football-data.orgin tilastonimi ("HJK") ei täsmännyt
// veikkausliigapelit.fi:n tuloslähteen nimeen ("HJK Helsinki") eikä epäonnistunut
// täsmäytys näkynyt missään — se vain jätti kentän hiljaa nulliksi.
//
// Tämä testi lukitsee kaikki 12 joukkuetta niin ettei sama virhe pääse
// takaisin huomaamatta.

import { describe, it, expect } from 'vitest';
import { eloKeyFor } from '../publish/live-snapshot.js';
import { normalizeTeam } from '../ingest/results-veikkausliiga.js';

// Vasen sarake: nimi sellaisena kuin tilastolähde (Wikipedia/football-data.org)
// sen antaa. Oikea sarake: sama joukkue veikkausliigapelit.fi:n muodossa,
// eli se mihin normalizeTeam(name) tuloslähteestä päätyy.
const STATS_NAME_TO_RESULTS_NAME: Array<[string, string]> = [
  ['HJK', 'HJK Helsinki'],
  ['Inter Turku', 'FC Inter Turku'],
  ['VPS', 'VPS Vaasa'],
  ['TPS', 'TPS Turku'],
  ['Ilves', 'Ilves Tampere'],
  ['SJK', 'SJK Seinäjoki'],
  ['KuPS', 'KuPS Kuopio'],
  ['FF Jaro', 'Jaro'],
  // Nämä neljä täsmäävät jo sellaisenaan — mukana jotta lista kattaa koko sarjan
  ['AC Oulu', 'AC Oulu'],
  ['IF Gnistan', 'IF Gnistan'],
  ['FC Lahti', 'FC Lahti'],
  ['IFK Mariehamn', 'IFK Mariehamn'],
];

describe('Tilastolähteen nimi täsmää Elo-karttaan', () => {
  it.each(STATS_NAME_TO_RESULTS_NAME)('%s → sama avain kuin normalizeTeam("%s")', (statsName, resultsName) => {
    expect(eloKeyFor(statsName)).toBe(normalizeTeam(resultsName));
  });

  it('kattaa kaikki 12 Veikkausliigan joukkuetta ilman duplikaatteja', () => {
    expect(STATS_NAME_TO_RESULTS_NAME).toHaveLength(12);
    const keys = STATS_NAME_TO_RESULTS_NAME.map(([s]) => eloKeyFor(s));
    expect(new Set(keys).size).toBe(12);
  });

  it('tuntematon nimi läpäisee muuttumattomana (ei arvausta)', () => {
    expect(eloKeyFor('Joku Uusi Joukkue')).toBe(normalizeTeam('Joku Uusi Joukkue'));
  });
});
