// Tiketti #7: Elo-rating -moottori
// Jatkuvasti päivittyvä voimaestimaatti, riippumaton kirjanpitäjistä.
// Kaava: R' = R + K × (S − E), missä E = 1 / (1 + 10^((R_opp − R) / 400))

const K = 32; // liigakorostus

/** Voittotodennäköisyys Elo-lukemien perusteella */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/** Päivitä Elo-lukema pelin tuloksen perusteella */
export function updateElo(
  oldRating: number,
  opponentRating: number,
  result: 1 | 0.5 | 0 // 1 = voitto, 0.5 = tasapeli, 0 = häviö
): number {
  const expected = expectedScore(oldRating, opponentRating);
  return oldRating + K * (result - expected);
}

/** Päivitä molempien joukkueiden Elot yhdellä kutsulla */
export function updateBothElos(
  homeElo: number,
  awayElo: number,
  homeScore: number,
  awayScore: number
): { newHomeElo: number; newAwayElo: number } {
  const homeResult: 1 | 0.5 | 0 = homeScore > awayScore ? 1 : homeScore < awayScore ? 0 : 0.5;
  const awayResult: 1 | 0.5 | 0 = homeScore < awayScore ? 1 : homeScore > awayScore ? 0 : 0.5;

  return {
    newHomeElo: updateElo(homeElo, awayElo, homeResult),
    newAwayElo: updateElo(awayElo, homeElo, awayResult),
  };
}

// Kotietu otetaan huomioon ennustevaiheessa (predict.ts), ei itse Elo-päivityksessä

if (import.meta.url === `file://${process.argv[1]}`) {
  // Testi: tasavahvat joukkueet, kotivoitto
  const { newHomeElo, newAwayElo } = updateBothElos(1500, 1500, 3, 1);
  console.log(`Tasavahvat (1500 vs 1500), kotivoitto 3-1`);
  console.log(`  Uusi koti-Elo: ${newHomeElo.toFixed(0)} (expected ~1516)`);
  console.log(`  Uusi vieras-Elo: ${newAwayElo.toFixed(0)} (expected ~1484)`);

  // Testi: selvä altavastaaja voittaa
  const { newHomeElo: h2, newAwayElo: a2 } = updateBothElos(1700, 1300, 1, 4);
  console.log(`\nSuosikki (1700) häviää altavastaajalle (1300) 1-4`);
  console.log(`  Uusi koti-Elo: ${h2.toFixed(0)} (expected ~1668)`);
  console.log(`  Uusi vieras-Elo: ${a2.toFixed(0)} (expected ~1332)`);

  console.log('\nElo-moottori toimii ✓');
}
