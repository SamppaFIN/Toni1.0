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

import { loadLiigaPreview, PreviewTeam } from './liiga-preview.js';

/**
 * Ennakon lähde, näytetään kortilla viittauksena.
 *
 * Nämä ovat VARALUKUJA: `previewSource()` lukee saman tiedon dokumentista
 * (data/liiga-kausiennakko-2026-27.md) ja voittaa aina kun tiedosto on
 * luettavissa.
 */
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
 * 2026-09-01 alkaen ennakko antoi sijaluvun KAIKILLE 17 joukkueelle (aiemmin vain
 * 10:lle), joten `rank` on nyt aina asetettu. `tier` jaa naytoksi ja karkeaksi
 * varasijaluvuksi (`TIER_RANK`), jota `effectiveRank` kayttaa vain jos `rank` puuttuisi.
 */
// Paivitetty 2026-09-01: koko 17 joukkueen sijalista Ristikakon kausiennakosta.
// Yhteenveto vahvuuksineen/haittoineen: data/liiga-kausiennakko-2026-27.md.
// Aiemmin vain 10 joukkueella oli sija ja loput nojasivat tason keskikohtaan; nyt
// jokaisella on ennakon oma luku, joten `effectiveRank` palauttaa aina `rank`in.
export const TEAM_PRIORS: TeamPrior[] = [
  { team: 'Tappara', rank: 1, tier: 'karki', relegationRisk: false, strengthNote: "Huipputason valmennus (Jalonen), voittamisen kulttuuri, jatkuvuus, terava karki (Blichfeld, Rautiainen), eliittimaalivahti Heljanko", weaknessNote: "Keskikaistan laatu epavarma (Mattila, Rasanen)", arrivals: ["Kasper Kulonummi", "Justin Addamo"], departures: ["Eetu Tuulola", "Olli Juolevi"] },
  { team: 'Ilves', rank: 2, tier: 'karki', relegationRisk: false, strengthNote: "Kivenkova hyokkays, korkea perustekemisen taso, hyva yhteishenki, terve kilpailu pelipaikoista", weaknessNote: "Maalivahtien riittavyys (Armalis/Rifalk), suoritustason lasku pudotuspeleissa, erikoistilanteet", arrivals: ["Leo Loof", "Topias Hynninen", "Tony Sund", "Jan-Mikael Jarvinen"], departures: ["Simon Johansson", "Matias Mantykivi"] },
  { team: 'JYP', rank: 3, tier: 'karki', relegationRisk: false, strengthNote: "Hyokkayksen tulivoima (Ojantakanen, Tukiainen, Lassila), vahva ylivoima, Matikaisen korkea vaatimustaso", weaknessNote: "Maalivahdit (Salminen/Setanen), viisikkopuolustuksen pitavyys, kovuus kevaan peleissa", arrivals: ["Harri Pesonen", "Juuso Arola", "Malte Setkov"] },
  { team: 'KooKoo', rank: 4, tier: 'karki', relegationRisk: false, strengthNote: "Vastahyokkayksissa vaarallisin, jatkuvuus, ykkosmaalivahti Randelin (eliittia), fiksu seurajohtaminen", weaknessNote: "Puolustuksesta lahtenyt kiekollista osaamista (Suomi, Loponen), CHL:n lisakuorma", arrivals: ["Arttu Pelli", "Axel Holmstrom", "Jasper Patrikainen"], departures: ["Jimi Suomi", "Kalle Loponen", "Otto Paajanen"] },
  { team: 'Kärpät', rank: 5, tier: 'ylakeski', relegationRisk: false, strengthNote: "Hyokkayspelaaminen, ylivoima, eliittimaalivahti Rubin, joukkue rakennettu Karjalaisen nakoiseksi", weaknessNote: "Puolustuksen pitavyys, suoritustason ailahtelu, valtavat odotukset", arrivals: ["Samuli Ratinen"], departures: ["Andreas Okany", "Samuel Jung"] },
  { team: 'KalPa', rank: 6, tier: 'ylakeski', relegationRisk: false, strengthNote: "Terava karki (Maenpaa, Rissanen, Hartikainen), selkea peli-identiteetti, vahva kotijoukkue", weaknessNote: "Hyokkayspaassa kovia menetyksia (Curry, Soderlund Leger, Korhonen), tuloksenteko voi keskittya karkeen", arrivals: ["Elias Vilen", "Jesper Piitulainen", "Joonas Lyytinen"], departures: ["Patrick Curry", "Benjamin Korhonen"] },
  { team: 'Lukko', rank: 7, tier: 'ylakeski', relegationRisk: false, strengthNote: "Terava karki, korkea perustekemisen taso, laaja hyokkaysmateriaali, resurssit vahvistaa kesken kauden", weaknessNote: "Maalivahtiosasto (Raanta/Salonen), valmennus (Lamsa), kapeahko puolustus, nalan puute keval", arrivals: ["Santeri Virtanen", "Connor Ford"], departures: ["Atte Joki"] },
  { team: 'Jokerit', rank: 8, tier: 'ylakeski', relegationRisk: false, strengthNote: "Hyokkaysosasto (Curry, Nikkanen, Fortier, Kalapudas, Turunen), Liiga-paluun buusti (kotiottelut)", weaknessNote: "Maalivahtiosasto (Eriksson Ek/Vehvilainen), valmennuksen riittavyys, puolustuksessa kahden kerroksen vakea", arrivals: ["Patrick Curry", "Maxime Fortier", "Teemu Turunen", "Henri Nikkanen", "Matt Caito"] },
  { team: 'HIFK', rank: 9, tier: 'ylakeski', relegationRisk: false, strengthNote: "Hyvin roolitettu laituriosasto, tasapainoinen puolustus, Jokisen kyky kehittaa nuoria", weaknessNote: "Maalivahdit, loukkaantumisherkkyys, keskikaistan kapeus (Lehtera + nuoret)", arrivals: ["Niko Huuhtanen", "Kasper Puutio", "Jake Leschyshyn"], departures: ["Tony Sund", "Petr Kodytek"] },
  { team: 'SaiPa', rank: 10, tier: 'alakeski', relegationRisk: false, strengthNote: "Valmennus (Helminen), pelitapaan soveltuva materiaali, laadukas ykkosmaalivahti Piiroinen, kotihurmos", weaknessNote: "Hyokkayspaan jattimaiset menetykset (Kivenmaki, Fortier, Nikkanen, Kalapudas), CHL:n rasitus, ei kesta loukkaantumisia", departures: ["Patrick Curry", "Henri Nikkanen", "Maxime Fortier"] },
  { team: 'Ässät', rank: 11, tier: 'alakeski', relegationRisk: false, strengthNote: "Selkea peli-identiteetti, huippumaalivahti Bednar, viisikkopuolustus, kotipelaaminen, erikoistilanteet", weaknessNote: "Puolustuksen kiekollinen osaaminen rajallista, materiaali ei karkitasoa, loukkaantumisriski", departures: ["Kasper Puutio"] },
  { team: 'HPK', rank: 12, tier: 'alakeski', relegationRisk: true, strengthNote: "Huippumaalivahti Saarinen, valmennus Manner, tasapainoinen puolustus", weaknessNote: "Ulkomaalaishankintojen floppaaminen, hyokkayspaan tehottomuus, ratkaisuvoiman puute", arrivals: ["Chad Nychuk", "Brendan Ranford", "Jacob Crespin"], departures: ["Cameron Wright", "Jesse Kiiskinen"] },
  { team: 'Pelicans', rank: 13, tier: 'alakeski', relegationRisk: true, strengthNote: "Tiivis viisikkopuolustus, vaikeasti murrettava, vahva alivoima, laadukas ykkosmaalivahti Bartosak", weaknessNote: "Tehottomuus hyokkayspaassa, tasapaksu materiaali, ratkaisijoiden puute", arrivals: ["Aaro Chrons"], departures: ["Sakke Hamalainen"] },
  { team: 'TPS', rank: 14, tier: 'putoaja', relegationRisk: true, strengthNote: "Keskikaista (Haudum, Paajanen, Maatta), terava karki (Wernblom, Ikonen, Bryggman), lupaavia hankintoja", weaknessNote: "Ei huippumaalivahtia, hyokkayksen laajuus (laiturit) heikko, pelillinen ailahtelu", departures: ["Mitja Jokinen"] },
  { team: 'Kiekko-Espoo', rank: 15, tier: 'putoaja', relegationRisk: true, strengthNote: "Ykkosmaalivahti Rimpinen (eliittia), useita omia poikia", weaknessNote: "Kapeahko rosteri (etenkin hyokkays), kliinisten viimeistelijoiden puute, ei varaa loukkaantumisille", arrivals: ["Jere Sallinen", "Ville Lajunen", "Connor Corcoran"], departures: ["Cameron Hillis", "Kasper Kulonummi", "Santeri Virtanen"] },
  { team: 'Sport', rank: 16, tier: 'putoaja', relegationRisk: true, strengthNote: "Ennakkoluulottomuus, altavastaajan rooli, vastustajien mahdollinen aliarviointi", weaknessNote: "Liigan heikoimpia materiaaleja, paljon palkkasotureita, maalivahtiosasto epavarma (Ortio/Harkonen)" },
  { team: 'Jukurit', rank: 17, tier: 'putoaja', relegationRisk: true, strengthNote: "Altavastaajan mentaliteetti, paasee pelaamaan ilman paineita", weaknessNote: "Materiaali Liigan heikoin, kapea rosteri, putoamisuhka vakava", arrivals: ["Linus Sjodin", "Jesper Olofsson", "Jesper Myrenberg"], departures: ["Aleks Haatanen", "Jesper Piitulainen", "Sakke Hamalainen"] },
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

/**
 * Joukkueen priori nimellä. null jos joukkue ei ole ennakossa.
 *
 * Sijaluku ja lähtö-Elo tulevat DOKUMENTISTA kun se on luettavissa
 * (data/liiga-kausiennakko-2026-27.md), muuten koodin `TEAM_PRIORS`:ista.
 * Voimakartta lasketaan aina siitä sijaluvusta joka tosiasiassa käytetään,
 * jotta kortin luku ja mallin luku eivät voi erota.
 */
export function priorFor(
  teamName: string
): (TeamPrior & PriorStrength & { elo: number | null; strengths: string[]; weaknesses: string[] }) | null {
  const key = normalizeLiigaName(teamName);
  const prior = TEAM_PRIORS.find((p) => normalizeLiigaName(p.team) === key);
  const doc = previewFor(teamName);
  if (!prior && !doc) return null;

  const base: TeamPrior = prior ?? {
    // Dokumentissa on joukkue jota koodi ei tunne — ennakon rivi riittää.
    team: doc!.team,
    rank: doc!.rank,
    tier: 'alakeski',
    relegationRisk: false,
  };

  const rank = doc?.rank ?? effectiveRank(base);
  const notes = notesFor(teamName);

  return {
    ...base,
    rank: doc?.rank ?? base.rank,
    ...strengthFromRank(rank),
    elo: doc?.elo ?? null,
    strengths: notes.strengths,
    weaknesses: notes.weaknesses,
  };
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
  // Veikkaus ja osa mediasta kirjoittaa "K-Espoo"; liiga.fi ja ennakko
  // "Kiekko-Espoo". Ilman tata kasin syotetyt kertoimet eivat kytkeytyisi.
  kespoo: 'kiekkoespoo',
  jokerithelsinki: 'jokerit',
};

// ─── Ennakko dokumentista (data/liiga-kausiennakko-2026-27.md) ────────────
//
// Dokumentti on LÄHDE ja tämän tiedoston `TEAM_PRIORS` on vara. Ks.
// liiga-preview.ts: ennakon päivitys on markdown-taulukon muokkaus, ei
// koodimuutos, mutta putki ei myöskään kaadu jos tiedostoa ei ole.

let previewIndex: Map<string, PreviewTeam> | null | undefined;

/** Ennakon rivit normalisoidulla nimellä. null jos dokumenttia ei saatu. */
function previewByName(): Map<string, PreviewTeam> | null {
  if (previewIndex !== undefined) return previewIndex;
  const preview = loadLiigaPreview();
  previewIndex = preview
    ? new Map(preview.teams.map((t) => [normalizeLiigaName(t.team), t]))
    : null;
  return previewIndex;
}

/** Yhden joukkueen rivi ennakkodokumentista, null jos ei löydy */
export function previewFor(teamName: string): PreviewTeam | null {
  return previewByName()?.get(normalizeLiigaName(teamName)) ?? null;
}

/** Lähdeviite: dokumentista jos luettavissa, muuten koodin vara */
export function previewSource(): { name: string; url: string | null; readAt: string | null } {
  const preview = loadLiigaPreview();
  if (!preview) return { ...PRIOR_SOURCE };
  return {
    name: preview.source.name || PRIOR_SOURCE.name,
    url: preview.source.url ?? PRIOR_SOURCE.url,
    readAt: preview.source.readAt ?? PRIOR_SOURCE.readAt,
  };
}

/** Vain testejä varten: pakota ennakon uudelleenluku */
export function resetPriorPreviewCache(): void {
  previewIndex = undefined;
}

/**
 * Joukkueen plussat ja miinukset kortille.
 *
 * Dokumentti antaa ne valmiiksi listana; koodin varaluvut ovat yhtä pitkää
 * pilkkuluetteloa, joten ne pilkotaan samalla säännöllä. Näin kortti näyttää
 * samanlaiselta kummasta lähteestä tahansa.
 */
export function notesFor(teamName: string): { strengths: string[]; weaknesses: string[] } {
  const doc = previewFor(teamName);
  if (doc) return { strengths: doc.strengths, weaknesses: doc.weaknesses };

  const fallback = TEAM_PRIORS.find((p) => normalizeLiigaName(p.team) === normalizeLiigaName(teamName));
  return {
    strengths: splitList(fallback?.strengthNote),
    weaknesses: splitList(fallback?.weaknessNote),
  };
}

/** Sama sulkeet huomioiva pilkkojako kuin dokumentin puolella */
function splitList(text: string | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  let depth = 0;
  let buffer = '';
  for (const ch of text) {
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      out.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  out.push(buffer.trim());
  return out.filter(Boolean);
}

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
  const doc = loadLiigaPreview();

  // Dokumentti on lähde kun se on luettavissa: sen Lähtö-Elo-sarake on se
  // luku jonka käyttäjä näkee ennakosta, ja kortilla pitää näkyä sama luku.
  // Ilman dokumenttia Elo johdetaan sijasta kuten ennen (eloFromRank).
  if (doc) {
    for (const t of [...doc.teams].sort((a, b) => a.rank - b.rank)) {
      map.set(normalizeLiigaName(t.team), {
        elo: t.elo ?? eloFromRank(t.rank, doc.teams.length, base),
        change: 0,
        rank: t.rank,
      });
    }
    return map;
  }

  for (const [i, t] of rankedTeams().entries()) {
    map.set(normalizeLiigaName(t.team), {
      elo: eloFromRank(effectiveRank(t), TEAM_COUNT, base),
      change: 0,
      rank: i + 1,
    });
  }
  return map;
}
