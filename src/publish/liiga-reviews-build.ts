// Tiketti #105: Liigan kierrosarvioinnin ajo — sama rooli kuin reviews.ts:llä
// jalkapallossa, mutta lähteet ovat erilaiset (Liiga.fi, ei ESPN).
//
// Kaksi lähdettä liitetään OTTELUKOHTAISESTI, ei match_id:n kautta: kerroin-
// historian match_id rakennetaan Odds APIn joukkuenimistä (teamRef().short),
// Liiga.fi:llä on omat nimensä. Sama liitos jota liiga-elo.ts ja live-
// snapshot.ts jo käyttävät: päivä + normalizeLiigaName(nimi).

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { OddsHistoryFile } from './odds-history.js';
import { fetchLiigaGames } from '../ingest/stats-liiga.js';
import { normalizeLiigaName } from '../analyze/liiga-priors.js';
import { reviewGame, buildRoundReview, LiigaMatchReview, LiigaRoundReview } from './liiga-reviews.js';

const SPORT_KEY = 'icehockey_liiga';

export interface LiigaReviewsFile {
  schema_version: 1;
  generated_at: string;
  rounds: LiigaRoundReview[];
}

function readJson<T>(p: string): T | null {
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Kokoa kierrosarviot koko kerroinhistoriasta.
 *
 * Vain ratkenneet Liigan ottelut joilla on sekä Liiga.fi-tulos että
 * arkistoitu avaushavainto (malli + markkina) käsitellään — kumpikin
 * puuttuva lähde jättää ottelun pois, ei arvausta.
 */
export async function buildLiigaReviews(publicDir: string, now = new Date()): Promise<LiigaReviewsFile> {
  const history = readJson<OddsHistoryFile>(path.join(publicDir, 'data', 'odds-history.json'));
  // t.result JÄTETÄÄN VAATIMATTA: se tulee results-from-espn.ts:stä, joka on
  // jalkapallo-/ESPN-lähde eikä koskaan täytä sitä jääkiekko-otteluille.
  // Lopputulos luetaan sen sijaan suoraan Liiga.fi-pelistä alla (reviewGame),
  // joten tässä riittää että ottelulla on ylipäätään arkistoitu havainto.
  const hockeyTimelines = (history?.matches ?? []).filter((t) => t.sport_key === SPORT_KEY && t.points.length);

  if (!hockeyTimelines.length) {
    console.warn('[LiigaReviews] ei arkistoituja jaakiekko-otteluita kerroinhistoriassa');
    return { schema_version: 1, generated_at: now.toISOString(), rounds: [] };
  }

  const games = await fetchLiigaGames(now);

  // Liiga.fi-peli haetaan paivan + normalisoidun nimiparin perusteella —
  // sama liitostapa kuin liiga-elo.ts:ssa (#104).
  const byKey = new Map<string, (typeof games)[number]>();
  for (const g of games) {
    if (g.ended !== true) continue;
    const day = String(g.start ?? '').slice(0, 10);
    const h = normalizeLiigaName(g.homeTeam?.teamName ?? '');
    const a = normalizeLiigaName(g.awayTeam?.teamName ?? '');
    if (!h || !a) continue;
    byKey.set(`${day}:${h}:${a}`, g);
  }

  const reviews: LiigaMatchReview[] = [];
  let liitetty = 0;

  for (const t of hockeyTimelines) {
    const day = t.kickoff.slice(0, 10);
    const key = `${day}:${normalizeLiigaName(t.home)}:${normalizeLiigaName(t.away)}`;
    const game = byKey.get(key);
    if (!game) continue;
    liitetty++;

    const opening = t.points[0];
    const review = reviewGame(game, opening.model, opening.implied);
    if (review) reviews.push(review);
  }

  console.log(`[LiigaReviews] ${hockeyTimelines.length} arkistoitua jaakiekko-ottelua kerroinhistoriassa · ${liitetty} liitetty paattyneeseen Liiga.fi-tulokseen`);

  const byDate = new Map<string, LiigaMatchReview[]>();
  for (const r of reviews) {
    const list = byDate.get(r.date);
    if (list) list.push(r);
    else byDate.set(r.date, [r]);
  }

  const rounds = [...byDate.entries()]
    .map(([date, list]) => buildRoundReview(list, date))
    .sort((a, b) => b.date.localeCompare(a.date));

  return { schema_version: 1, generated_at: now.toISOString(), rounds };
}

export function writeLiigaReviews(publicDir: string, file: LiigaReviewsFile): string {
  const dir = path.join(publicDir, 'data');
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, 'liiga-reviews.json');
  writeFileSync(out, JSON.stringify(file) + '\n', 'utf8');
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  buildLiigaReviews(publicDir)
    .then((file) => {
      const out = writeLiigaReviews(publicDir, file);
      for (const round of file.rounds) {
        const s = round.summary;
        console.log(
          `\n${round.date}  ${s.matches} ottelua · malli ${s.modelCorrect}/${s.matches} · markkina ${s.marketCorrect}/${s.matches} · ei kertaakaan voitolla: ${s.neverLeading}`
        );
        for (const [claim, r] of Object.entries(s.claims)) {
          console.log(`  ${claim.padEnd(20)} ${r.hit}/${r.tested}`);
        }
      }
      console.log(`\nKirjoitettu: ${out}`);
    })
    .catch((err) => {
      console.error('[LiigaReviews] epaonnistui:', err);
      process.exitCode = 1;
    });
}
