# Tiketti #6: Marginaalin poisto + implied probability

**Epic:** 🧠 Intelligence Engine — Äly
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä laskee automaattisesti vedonlyöntikertoimista puhtaan markkinatodennäköisyyden poistamalla bookmakerin katteen. Tätä verrataan oman mallin todennäköisyyteen value-moottorissa.

## Miten toteutettu
- `src/analyze/margin.ts` — `removeMargin(homeOdds, drawOdds, awayOdds)`
- Kaava: `implied_prob_i = (1/odds_i) / Σ(1/odds_j)`
- `computeAllImpliedProbs()` — käsittelee koko odds-snapshot-array'n
- Sisältää yksikkötestin tunnetuilla arvoilla (2.0/3.0/4.0)

## Hyväksymiskriteerit
- [x] implied_prob laskettu oikein (summa = 1.0)
- [x] Yksikkötesti tunnetuilla odds-arvoilla (ajettavissa: `npx tsx src/analyze/margin.ts`)
- [x] Tulokset kirjoitetaan value_flags-tauluun (model_prob-sarake)

## Tiedostot
- `src/analyze/margin.ts`
