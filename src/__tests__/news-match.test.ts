import { describe, it, expect } from 'vitest';
import {
  buildTeamPattern,
  mentionsTeam,
  hasFootballContext,
  hasHockeyContext,
  isAboutFootball,
} from '../ingest/news-match.js';

// Nämä tekstit ovat AITOJA RSS-syötteistä 14.8.2026. Jokainen niistä paljasti
// virheen toteutuksessa, ja jokainen on tässä regressiotestinä.

const REAL_ARTICLES = {
  // Osui Inter Turkuun koska "Inter" + ESPN on jalkapallosyöte. Inter MIAMI.
  messi:
    'Miami coach stresses that Messi needs privacy. Inter Miami CF manager Guillermo Hoyos emphasized the need for privacy as Lionel Messi navigates a return to football following the passing of his father, Jorge Messi.',
  // Osui Inter Turkuun koska "Inter Milan" sisältää sanan Inter.
  rodri:
    "Man City reject fresh Rodri bid - Friday's gossip. Barcelona's latest Rodri bid rejected, Tottenham's Djed Spence on verge of Inter Milan move, Arsenal rebuffed in bid for Marc Pubill, plus more.",
  // Osui jalkapallon Ilvekseen, vaikka juttu on jääkiekosta. IS:n syöte
  // kattaa kaikki lajit; "pahvi" on sopimusslangia molemmissa lajeissa.
  ilvesHockey:
    'Ilves jysäytti – luottomiehelle kunnon pahvi. Ilves solmi luottopuolustajansa kanssa kaksivuotisen jatkosopimuksen.',
  // Tämä on AITO jalkapallojuttu joka HYLÄTTIIN aluksi, koska
  // kontekstisanalista ei tuntenut suomen taivutusta ("Euroopan liigasta").
  euroNight:
    'Inter pelasti suomalaisten euroillan: HJK, Ilves ja KuPS joutuivat pettymään. Ilveksen ja HJK:n eurotaipaleet päättyivät torstaina. KuPS puolestaan putosi Euroopan liigasta. Inter venyi jatkoon FC Vaduzia vastaan.',
  veikkausliiga:
    'HJK:lle iso voitto – Veikkausliigassa yllätyksiä. KuPS nyhjäsi 1–1-tasapelin kotiyleisön edessä. KuPS jäi 1–1-tasapeliin TPS:n kanssa Kuopiossa.',
};

describe('Sanarajat — tämä esti 202 väärää osumaa', () => {
  const tps = buildTeamPattern('TPS Turku', [], 'TPS', 'Veikkausliiga');

  it('TPS ei osu sanaan https', () => {
    // Alkuperäinen toteutus löysi "tps" osamerkkijonona sanasta "https" ja
    // tuotti 202 väärää osumaa yhdestä RSS-syötteestä
    const text = 'Lue lisää: https://www.example.com/uutinen ja https://toinen.fi';
    expect(mentionsTeam(text, tps).matched).toBe(false);
  });

  it('TPS osuu kun se on oma sana', () => {
    expect(mentionsTeam('KuPS jäi 1–1-tasapeliin TPS:n kanssa', tps).matched).toBe(true);
  });

  it('joukkuenimi ei osu pidemmän sanan sisään', () => {
    const inter = buildTeamPattern('FC Inter Turku', [], 'INT', 'Veikkausliiga');
    expect(mentionsTeam('International football news', inter).matched).toBe(false);
  });
});

describe('Monitulkintaiset nimet vaativat vahvistuksen', () => {
  const interTurku = buildTeamPattern('FC Inter Turku', [], 'INT', 'Veikkausliiga');

  it('Inter Miami -juttu ei liity Inter Turkuun', () => {
    expect(mentionsTeam(REAL_ARTICLES.messi, interTurku).matched).toBe(false);
  });

  it('Inter Milan -siirtohuhu ei liity Inter Turkuun', () => {
    expect(mentionsTeam(REAL_ARTICLES.rodri, interTurku).matched).toBe(false);
  });

  it('Inter + Turku osuu', () => {
    const hit = mentionsTeam('Inter jatkaa voitokkaana Turussa, Turku juhlii', interTurku);
    expect(hit.matched).toBe(true);
  });

  it('Inter + Veikkausliiga osuu (sarja vahvistaa)', () => {
    const hit = mentionsTeam('Inter nousi Veikkausliigan kärkeen', interTurku);
    expect(hit.matched).toBe(true);
    expect(hit.strength).toBe('weak');
  });

  it('koko nimi osuu ilman vahvistusta', () => {
    const hit = mentionsTeam('FC Inter Turku voitti', interTurku);
    expect(hit.matched).toBe(true);
    expect(hit.strength).toBe('strong');
  });

  it('joukkue jolla ei ole muuta erottelevaa sanaa ei osu heikosti', () => {
    // Pelkkä "Inter" ilman kaupunkia: ei vahvistajia, joten heikko osuma
    // ei koskaan hyväksytä — parempi kuin arvata väärä seura
    const bare = buildTeamPattern('Inter', [], undefined, undefined);
    expect(mentionsTeam(REAL_ARTICLES.messi, bare).matched).toBe(false);
  });
});

describe('Selkeät joukkuenimet osuvat suoraan', () => {
  it('HJK osuu lyhenteenä', () => {
    const hjk = buildTeamPattern('HJK Helsinki', [], 'HJK', 'Veikkausliiga');
    expect(mentionsTeam(REAL_ARTICLES.euroNight, hjk).matched).toBe(true);
    expect(mentionsTeam(REAL_ARTICLES.veikkausliiga, hjk).matched).toBe(true);
  });

  it('KuPS osuu myös ilman kaupunkia', () => {
    const kups = buildTeamPattern('KuPS Kuopio', [], 'KUP', 'Veikkausliiga');
    expect(mentionsTeam(REAL_ARTICLES.euroNight, kups).matched).toBe(true);
  });

  it('erottelevat kaksisanaiset nimet osuvat', () => {
    const gnistan = buildTeamPattern('IF Gnistan', [], 'GNI', 'Veikkausliiga');
    expect(mentionsTeam('IF Gnistan yllätti kotonaan', gnistan).matched).toBe(true);
    expect(mentionsTeam('Gnistan taipui vieraissa', gnistan).matched).toBe(true);
  });

  it('eri joukkue ei osu', () => {
    const hjk = buildTeamPattern('HJK Helsinki', [], 'HJK', 'Veikkausliiga');
    expect(mentionsTeam('KuPS voitti Kuopiossa', hjk).matched).toBe(false);
  });
});

describe('Lajin tunnistus — Ilves ja TPS ovat myös jääkiekkoseuroja', () => {
  it('tunnistaa suomen taivutetut jalkapallosanat', () => {
    // Tämä oli virhe: kokonaisten sanojen lista hylkäsi "Euroopan liigasta"
    expect(hasFootballContext(REAL_ARTICLES.euroNight)).toBe(true);
    expect(hasFootballContext(REAL_ARTICLES.veikkausliiga)).toBe(true);
    expect(hasFootballContext('Jalkapalloilija loukkaantui harjoituksissa')).toBe(true);
  });

  it('tunnistaa jääkiekkokontekstin', () => {
    expect(hasHockeyContext('SM-liigan avaus siirtyy, ylivoima toimi')).toBe(true);
    expect(hasHockeyContext('NHL-kausi alkaa lokakuussa')).toBe(true);
  });

  it('jääkiekkojuttu ei kelpaa jalkapalloksi vaikka joukkuenimi osuisi', () => {
    // Aito tapaus: "Ilves solmi luottopuolustajansa kanssa jatkosopimuksen"
    // IS:n kaikkien lajien syötteestä. Ei jalkapallokontekstia → hylätään.
    expect(isAboutFootball(REAL_ARTICLES.ilvesHockey, false)).toBe(false);
  });

  it('jalkapallosyötteessä konteksti on aina tosi', () => {
    // BBC ja Guardian julkaisevat vain jalkapalloa
    expect(isAboutFootball(REAL_ARTICLES.rodri, true)).toBe(true);
  });

  it('kaikkien lajien syöte vaatii jalkapallokontekstin', () => {
    expect(isAboutFootball(REAL_ARTICLES.euroNight, false)).toBe(true);
    expect(isAboutFootball('Koripallossa tehtiin ennätys', false)).toBe(false);
  });

  it('jääkiekkokonteksti kumoaa jalkapallokontekstin', () => {
    // Sekamuotoinen teksti: jos jääkiekko mainitaan, ei riskeerata
    expect(isAboutFootball('Jalkapallo ja jääkiekko samassa jutussa, SM-liiga alkaa', false)).toBe(false);
  });

  it('"Liiga" yksinään ei ole jalkapallokonteksti', () => {
    // Suomessa "Liiga" tarkoittaa useimmiten jääkiekon SM-liigaa
    expect(hasFootballContext('Liigassa nähtiin tasapeli')).toBe(false);
  });
});

describe('Todisteen kirjaaminen', () => {
  it('kertoo mikä sana osui', () => {
    const hjk = buildTeamPattern('HJK Helsinki', [], 'HJK', 'Veikkausliiga');
    const hit = mentionsTeam('HJK voitti selvästi', hjk);
    expect(hit.evidence).toContain('HJK');
  });

  it('heikossa osumassa kertoo myös vahvistajan', () => {
    const inter = buildTeamPattern('FC Inter Turku', [], 'INT', 'Veikkausliiga');
    const hit = mentionsTeam('Inter jatkoi Veikkausliigassa', inter);
    expect(hit.evidence).toContain('+');
  });

  it('osumatta jäänyt ei anna todistetta', () => {
    const hjk = buildTeamPattern('HJK Helsinki', [], 'HJK', 'Veikkausliiga');
    const hit = mentionsTeam('Ei mainintaa', hjk);
    expect(hit.evidence).toBeNull();
    expect(hit.strength).toBeNull();
  });
});
