// Tiketti #7: PDO-laskenta
// PDO = LS% + SV% — yli-/alisuorituksen ilmaisin.
// Liigakeskiarvo ≈ 100. Kaukana 100:sta → tilapäinen yli-/alisuoritus.

export interface PDOInput {
  goalsFor: number;
  shotsFor: number;
  goalsAgainst: number;
  shotsAgainst: number;
}

export interface PDOResult {
  shootingPct: number; // LS% = maalit / laukaukset × 100
  savePct: number; // SV% = torjunnat / vastustajan laukaukset × 100
  pdo: number; // LS% + SV%
}

export function calculatePDO(input: PDOInput): PDOResult {
  const shootingPct = input.shotsFor > 0 ? (input.goalsFor / input.shotsFor) * 100 : 0;
  const saves = input.shotsAgainst - input.goalsAgainst;
  const savePct = input.shotsAgainst > 0 ? (saves / input.shotsAgainst) * 100 : 100;
  const pdo = shootingPct + savePct;

  return { shootingPct, savePct, pdo };
}

export function interpretPDO(pdo: number): 'overperforming' | 'normal' | 'underperforming' {
  if (pdo > 102) return 'overperforming';
  if (pdo < 98) return 'underperforming';
  return 'normal';
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = calculatePDO({ goalsFor: 30, shotsFor: 300, goalsAgainst: 25, shotsAgainst: 280 });
  console.log(`LS%: ${result.shootingPct.toFixed(2)}% (expected 10.00%)`);
  console.log(`SV%: ${result.savePct.toFixed(2)}% (expected 91.07%)`);
  console.log(`PDO: ${result.pdo.toFixed(2)} (expected ~101.07)`);
  console.log(`Tulkinta: ${interpretPDO(result.pdo)}`);
}
