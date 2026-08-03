// BetTracker — pääpipeline
// Ajaa koko ketjun: ingestio → analyysi → value → hälytykset
// GitHub Actions cron kutsuu tätä.

import { getSupabase } from './db/supabase.js';
import { ingestLiigaData } from './ingest/liiga.js';
import { ingestNewsFromAllFeeds } from './ingest/news.js';
import { ingestOdds } from './ingest/odds.js';
import { computeAllImpliedProbs } from './analyze/margin.js';
import { updateBothElos } from './analyze/elo.js';
import { predictGame, checkPrediction } from './analyze/predict.js';
import { checkValue, isNewsWindowValid } from './engine/value.js';
import { alertStrongValues } from './alert/telegram.js';

async function main() {
  console.log('=== BetTracker Pipeline ===');
  console.log(`Start: ${new Date().toISOString()}`);

  const supabase = getSupabase();

  // ──── Vaihe 1: Ingestio ────
  console.log('\n📡 Vaihe 1: Datan haku');

  let liigaData;
  try {
    liigaData = await ingestLiigaData();
    console.log('  ✓ Liiga-data haettu');
  } catch (err) {
    console.error('  ✗ Liiga-haku epäonnistui:', err);
  }

  let newsCount = 0;
  try {
    newsCount = await ingestNewsFromAllFeeds();
    console.log(`  ✓ Uutisia: ${newsCount} uutta`);
  } catch (err) {
    console.error('  ✗ Uutishaku epäonnistui:', err);
  }

  let oddsData;
  try {
    oddsData = await ingestOdds();
    console.log(`  ✓ Kertoimia: ${oddsData.length} snapshots`);
  } catch (err) {
    console.error('  ✗ Kerroinhaku epäonnistui:', err);
  }

  // ──── Vaihe 2: Analyysi ────
  console.log('\n📊 Vaihe 2: Analyysi');

  // Prosessoi kertoimet: marginaalin poisto
  const oddsWithProbs = oddsData ? computeAllImpliedProbs(oddsData) : [];
  console.log(`  ✓ Implied probability: ${oddsWithProbs.length} laskettu`);

  // Prosessoi pelitulokset: Elo-päivitykset
  if (liigaData) {
    const finishedGames = liigaData.games.filter((g) => g.status === 'finished');
    console.log(`  Valmiita pelejä: ${finishedGames.length}`);

    // Haetaan nykyiset Elo-lukemat joukkueille
    const { data: ratings } = await supabase.from('team_ratings').select('*');

    // TODO: Matchaa joukkueet ja päivitä Elot — tämä vaatii joukkueiden ID:t tietokannasta
    console.log('  (Elo-päivitys vaatii tietokannan joukkuetiedot)');
  }

  // Prosessoi tulevat ottelut: ennusteet
  if (liigaData) {
    const upcomingGames = liigaData.games.filter((g) => g.status === 'upcoming');
    console.log(`  Tulevia pelejä: ${upcomingGames.length}`);

    // TODO: Generoi ennusteet jokaiselle upcoming-pelille
  }

  // ──── Vaihe 3: Value-moottori ────
  console.log('\n💎 Vaihe 3: Value-tarkistus');

  let valueFlagCount = 0;
  // Vertaa mallin todennäköisyyksiä markkinan implisiittisiin
  // TODO: Kun Elo-ennusteet ja implied_prob:t on laskettu, aja checkValue()
  console.log('  (Value-moottori aktivoituu kun dataa on kertynyt)');

  // ──── Vaihe 4: Hälytykset ────
  console.log('\n🔔 Vaihe 4: Hälytykset');
  // TODO: Lähetä Telegram-hälytykset vahvoista value-flageista
  console.log('  (Hälytykset aktivoituvat kun value-flageja syntyy)');

  console.log('\n=== Pipeline valmis ===');
  console.log(`Lopetus: ${new Date().toISOString()}`);
}

main().catch(console.error);
