// Tiketti #24: Joukkueiden nimien täsmäytys lähteiden välillä
//
// Kerroinlähde ja tilastolähde eivät koskaan kirjoita joukkueen nimeä samalla
// tavalla. Oikeat parit tästä projektista:
//
//   The Odds API          veikkausliiga.com     football-data.org
//   "KuPS Kuopio"      ↔  "KuPS"
//   "FC Inter Turku"   ↔  "FC Inter"
//   "Jaro"             ↔  "FF Jaro"
//   "Manchester City"                        ↔  "Manchester City FC" / "Man City"
//
// Jos täsmäytys epäonnistuu, ottelu jää ilman tunnuslukuja ja malli putoaa
// market-only-tilaan hiljaa. Siksi täsmäytys on oma testattu moduuli ja
// epäonnistuminen lokitetaan aina näkyvästi.

/** Seuraetuliitteet ja -loppuliitteet joilla ei ole erottelevaa merkitystä */
const AFFIXES = new Set([
  'fc', 'ac', 'if', 'ifk', 'ff', 'sc', 'sk', 'afc', 'cf', 'as', 'ss', 'ssc',
  'bk', 'ik', 'fk', 'kf', 'club', 'calcio', 'cd', 'ud', 'rc',
]);

/** Poista diakriitit ja välimerkit, pienennä kirjaimet */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diakriitit pois: ä → a, ö → o
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Nimen erottelevat sanat. Seuraetuliitteet pudotetaan, mutta vain jos
 * jotain jää jäljelle — muuten "AC" jäisi tyhjäksi joukoksi.
 */
export function significantTokens(name: string): string[] {
  const tokens = normalizeName(name).split(' ').filter(Boolean);
  const stripped = tokens.filter((t) => !AFFIXES.has(t));
  return stripped.length ? stripped : tokens;
}

/**
 * Täsmäävätkö nimet samaan joukkueeseen?
 *
 * Ehto on tarkoituksella tiukka: toisen nimen erottelevien sanojen joukko
 * pitää olla toisen osajoukko. Pelkkä leikkaus ei riitä, koska
 * "FC Inter Turku" ja "TPS Turku" jakavat sanan "turku" olematta sama joukkue.
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = new Set(significantTokens(a));
  const tb = new Set(significantTokens(b));
  if (!ta.size || !tb.size) return false;

  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return true;
}

export interface Named {
  name: string;
  /** Vaihtoehtoiset kirjoitusasut, esim. football-data.orgin shortName ja tla */
  aliases?: string[];
}

/**
 * Etsi joukkue listasta nimen perusteella.
 * Kokeilee sekä pääasiallista nimeä että kaikkia aliaksia — tämä on se mikä
 * saa "Manchester City" täsmäämään sekä nimeen "Manchester City FC" että
 * lyhenteeseen "Man City".
 */
export function findTeam<T extends Named>(teams: T[], name: string): T | null {
  // Ensin tarkka osuma normalisoinnin jälkeen — nopein ja varmin
  const target = normalizeName(name);
  for (const t of teams) {
    if (normalizeName(t.name) === target) return t;
    if (t.aliases?.some((a) => normalizeName(a) === target)) return t;
  }

  // Sitten sanajoukkovertailu
  const matches = teams.filter((t) => namesMatch(t.name, name) || (t.aliases ?? []).some((a) => namesMatch(a, name)));

  // Useampi osuma tarkoittaa epäselvää täsmäytystä — parempi palauttaa null
  // kuin arvata väärä joukkue ja laskea analyysi vääristä luvuista
  return matches.length === 1 ? matches[0] : null;
}
