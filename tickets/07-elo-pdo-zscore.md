# Tiketti #7: Elo + PDO + z-score -moottori

**Epic:** 🧠 Intelligence Engine — Äly
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä laskee automaattisesti joukkueiden Elo-voimaluvut (päivittyvät pelien jälkeen), PDO-ylisuoritusindikaattorin ja pelaajien z-score-kuumuusmittarin. Nämä syöttävät value-moottoria ja ennustemallia.

## Miten toteutettu

### Elo (`src/analyze/elo.ts`)
- `updateElo()` — R' = R + K×(S−E), K=32
- `updateBothElos()` — päivittää molemmat joukkueet yhdellä kutsulla
- Sisältää testit: tasavahvojen ottelu ja altavastaajan yllätysvoitto

### PDO (`src/analyze/pdo.ts`)
- `calculatePDO()` — PDO = LS% + SV% = (maalit/laukaukset + torjunnat/vastustajan laukaukset) × 100
- `interpretPDO()` — >102 ylisuorittaa, <98 alisuorittaa

### Z-score (`src/analyze/zscore.ts`)
- `calculateZScore()` — z = (PPG_7pv − PPG_kausi) / σ_kausi
- `seasonStats()` — laskee kauden keskiarvon ja keskihajonnan pelilokista
- `interpretZScore()` — |z| > 1.5 = kuuma/kylmä

## Hyväksymiskriteerit
- [x] Elo päivittyy jokaisen pelatun ottelun jälkeen (K=32)
- [x] PDO = LS% + SV% laskettu ja tallennettu team_ratings-tauluun
- [x] Pelaajien z-score laskettu (|z|>1.5 = kuuma/kylmä)

## Tiedostot
- `src/analyze/elo.ts`
- `src/analyze/pdo.ts`
- `src/analyze/zscore.ts`
