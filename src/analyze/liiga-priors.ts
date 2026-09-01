// Tiketti #89: Liigan kauden 2026-27 voimasuhteet kausiennakosta
//
// ONGELMA JOTA TÄMÄ RATKAISEE: kauden alussa mallilla ei ole yhtään ottelua
// johon nojata. Jalkapallossa tämä hoidettiin edellisen kauden priorilla
// (tiketti #53) ja nousijoille alemman sarjan datalla (#68). Liigassa
// kausi 2026-27 on rakenteellisesti eri: 17 joukkuetta entisen 15:n sijaan,
// Jokerit palaa 12 vuoden tauon jälkeen, ja kolme alinta putoaa. Edellisen
// kauden taulukko ei siis kata koko sarjaa.
//
// LÄHDE: Ristikaksi.com:n Liiga-kausiennakko 2026-27.
//   https://www.ristikaksi.com/urheilusarjat/liiga-kausiennakko-2026-27
//
// Ennakko on LUETTU, EI SCRAPATTU. Sivusto on poistanut RSS-syötteensä
// käytöstä viestillä "disabled due content stealing by third parties", mikä
// on selvä kannanotto automaattista sisällön uudelleenjulkaisua vastaan.
// Tässä käytetään ennakon JOHTOPÄÄTÖSTÄ (ennustettu sijoitus) mallin
// prioriksi ja viitataan lähteeseen linkillä — artikkelin tekstiä ei
// kopioida eikä näytetä korteilla.
//
// MITÄ TÄMÄ EI OLE: tämä ei ole mittaus vaan yhden asiantuntija-arvion
// koodattu muoto. Se on paras käytettävissä oleva lähtötieto nollan ottelun
// kohdalla, ja se KUTISTUU pois sitä mukaa kun oikeita otteluita kertyy —
// täsmälleen kuten edellisen kauden priori jalkapallossa. Kymmenen ottelun
// jälkeen tällä ei pitäisi olla juuri merkitystä.

/** Ennakon lähde, näytetään kortilla viittauksena */
export const PRIOR_SOURCE = {
  name: 'Ristikaksi — Liiga-kausiennakko 2026-27',
  url: 'https://www.ristikaksi.com/urheilusarjat/liiga-kausiennakko-2026-27',
  readAt: '2026-09-01',
} as const;

/** Kaudella 2026-27 sarjassa on 17 joukkuetta ja kolme alinta putoaa */
export const TEAM_COUNT = 17;
export const RELEGATION_SPOTS = 3;

/**
 * Kuinka monen ottelun arvoinen ennakko on.
 *
 * Sama rooli kuin PREVIOUS_SEASON_WORTH:lla jalkapallossa (#53), mutta
 * PIENEMPI: edellisen kauden taulukko on mitattua dataa, kausiennakko on
 * yhden toimituksen arvio. Viiden ottelun jälkeen oikea data painaa jo
 * enemmän kuin ennakko.
 */
export const PRIOR_WORTH_MATCHES = 5;

export type Tier = 'karki' | 'ylakeski' | 'alakeski' | 'putoaja';

export interface TeamPrior {
  team: string;
  /** Ennakon ennustama sijoitus, null jos ennakko ei sano lukua */
  rank: number | null;
  /** Karkea taso silloinkin kun tarkkaa sijaa ei ole annettu */
  tier: Tier;
  /** Markkinoiden mukaan putoamisvaarassa (ennakon oma maininta) */
  relegationRisk: boolean;
  /** Ennakon nostama vahvuus, lyhyesti */
  strengthNote?: string;
  /** Ennakon nostama heikkous */
  weaknessNote?: string;
  /** Nimeltä mainitut tulokkaat */
  arrivals?: string[];
  /** Nimeltä mainitut lähtijät */
  departures?: string[];
}

/**
 * Ennakon joukkuekohtaiset arviot.
 *
 * `rank` on annettu VAIN niille joukkueille joille ennakko ilmoitti luvun.
 * Lopuille se on null — arvattu sijaluku näyttäisi mittaukselta vaikka olisi
 * keksitty, ja se on juuri se virhe jota tässä projektissa on vältetty
 * järjestelmällisesti. `tier` kantaa sen mitä ennakko tosiasiassa sanoi.
 */
export const TEAM_PRIORS: TeamPrior[] = [
  { team: 'Tappara', rank: 1, tier: 'karki', relegationRisk: false, strengthNote: "Hallitseva mestari, Kari Jalonen valmentajana", weaknessNote: "Mestaruuden puolustuspaine, kokoonpanomuutoksia", arrivals: ["Kasper Kulonummi", "Justin Addamo"], departures: ["Eetu Tuulola", "Olli Juolevi"] },
  { team: 'Ilves', rank: 2, tier: 'karki', relegationRisk: false, strengthNote: "Eliittitason hyokkaysvoima, Niemelan pelitapa", weaknessNote: "Maalivahtitilanne (Armalis-Rifalk), erikoistilanteet", arrivals: ["Leo Loof", "Topias Hynninen", "Tony Sund", "Jan-Mikael Jarvinen"], departures: ["Simon Johansson", "Matias Mantykivi"] },
  { team: 'JYP', rank: 3, tier: 'karki', relegationRisk: false, strengthNote: "Hyokkaysvoimaa, tasapainoinen ryhma, eliittitason ylivoima", weaknessNote: "Maalivahtisyvyys, pudotuspelihistoria", arrivals: ["Harri Pesonen", "Juuso Arola", "Malte Setkov"] },
  { team: 'KalPa', rank: 6, tier: 'ylakeski', relegationRisk: false, strengthNote: "Selkea peli-identiteetti, vahva kotivire", weaknessNote: "Merkittavia hyokkaajamenetyksia, ikaantyva runko", arrivals: ["Elias Vilen", "Jesper Piitulainen", "Joonas Lyytinen"], departures: ["Patrick Curry", "Benjamin Korhonen"] },
  { team: 'Jokerit', rank: 8, tier: 'ylakeski', relegationRisk: false, strengthNote: "Paluu Liigaan 12 vuoden tauon jalkeen, hyokkays sarjan parempaa puoliskoa", weaknessNote: "Maalivahtius todistamatta, puolustuksen syvyys, uusi jarjestelma", arrivals: ["Patrick Curry", "Maxime Fortier", "Teemu Turunen", "Henri Nikkanen", "Matt Caito"] },
  { team: 'HIFK', rank: 9, tier: 'ylakeski', relegationRisk: false, strengthNote: "Tasapainoinen hyokkays, yhtenainen puolustus", weaknessNote: "Maalivahtisyvyys, keskuksien keskikasto, loukkaantumiset", arrivals: ["Niko Huuhtanen", "Kasper Puutio", "Jake Leschyshyn"], departures: ["Tony Sund", "Petr Kodytek"] },
  { team: 'Kärpät', rank: 11, tier: 'alakeski', relegationRisk: false, strengthNote: "Kokenut runko sailyi, syvyytta ketjuissa", weaknessNote: "Ikaantyva ryhma, kysymysmerkkeja karkijoukkueita vastaan", arrivals: ["Samuli Ratinen"], departures: ["Andreas Okany", "Samuel Jung"] },
  { team: 'HPK', rank: 12, tier: 'alakeski', relegationRisk: true, strengthNote: "Kim Saarinen nousi Liigan parhaimmistoon, taktinen valmennus", weaknessNote: "Ulkomaalaisten epavarmuus, hyokkayksen epatasaisuus", arrivals: ["Chad Nychuk", "Brendan Ranford", "Jacob Crespin"], departures: ["Cameron Wright", "Jesse Kiiskinen"] },
  { team: 'Kiekko-Espoo', rank: 15, tier: 'putoaja', relegationRisk: true, strengthNote: "Eliittitason ykkosmaalivahti Petteri Rimpinen, Ahon jarjestelma", weaknessNote: "Syvyys erityisesti hyokkayksessa, ei varaa loukkaantumisiin", arrivals: ["Jere Sallinen", "Ville Lajunen", "Connor Corcoran"], departures: ["Cameron Hillis", "Kasper Kulonummi", "Santeri Virtanen"] },
  { team: 'Jukurit', rank: 17, tier: 'putoaja', relegationRisk: true, strengthNote: "Altavastaajan mentaliteetti", weaknessNote: "Materiaali Liigan heikoimpia, ohut ryhma", arrivals: ["Linus Sjodin", "Jesper Olofsson", "Jesper Myrenberg"], departures: ["Aleks Haatanen", "Jesper Piitulainen", "Sakke Hamalainen"] },

  // Ennakko ei antanut naille sijalukua. Taso on se mita se sanoi sanoin.
  { team: 'KooKoo', rank: null, tier: 'ylakeski', relegationRisk: false, strengthNote: "Jouko Myrran johdolla uskottava, eliittimaalivahti Randelin", weaknessNote: "Puolustus heikkeni (Suomi/Loponen), hyokkayksen tasaisuus", arrivals: ["Arttu Pelli", "Axel Holmstrom", "Jasper Patrikainen"], departures: ["Jimi Suomi", "Kalle Loponen", "Otto Paajanen"] },
  { team: 'Lukko', rank: null, tier: 'alakeski', relegationRisk: false, strengthNote: "Vakaa maalivahtipeli, kilpailukykyinen runko", weaknessNote: "Rajallinen hyokkayssyvyys", arrivals: ["Santeri Virtanen", "Connor Ford"], departures: ["Atte Joki"] },
  { team: 'SaiPa', rank: null, tier: 'alakeski', relegationRisk: false, strengthNote: "Raimo Helminen valmennuksessa, veteraaniosaamista", weaknessNote: "Rajallinen syvyys", departures: ["Patrick Curry", "Henri Nikkanen", "Maxime Fortier"] },
  { team: 'Ässät', rank: null, tier: 'alakeski', relegationRisk: false, strengthNote: "Jarno Pikkarainen valmentajana, jatkuvuutta", weaknessNote: "Rajallinen syvyys", departures: ["Kasper Puutio"] },
  { team: 'Pelicans', rank: null, tier: 'alakeski', relegationRisk: true, strengthNote: "Sami Kapanen paavalmentajana, vakiintunut rakenne", weaknessNote: "Epatasainen historia, keskikastin materiaali", arrivals: ["Aaro Chrons"], departures: ["Sakke Hamalainen"] },
  { team: 'TPS', rank: null, tier: 'putoaja', relegationRisk: true, strengthNote: "Toni Soderholm paavalmentajana, kokenut ryhma", weaknessNote: "Alustavasti vaaran vyohykkeella", departures: ["Mitja Jokinen"] },
  { team: 'Sport', rank: null, tier: 'putoaja', relegationRisk: true, strengthNote: "Lauri Mikkola valmentajana", weaknessNote: "Maaliodottamalla sarjan toiseksi heikoin viime kaudella" },
];

/**
 * Tason keskimääräinen sijaluku.
 *
 * Käytetään kun ennakko ei antanut tarkkaa sijaa: taso on karkeampi tieto
 * kuin luku, ja se esitetään karkeampana myös laskennassa.
 */
const TIER_RANK: Record<Tier, number> = {
  karki: 2.5,
  ylakeski: 6.5,
  alakeski: 11,
  putoaja: 15.5,
};

/** Sijaluku jota laskenta käyttää: ennakon oma jos on, muuten tason keskikohta */
export function effectiveRank(prior: TeamPrior): number {
  return prior.rank ?? TIER_RANK[prior.tier];
}

/**
 * Hyökkäys- ja puolustusvoima ennustetusta sijaluvusta.
 *
 * Kartta on tarkoituksella LOIVA. Sijaluku on järjestysasteikko eikä mittaus:
 * se kertoo kumpi on parempi, ei kuinka paljon. Jyrkkä kartta tekisi
 * ennakosta vahvemman väitteen kuin se on, ja kauden alussa juuri se johtaisi
 * väärin liputettuihin kohteisiin — sama virhe kuin jalkapallon lambda-bugi
 * (#48) jossa yksi ottelu sai liikaa painoa.
 *
 * SPREAD = 0.18 tarkoittaa että kärkijoukkue on noin 18 % keskitasoa
 * parempi hyökkäyksessä ja yhtä paljon parempi puolustuksessa. Se on
 * maltillinen ja tarkoituksella: ennakko voi olla väärässä.
 */
export const SPREAD = 0.18;

export interface PriorStrength {
  attack: number;
  defense: number;
}

export function strengthFromRank(rank: number, teams = TEAM_COUNT): PriorStrength {
  // Normalisoi valille [-1, 1]: 1 = paras, -1 = huonoin
  const mid = (teams + 1) / 2;
  const spread = Math.max(1, (teams - 1) / 2);
  const position = Math.max(-1, Math.min(1, (mid - rank) / spread));

  return {
    attack: 1 + position * SPREAD,
    // Puolustusluku on kaanteinen: pienempi = parempi puolustus
    defense: 1 - position * SPREAD,
  };
}

/** Joukkueen priori nimellä. null jos joukkue ei ole ennakossa. */
export function priorFor(teamName: string): (TeamPrior & PriorStrength) | null {
  const key = normalizeLiigaName(teamName);
  const prior = TEAM_PRIORS.find((p) => normalizeLiigaName(p.team) === key);
  if (!prior) return null;
  return { ...prior, ...strengthFromRank(effectiveRank(prior)) };
}

/**
 * Joukkuenimien normalisointi.
 *
 * Liigan nimet esiintyvät eri lähteissä eri muodoissa: kerroinrajapinta
 * käyttää usein englanninkielisiä tai lyhennettyjä muotoja ("Karpat",
 * "Assat", "IFK Helsinki"). Ilman tätä priori jäisi hiljaa kytkemättä —
 * sama vika kuin jalkapallossa eloKeyFor():n kanssa (#40), jossa 3/4 ottelusta
 * jäi ilman Elo-lukua huomaamatta.
 */
export function normalizeLiigaName(name: string): string {
  const cleaned = String(name ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '');

  return LIIGA_ALIASES[cleaned] ?? cleaned;
}

/** Tunnetut vaihtoehtoiset kirjoitusasut -> kanoninen normalisoitu nimi */
const LIIGA_ALIASES: Record<string, string> = {
  ifkhelsinki: 'hifk',
  hifkhelsinki: 'hifk',
  helsinkiifk: 'hifk',
  karpatoulu: 'karpat',
  oulunkarpat: 'karpat',
  tapparatampere: 'tappara',
  ilvestampere: 'ilves',
  jypjyvaskyla: 'jyp',
  kalpakuopio: 'kalpa',
  lukkorauma: 'lukko',
  saipalappeenranta: 'saipa',
  spotvaasa: 'sport',
  vaasansport: 'sport',
  assatpori: 'assat',
  porinassat: 'assat',
  pelicanslahti: 'pelicans',
  lahtipelicans: 'pelicans',
  kookookouvola: 'kookoo',
  jukuritmikkeli: 'jukurit',
  hpkhameenlinna: 'hpk',
  tpsturku: 'tps',
  turuntps: 'tps',
  kiekkoespoo: 'kiekkoespoo',
  espookiekko: 'kiekkoespoo',
  jokerithelsinki: 'jokerit',
};

/** Ennakon mukainen järjestys, vahvimmasta heikoimpaan */
export function rankedTeams(): Array<TeamPrior & PriorStrength> {
  return [...TEAM_PRIORS]
    .sort((a, b) => effectiveRank(a) - effectiveRank(b))
    .map((p) => ({ ...p, ...strengthFromRank(effectiveRank(p)) }));
}

// ─── Elo kauden alussa (tiketti #96) ──────────────────────────────────────
//
// Elo lasketaan normaalisti pelatuista otteluista (tiketti #57). Liigassa
// niitä on kauden alussa NOLLA, joten Elo-sarake jäi tyhjäksi kaikilta
// joukkueilta — juuri se puute jonka käyttäjä huomasi.
//
// Tässä Elo johdetaan kausiennakon sijaluvusta. Se on LÄHTÖARVO eikä mittaus,
// ja se korvautuu oikeilla otteluilla heti kun niitä on: season-elo.ts laskee
// Elon tuloksista, ja tämä on vain se piste josta lähdetään.

/** Elo-haitari ennakon karjen ja hannan valilla, +- keskiarvosta */
export const ELO_SPREAD = 120;

/**
 * Lähtö-Elo ennustetusta sijaluvusta.
 *
 * Haitari on maltillinen (±120) samasta syystä kuin voimakartta on loiva:
 * sijaluku on järjestysasteikko eikä mittaus. Vertailun vuoksi mitattu
 * Veikkausliigan Elo-haitari kauden lopussa on noin ±150, eli tämä on
 * hieman kapeampi kuin todellinen kauden mittaan syntyvä ero — mikä on
 * oikein, koska ennakko ei tiedä mitä kaudella tapahtuu.
 */
export function eloFromRank(rank: number, teams = TEAM_COUNT, base = 1500): number {
  const mid = (teams + 1) / 2;
  const spread = Math.max(1, (teams - 1) / 2);
  const position = Math.max(-1, Math.min(1, (mid - rank) / spread));
  return Math.round(base + position * ELO_SPREAD);
}

/**
 * Elo-kartta kaikille Liigan joukkueille kausiennakosta.
 *
 * Sama muoto kuin `EloLookup`:lla (live-snapshot.ts): avain on normalisoitu
 * nimi, arvo sisältää Elon, muutoksen ja sijan. `change` on nolla koska
 * kausi ei ole alkanut — mitään ei ole vielä tapahtunut, ja nollan
 * näyttäminen on rehellisempää kuin keksitty liike.
 */
export function priorEloMap(base = 1500): Map<string, { elo: number; change: number; rank: number }> {
  const map = new Map<string, { elo: number; change: number; rank: number }>();
  for (const [i, t] of rankedTeams().entries()) {
    map.set(normalizeLiigaName(t.team), {
      elo: eloFromRank(effectiveRank(t), TEAM_COUNT, base),
      change: 0,
      rank: i + 1,
    });
  }
  return map;
}
