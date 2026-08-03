// Tiketti #7: Pelaaja z-score — "kuumuusmittari"
// z = (PPG_7pv − PPG_kausi) / σ_kausi
// |z| > 1.5 → selvä poikkeama omasta normaalista ("kuuma" / "kylmä")

export interface PlayerGameLog {
  playerId: number;
  date: string;
  points: number; // maalit + syötöt
}

/**
 * Laske z-score pelaajan viimeaikaiselle suoritukselle.
 * @param recentGames — viimeiset N peliä (esim. 7pv)
 * @param seasonAvg — kauden pistekeskiarvo per peli
 * @param seasonStdDev — kauden keskihajonta
 */
export function calculateZScore(
  recentGames: PlayerGameLog[],
  seasonAvg: number,
  seasonStdDev: number
): number {
  if (recentGames.length === 0 || seasonStdDev === 0) return 0;

  const recentAvg = recentGames.reduce((sum, g) => sum + g.points, 0) / recentGames.length;
  return (recentAvg - seasonAvg) / seasonStdDev;
}

/** Laske kauden keskiarvo ja keskihajonta pelilokista */
export function seasonStats(games: PlayerGameLog[]): { avg: number; stdDev: number } {
  if (games.length === 0) return { avg: 0, stdDev: 0 };
  const avg = games.reduce((s, g) => s + g.points, 0) / games.length;
  const variance = games.reduce((s, g) => s + (g.points - avg) ** 2, 0) / games.length;
  return { avg, stdDev: Math.sqrt(variance) };
}

export function interpretZScore(z: number): 'hot' | 'normal' | 'cold' {
  if (z > 1.5) return 'hot';
  if (z < -1.5) return 'cold';
  return 'normal';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const season: PlayerGameLog[] = [
    { playerId: 1, date: '2026-01-01', points: 1 },
    { playerId: 1, date: '2026-01-02', points: 0 },
    { playerId: 1, date: '2026-01-03', points: 2 },
    { playerId: 1, date: '2026-01-04', points: 1 },
    { playerId: 1, date: '2026-01-05', points: 1 },
    { playerId: 1, date: '2026-01-06', points: 0 },
    { playerId: 1, date: '2026-01-07', points: 1 },
    { playerId: 1, date: '2026-01-08', points: 2 },
  ];
  const recent = season.slice(-3); // viimeiset 3 peliä: 0, 1, 2
  const { avg, stdDev } = seasonStats(season);
  const z = calculateZScore(recent, avg, stdDev);
  console.log(`Kauden ka: ${avg.toFixed(2)}, σ: ${stdDev.toFixed(2)}`);
  console.log(`Viimeiset 3 peliä: ${recent.map((g) => g.points).join(', ')} (ka ${(recent.reduce((s,g) => s+g.points,0)/recent.length).toFixed(2)})`);
  console.log(`z-score: ${z.toFixed(2)} → ${interpretZScore(z)}`);
}
