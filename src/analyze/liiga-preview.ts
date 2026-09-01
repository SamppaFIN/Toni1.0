// Kausiennakko DOKUMENTISTA, ei koodista
//
// ONGELMA JOTA TÄMÄ RATKAISEE: `liiga-priors.ts` koodasi ennakon sijalistan ja
// lähtö-Elon suoraan lähdekoodiin, ja `data/liiga-kausiennakko-2026-27.md` oli
// pelkkä ihmiselle kirjoitettu kopio samasta asiasta. Kaksi totuutta samasta
// luvusta eriytyy aina — ja tiedosto sanoi sen itse ("Korjattava huomiselle:
// pipeline lukee prioria vielä suoraan koodista").
//
// Nyt dokumentti on LÄHDE. Ennakon päivitys on markdown-taulukon muokkaus,
// ei koodimuutos. Koodissa oleva `TEAM_PRIORS` jää varalle: jos tiedosto
// puuttuu (esim. julkaistu bundle ilman `data/`-kansiota), putki jatkaa
// vanhoilla luvuilla eikä kaadu.
//
// MITÄ TÄSTÄ LUETAAN:
//   Sija       -> ennakon ennustama sijoitus
//   Lähtö-Elo  -> kauden lähtö-Elo SELLAISENAAN (ei johdeta sijasta)
//   Vahvuudet  -> plussat kortille
//   Haitat     -> miinukset kortille
//
// Lähtö-Elo luetaan taulukosta eikä lasketa `eloFromRank`:lla, jotta
// dokumentissa näkyvä luku ja kortilla näkyvä luku ovat sama luku. Jos
// sarake puuttuu tai on kelvoton, kutsuja saa `null`:in ja johtaa Elon
// sijasta kuten ennenkin.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Ennakkodokumentin oletussijainti repossa */
export const PREVIEW_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../data/liiga-kausiennakko-2026-27.md'
);

export interface PreviewTeam {
  /** Ennakon ennustama sijoitus */
  rank: number;
  /** Joukkueen nimi sellaisena kuin dokumentti sen kirjoittaa */
  team: string;
  /** Kauden lähtö-Elo taulukosta; null jos sarake puuttuu tai on kelvoton */
  elo: number | null;
  /** Ennakon plussat, yksi per kohta */
  strengths: string[];
  /** Ennakon miinukset, yksi per kohta */
  weaknesses: string[];
}

export interface PreviewSource {
  name: string;
  url: string | null;
  readAt: string | null;
}

export interface LiigaPreview {
  source: PreviewSource;
  teams: PreviewTeam[];
}

/**
 * Pilko luettelo pilkuista, mutta ÄLÄ sulkeiden sisältä.
 *
 * Ennakko kirjoittaa "terävä kärki (Blichfeld, Rautiainen)" — naiivi
 * `split(',')` katkaisisi sen kahdeksi valheelliseksi kohdaksi joista
 * toinen olisi pelkkä "Rautiainen)". Sulkeiden sisällä oleva pilkku on
 * luettelon osa, ei luettelon erotin.
 */
export function splitNotes(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let buffer = '';

  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);

    if ((ch === ',' || ch === ';') && depth === 0) {
      out.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  out.push(buffer.trim());

  // Tyhjät ja pelkät viivat pois: "—" tarkoittaa "ei mainintaa", ei kohtaa
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s && s !== '—' && s !== '-');
}

/** Markdown-taulukon rivi soluiksi. Reunaputket pois, sisäiset erottimiksi. */
function cellsOf(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Erotinrivi (`|---|---|`) ei ole dataa */
function isSeparator(cells: string[]): boolean {
  return cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/**
 * Poimi lähde markdownin metariveiltä.
 *
 * Muoto jota luetaan (ks. dokumentin alku):
 *   **Lähde:** Ristikaksi — Liiga-kausiennakko 2026-27
 *   <https://www.ristikaksi.com/...> (luettu 2026-09-01)
 *
 * Puuttuva lähde ei ole virhe — se on vain tuntematon, ja tuntematon
 * lähde on rehellisempi kuin keksitty.
 */
export function parsePreviewSource(markdown: string): PreviewSource {
  const nameMatch = markdown.match(/\*\*Lähde:\*\*\s*(.+)/);
  const urlMatch = markdown.match(/<(https?:\/\/[^>\s]+)>/);
  const readMatch = markdown.match(/luettu\s+(\d{4}-\d{2}-\d{2})/);

  return {
    name: nameMatch ? nameMatch[1].trim() : 'Liiga-kausiennakko',
    url: urlMatch ? urlMatch[1] : null,
    readAt: readMatch ? readMatch[1] : null,
  };
}

/**
 * Jäsennä ennakon sarjataulukko.
 *
 * Taulukko tunnistetaan SARAKKEIDEN SISÄLLÖSTÄ eikä sijainnista tiedostossa:
 * rivi kelpaa vain jos ensimmäinen solu on sijaluku ja toinen on nimi. Näin
 * dokumenttiin voi lisätä muita taulukoita ilman että tämä hajoaa hiljaa.
 */
export function parsePreviewTable(markdown: string): PreviewTeam[] {
  const teams: PreviewTeam[] = [];
  const seen = new Set<number>();

  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;

    const cells = cellsOf(line);
    if (cells.length < 3 || isSeparator(cells)) continue;

    const rank = Number(cells[0]);
    const team = cells[1];
    if (!Number.isInteger(rank) || rank < 1 || !team) continue;

    // Sama sija kahdesti tarkoittaa rikkinäistä taulukkoa. Hiljainen
    // päällekirjoitus piilottaisi virheen; ensimmäinen voittaa ja
    // kutsuja voi tarkistaa listan pituuden.
    if (seen.has(rank)) continue;
    seen.add(rank);

    const eloRaw = cells[2] ? Number(cells[2].replace(/[^\d.-]/g, '')) : NaN;

    teams.push({
      rank,
      team,
      // Elo-haitari on rajattu: dokumentin kirjoitusvirhe (esim. "16200")
      // ei saa päätyä malliin lähtöarvona.
      elo: Number.isFinite(eloRaw) && eloRaw >= 1000 && eloRaw <= 2000 ? Math.round(eloRaw) : null,
      strengths: splitNotes(cells[3] ?? ''),
      weaknesses: splitNotes(cells[4] ?? ''),
    });
  }

  return teams.sort((a, b) => a.rank - b.rank);
}

export function parsePreview(markdown: string): LiigaPreview {
  return { source: parsePreviewSource(markdown), teams: parsePreviewTable(markdown) };
}

/**
 * Kuinka monta joukkuetta taulukossa vähintään on oltava jotta se kelpaa.
 *
 * Osittain jäsentynyt taulukko on vaarallisempi kuin jäsentymätön: se
 * näyttäisi toimivan mutta antaisi osalle joukkueista lähtö-Elon ja osalle
 * ei, ja ero näkyisi kortilla mielivaltaisena. Kaikki tai ei mitään.
 */
export const MIN_PREVIEW_TEAMS = 10;

let cache: LiigaPreview | null | undefined;

/**
 * Lue ennakko levyltä. Palauttaa `null` jos tiedostoa ei ole tai se ei
 * jäsenny — kutsuja putoaa silloin koodissa oleviin varalukuihin.
 *
 * Välimuistitetaan prosessin eliniäksi: putki lukee tämän kerran per ottelu
 * ja tiedosto ei muutu ajon aikana.
 */
export function loadLiigaPreview(file: string = PREVIEW_FILE): LiigaPreview | null {
  if (file === PREVIEW_FILE && cache !== undefined) return cache;

  let parsed: LiigaPreview | null = null;
  try {
    parsed = parsePreview(readFileSync(file, 'utf8'));
    if (parsed.teams.length < MIN_PREVIEW_TEAMS) {
      console.warn(
        `[Ennakko] ${file}: vain ${parsed.teams.length} joukkuetta jäsentyi — taulukon rakenne on muuttunut, käytetään koodin varalukuja`
      );
      parsed = null;
    }
  } catch (err) {
    console.warn(`[Ennakko] ${file} ei luettavissa (${(err as Error).message}) — käytetään koodin varalukuja`);
    parsed = null;
  }

  if (file === PREVIEW_FILE) cache = parsed;
  return parsed;
}

/** Vain testejä varten: unohda välimuistiin luettu ennakko */
export function resetPreviewCache(): void {
  cache = undefined;
}
