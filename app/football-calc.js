// Tiketti #49: Poisson-laskenta selaimessa (Kerroinlaskuria varten)
//
// MIKSI TÄMÄ ON KOPIO PALVELIMEN KOODISTA:
// Snapshot on valmiiksi laskettu, ja se on hyvä niin — yksi totuus, samat luvut
// lokissa ja ruudulla. Mutta Kerroinlaskuri antaa käyttäjän muuttaa λ:aa omalla
// tekijällään ("avainhyökkääjä poissa −15 %"), ja siitä pitää laskea uusi edge
// ja panossuositus HETI. Palvelinkierros ei ole vaihtoehto: GitHub Pages on
// staattinen hosting eikä siellä ole palvelinta johon soittaa.
//
// Kopio on siis tietoinen kompromissi. Sen hinta on riski että selain ja
// palvelin eriytyvät hiljaa. Se riski torjutaan kahdella tavalla:
//   1. src/__tests__/football-calc.test.ts vertaa TÄMÄN moduulin tulokset
//      palvelimen funktioiden tuloksiin samoilla syötteillä.
//   2. Kortti näyttää aina snapshotin luvun ja säädetyn luvun rinnakkain,
//      joten poikkeama on käyttäjälle näkyvä eikä piilotettu.
//
// Vakiot ja kaavat on pidettävä identtisinä src/analyze/poisson.ts:n,
// src/analyze/consensus.ts:n ja src/engine/kelly.ts:n kanssa.

export const DEFAULT_RHO = -0.05;
export const MAX_GOALS = 8;
export const KELLY_FRACTION = 0.25;
export const KELLY_CAP = 0.02;

/** Poissonin pistetodennäköisyys. Logaritmeissa jottei k! ylivuoda. */
export function poissonPmf(k, lambda) {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let logFactorial = 0;
  for (let i = 2; i <= k; i++) logFactorial += Math.log(i);
  return Math.exp(-lambda + k * Math.log(lambda) - logFactorial);
}

/** Dixon–Coles-kerroin τ matalille tuloksille */
function tau(x, y, lambdaHome, lambdaAway, rho) {
  if (x === 0 && y === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (x === 0 && y === 1) return 1 + lambdaHome * rho;
  if (x === 1 && y === 0) return 1 + lambdaAway * rho;
  if (x === 1 && y === 1) return 1 - rho;
  return 1;
}

export function scoreMatrix(lambdaHome, lambdaAway, rho = DEFAULT_RHO, maxGoals = MAX_GOALS) {
  const matrix = [];
  let total = 0;

  for (let h = 0; h <= maxGoals; h++) {
    matrix[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonPmf(h, lambdaHome) * poissonPmf(a, lambdaAway) * tau(h, a, lambdaHome, lambdaAway, rho);
      matrix[h][a] = Math.max(0, p);
      total += matrix[h][a];
    }
  }

  if (total > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) matrix[h][a] /= total;
    }
  }

  return matrix;
}

export function outcomeProbs(matrix) {
  let home = 0;
  let draw = 0;
  let away = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (h > a) home += matrix[h][a];
      else if (h === a) draw += matrix[h][a];
      else away += matrix[h][a];
    }
  }
  return { home, draw, away };
}

export function overProb(matrix, line = 2.5) {
  let over = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      if (h + a > line) over += matrix[h][a];
    }
  }
  return over;
}

export function bttsProb(matrix) {
  let btts = 0;
  for (let h = 1; h < matrix.length; h++) {
    for (let a = 1; a < matrix[h].length; a++) btts += matrix[h][a];
  }
  return btts;
}

/** Sama kertova semantiikka kuin palvelimen adjustLambda() — delta on osuus, ei maalimäärä */
export function adjustLambda(lambda, delta) {
  return Math.max(0.1, lambda * (1 + delta));
}

function normalize(p) {
  const sum = p.home + p.draw + p.away;
  if (!(sum > 0)) return { home: 1 / 3, draw: 1 / 3, away: 1 / 3 };
  return { home: p.home / sum, draw: p.draw / sum, away: p.away / sum };
}

export function blendProbs(poisson, sharp, weight) {
  if (!sharp) return normalize(poisson);
  const w = Math.min(1, Math.max(0, weight));
  return normalize({
    home: w * poisson.home + (1 - w) * sharp.home,
    draw: w * poisson.draw + (1 - w) * sharp.draw,
    away: w * poisson.away + (1 - w) * sharp.away,
  });
}

export function edgeOf(modelProb, odds) {
  return modelProb * odds - 1;
}

/** Murto-Kelly kovalla katolla — identtinen src/engine/kelly.ts:n kanssa */
export function kellyStake(modelProb, odds, bankroll, fraction = KELLY_FRACTION, cap = KELLY_CAP) {
  const ZERO = { full_fraction: 0, fraction: 0, stake: 0, capped: false };
  if (!Number.isFinite(modelProb) || modelProb <= 0 || modelProb >= 1) return ZERO;
  if (!Number.isFinite(odds) || odds <= 1) return ZERO;
  if (!Number.isFinite(bankroll) || bankroll <= 0) return ZERO;

  const b = odds - 1;
  const q = 1 - modelProb;
  const full = (b * modelProb - q) / b;
  if (full <= 0) return { full_fraction: full, fraction: 0, stake: 0, capped: false };

  const scaled = full * fraction;
  const capped = scaled > cap;
  const applied = Math.min(scaled, cap);
  return { full_fraction: full, fraction: applied, stake: Math.round(bankroll * applied * 100) / 100, capped };
}

// ─── Käyttäjän omat tekijät ───────────────────────────────────────────────
//
// Tekijä on prosenttimuutos λ:aan, koska se on sama yksikkö jota uutissäädöt
// jo käyttävät (nlp-football.ts → adjustLambda). Näin käyttäjän tekijä ja
// mallin oma säätö ovat yhteismitallisia eivätkä kilpaile eri asteikoilla.

export const FACTORS_KEY = 'bt_football_factors';

export function loadFactors() {
  try {
    const raw = JSON.parse(localStorage.getItem(FACTORS_KEY) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

export function factorsFor(matchId) {
  const all = loadFactors();
  return Array.isArray(all[matchId]) ? all[matchId] : [];
}

function saveFactors(all) {
  try {
    localStorage.setItem(FACTORS_KEY, JSON.stringify(all));
  } catch {
    /* privaatti-ikkuna: tekijät elävät istunnon ajan */
  }
}

export function addFactor(matchId, factor) {
  const all = loadFactors();
  const list = Array.isArray(all[matchId]) ? all[matchId] : [];
  all[matchId] = [...list, { id: Date.now() + Math.floor(Math.random() * 1000), ...factor }];
  saveFactors(all);
  return all[matchId];
}

export function removeFactor(matchId, factorId) {
  const all = loadFactors();
  all[matchId] = (all[matchId] || []).filter((f) => f.id !== factorId);
  if (!all[matchId].length) delete all[matchId];
  saveFactors(all);
  return all[matchId] || [];
}

export function clearFactors(matchId) {
  const all = loadFactors();
  delete all[matchId];
  saveFactors(all);
}

/** Yhden puolen tekijöiden yhteisvaikutus */
export function totalDelta(factors, side) {
  return factors.filter((f) => f.side === side).reduce((sum, f) => sum + (Number(f.delta) || 0), 0);
}

/**
 * Laske ottelu uudelleen käyttäjän tekijöillä.
 *
 * Palauttaa null jos ottelulla ei ole Poisson-mallia (market-only) — silloin
 * λ:aa ei ole olemassa eikä sitä voi säätää. Se on rehellisempää kuin keksiä
 * lähtökohta jota mallilla ei ole.
 */
export function recalculate(match, factors, bankroll) {
  if (match.model.lambda_home === null || match.model.lambda_away === null) return null;

  const lambdaHome = adjustLambda(match.model.lambda_home, totalDelta(factors, 'home'));
  const lambdaAway = adjustLambda(match.model.lambda_away, totalDelta(factors, 'away'));

  const matrix = scoreMatrix(lambdaHome, lambdaAway);
  const poisson = outcomeProbs(matrix);
  const probs = blendProbs(poisson, match.market.sharp, match.model.blend_weight);

  const edges = ['home', 'draw', 'away'].map((side) => {
    const base = match.analysis.edges.find((e) => e.side === side);
    const odds = base?.odds_effective ?? 0;
    const edge = odds > 0 ? edgeOf(probs[side], odds) : -1;
    // Sama kynnys kuin palvelimella: panossuositus vain yli 3 %:n edgelle
    const kelly = edge > 0.03 ? kellyStake(probs[side], odds, bankroll) : { fraction: 0, stake: 0, capped: false };
    return {
      side,
      odds: base?.odds ?? 0,
      odds_effective: odds,
      book: base?.book ?? null,
      model_prob: probs[side],
      edge,
      flag: edge > 0.05 ? 'strong' : edge > 0.03 ? 'candidate' : 'none',
      kelly_fraction: kelly.fraction,
      stake_suggestion: kelly.stake,
      base_edge: base?.edge ?? 0,
      base_stake: base?.stake_suggestion ?? 0,
    };
  });

  return {
    lambdaHome,
    lambdaAway,
    poisson,
    probs,
    over25: overProb(matrix, 2.5),
    btts: bttsProb(matrix),
    edges,
  };
}
