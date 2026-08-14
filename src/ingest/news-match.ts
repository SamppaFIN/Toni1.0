// Tiketti #29: Joukkuemainintojen tunnistus uutisteksteistä
//
// Tämä on se osa jossa naiivi toteutus tuottaa roskaa. Kaksi virhettä jotka
// löytyivät heti oikeaa syötettä vasten:
//
//   1. "TPS" osuu sanaan "https" — 202 väärää osumaa yhdestä RSS-syötteestä.
//      → Sanarajat ovat pakollisia, eivät kosmetiikkaa.
//
//   2. "Inter" osuu Inter Milaniin siinä missä tarkoitetaan Inter Turkua.
//      → Monitulkintaiset nimet vaativat lisätodisteen (kaupunki tai
//        seuraetuliite), muuten ottelukortille valuu vääriä uutisia.
//
// Väärä uutinen on pahempi kuin ei uutista: se muuttaa λ:aa väärään suuntaan
// ja käyttäjä perustelee vetonsa sillä.

import { normalizeName, significantTokens } from './team-match.js';

/**
 * Sanat jotka esiintyvät monen eri sarjan seuranimissä. Näitä ei hyväksytä
 * yksinään todisteeksi — mukaan vaaditaan toinen erotteleva sana.
 */
const AMBIGUOUS_TOKENS = new Set([
  'inter', 'united', 'city', 'athletic', 'atletico', 'sporting', 'dynamo', 'dinamo',
  'lokomotiv', 'olympic', 'olympique', 'real', 'racing', 'rangers', 'rovers', 'wanderers',
  'town', 'county', 'albion', 'nord', 'north', 'south', 'east', 'west', 'central',
  'akatemia', 'academy', 'reserve', 'ii',
]);

/** Lyhin sana joka kelpaa yksinään todisteeksi */
const MIN_TOKEN_LENGTH = 4;

export interface TeamPattern {
  /** Näyttönimi */
  name: string;
  /** Säännöt jotka yksinään riittävät osumaksi */
  strong: RegExp[];
  /** Säännöt jotka vaativat vahvistuksen — ks. corroborators */
  weak: RegExp[];
  /**
   * Vahvistavat säännöt monitulkintaisille sanoille: nimen muut erottelevat
   * sanat (kaupunki) ja sarjan nimi.
   *
   * Tämä on se ero joka ratkaisee "Inter Turku" vs "Inter Miami". Pelkkä
   * jalkapallokonteksti ei riitä: BBC ja ESPN ovat AINA jalkapalloa, joten
   * niissä kontekstiehto olisi aina tosi ja heikko sana käytännössä vahva.
   */
  corroborators: RegExp[];
}

function escapeRe(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordBoundary(term: string): RegExp {
  // Sanarajat molemmin puolin. Skandit säilytetään, koska "Seinäjoki" ja
  // "Seinajoki" ovat molemmat käytössä eri lähteissä — normalisointi hoitaa sen.
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'iu');
}

/**
 * Enintään näin monta kirjainta sallitaan sanan perään.
 * Suomen sijapäätteet ovat lyhyitä: -n, -ssa, -ssä, -sta, -lla, -hun.
 * Neljä riittää niihin muttei salli "Inter" → "International" (8 kirjainta).
 */
const MAX_SUFFIX_LENGTH = 4;

/**
 * Sanaraja alussa, taivutuspääte sallittuna lopussa.
 *
 * Suomi taivuttaa kaiken: "Veikkausliiga" esiintyy tekstissä muodossa
 * "Veikkausliigassa" ja "Veikkausliigan". Tiukka sanaraja hylkäsi ne, ja
 * testi paljasti sen: "Inter nousi Veikkausliigan kärkeen" ei löytänyt
 * vahvistusta vaikka sarja mainitaan.
 *
 * Alkuraja on silti pakollinen — se estää "TPS" osumisen sanaan "https".
 */
function stemBoundary(term: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term)}\\p{L}{0,${MAX_SUFFIX_LENGTH}}(?!\\p{L})`, 'iu');
}

/**
 * Rakenna tunnistussäännöt joukkueelle.
 *
 * Vahvat: koko nimi, monisanaiset yhdistelmät, isot lyhenteet (HJK, KuPS, SJK).
 * Heikot: yksittäiset monitulkintaiset tai lyhyet sanat.
 */
export function buildTeamPattern(
  name: string,
  aliases: string[] = [],
  short?: string,
  league?: string
): TeamPattern {
  const strong: RegExp[] = [];
  const weak: RegExp[] = [];
  const corroborators: RegExp[] = [];

  const candidates = [name, ...aliases].filter(Boolean);

  // Vahvistajiksi nimen erottelevat sanat jotka EIVÄT ole monitulkintaisia
  // ("Inter Turku" → "turku"), sekä sarjan nimi
  // Vahvistajat sallivat taivutuspäätteen: "Turku" → "Turussa" ei toimi
  // (astevaihtelu k→∅), mutta "Veikkausliiga" → "Veikkausliigassa" toimii,
  // ja sarjan nimi on käytännössä tärkein vahvistaja.
  for (const candidate of candidates) {
    for (const token of significantTokens(candidate)) {
      if (!AMBIGUOUS_TOKENS.has(token) && token.length >= MIN_TOKEN_LENGTH) {
        corroborators.push(stemBoundary(token));
      }
    }
  }
  if (league) corroborators.push(stemBoundary(league));

  for (const candidate of candidates) {
    const normalized = normalizeName(candidate);
    const tokens = significantTokens(candidate);

    // Koko nimi on aina vahva todiste
    if (normalized.includes(' ')) strong.push(wordBoundary(candidate));

    // Erottelevien sanojen yhdistelmä ilman seuraetuliitteitä: "Inter Turku"
    if (tokens.length > 1) strong.push(wordBoundary(tokens.join(' ')));

    for (const token of tokens) {
      if (AMBIGUOUS_TOKENS.has(token)) {
        weak.push(wordBoundary(token));
      } else if (token.length >= MIN_TOKEN_LENGTH) {
        strong.push(wordBoundary(token));
      } else {
        // Lyhyt sana: kelpaa vain jos se on kirjoitettu isoin kirjaimin
        // alkuperäisessä nimessä, eli se on lyhenne (HJK, VPS, TPS, SJK)
        const inOriginal = candidate.match(new RegExp(`\\b${token}\\b`, 'i'))?.[0];
        if (inOriginal && inOriginal === inOriginal.toUpperCase() && inOriginal.length >= 3) {
          strong.push(new RegExp(`(?<![\\p{L}\\p{N}])${inOriginal}(?![\\p{L}\\p{N}])`, 'u')); // isot kirjaimet merkitsevät
        } else {
          weak.push(wordBoundary(token));
        }
      }
    }
  }

  // Lyhennekoodi kortilta (esim. "HJK") jos se on riittävän pitkä
  if (short && short.length >= 3) {
    strong.push(new RegExp(`(?<![\\p{L}\\p{N}])${short}(?![\\p{L}\\p{N}])`, 'u'));
  }

  return { name, strong: dedupe(strong), weak: dedupe(weak), corroborators: dedupe(corroborators) };
}

function dedupe(patterns: RegExp[]): RegExp[] {
  const seen = new Set<string>();
  return patterns.filter((p) => {
    const key = `${p.source}|${p.flags}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface MentionResult {
  matched: boolean;
  /** Mikä sääntö osui — lokitusta ja virheenjäljitystä varten */
  evidence: string | null;
  strength: 'strong' | 'weak' | null;
}

/**
 * Mainitaanko joukkue tekstissä?
 *
 * Vahva osuma riittää yksinään. Heikko osuma vaatii **joukkuekohtaisen**
 * vahvistuksen: nimen toinen erotteleva sana (kaupunki) tai sarjan nimi.
 *
 * Tämä ero löytyi oikeaa syötettä vasten: ilman sitä "Miami coach stresses
 * that Messi needs privacy" liittyi Inter Turkuun, koska "Inter" osui ja
 * ESPN on jalkapallosyöte. Vahvistusvaatimuksen kanssa juttu tarvitsisi
 * myös sanan "Turku" tai "Veikkausliiga" — eikä sellaista ole.
 */
export function mentionsTeam(text: string, pattern: TeamPattern): MentionResult {
  for (const re of pattern.strong) {
    const hit = text.match(re);
    if (hit) return { matched: true, evidence: hit[0], strength: 'strong' };
  }

  for (const re of pattern.weak) {
    const hit = text.match(re);
    if (!hit) continue;
    const corroboration = pattern.corroborators.find((c) => c.test(text));
    if (corroboration) {
      return { matched: true, evidence: `${hit[0]} + ${text.match(corroboration)?.[0]}`, strength: 'weak' };
    }
  }

  return { matched: false, evidence: null, strength: null };
}

/**
 * Sanat jotka kertovat että teksti käsittelee jalkapalloa.
 *
 * Nämä ovat SANANVARTALOITA eivätkä kokonaisia sanoja, koska suomi taivuttaa:
 * "Euroopan liigasta", "Veikkausliigassa", "jalkapalloilija". Kokonaisten
 * sanojen lista hylkäsi testissä oikean euro-ottelujutun.
 *
 * Tarkoituksellisesti EI listalla: "liigassa" ja "liiga" yksinään — Suomessa
 * "Liiga" tarkoittaa useimmiten jääkiekon SM-liigaa.
 */
const FOOTBALL_CONTEXT = [
  // suomi, vartalot
  'jalkapall', 'veikkausliig', 'valioliig', 'mestarien liig', 'eurooppa-liig', 'eurooppaliig',
  'euroopan liig', 'konferenssiliig', 'eurokent', 'eurotaipale', 'euroill', 'euro-ill',
  'maalivahti', 'maalivahd', 'rangaistuspotku', 'kulmapotku', 'vapaapotku', 'avauskokoonpano',
  'huuhkaj', 'helmar', // maajoukkueet
  // englanti
  'football', 'soccer', 'premier league', 'champions league', 'europa league',
  'conference league', 'la liga', 'serie a', 'bundesliga', 'ligue 1', 'eredivisie',
  'goalkeeper', 'penalty', 'kick-off', 'kickoff', 'midfielder', 'striker', 'free-kick',
];

/**
 * Sanat jotka kertovat että teksti käsittelee jääkiekkoa.
 *
 * Tarpeellinen koska Ilves, TPS, KooKoo ja Jokerit ovat sekä jalkapallo- että
 * jääkiekkoseuroja. Ilman tätä "Ilves solmi luottopuolustajansa kanssa
 * jatkosopimuksen" liittyisi jalkapallo-otteluun, vaikka juttu on jääkiekosta.
 */
const HOCKEY_CONTEXT = [
  'jääkiekk', 'jaakiekk', 'sm-liig', 'liiga-', 'kiekkoil', 'maalivahtipeli',
  'ylivoima', 'alivoima', 'erätauko', 'eratauko', 'jatkoerä', 'rangaistuslaukau',
  'nhl', 'khl', 'mestis', 'leijon', 'ice hockey', 'puck', 'power play',
];

export function hasFootballContext(text: string): boolean {
  const lower = text.toLowerCase();
  return FOOTBALL_CONTEXT.some((stem) => lower.includes(stem));
}

export function hasHockeyContext(text: string): boolean {
  const lower = text.toLowerCase();
  return HOCKEY_CONTEXT.some((stem) => lower.includes(stem));
}

/**
 * Käsitteleekö juttu jalkapalloa?
 *
 * Jalkapallosyötteessä (BBC, Guardian) vastaus on aina kyllä. Kaikkien lajien
 * syötteessä (IS, Yle) se pitää päätellä tekstistä: pelkkä joukkuenimi ei
 * riitä, koska sama nimi voi olla toisen lajin seura.
 */
export function isAboutFootball(text: string, feedIsFootballOnly: boolean): boolean {
  if (feedIsFootballOnly) return true;
  if (hasHockeyContext(text)) return false;
  return hasFootballContext(text);
}
