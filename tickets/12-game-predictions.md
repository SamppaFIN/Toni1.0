# Tiketti #12: Otteluennusteet + onnistumisseuranta

**Epic:** 💎 Value Detection — Arvo
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä ennustaa jokaisen tulevan Liiga-ottelun 1X2-lopputuloksen Elo-lukemien perusteella. Kun ottelu päättyy, järjestelmä vertaa ennustetta todelliseen tulokseen ja päivittää osumatarkkuuden. Käyttäjä näkee web-käyttöliittymässä kokonais- ja liukuvan onnistumisprosentin.

## Miten toteutettu
- `src/analyze/predict.ts` — ennustemoottori:
  - `predictGame(homeElo, awayElo)` — Elo-pohjainen 1X2-todennäköisyys kotiedulla (H≈40)
  - `checkPrediction(predicted, homeScore, awayScore)` — vertaa ennustetta tulokseen
  - `accuracyRate(predictions)` — kokonaisosumatarkkuus
  - `rollingAccuracy(predictions, window)` — liukuva tarkkuus (10/30 ottelua)
- Tasapelin todennäköisyys estimoidaan Elo-eron perusteella: pieni ero → suurempi tasapelin tn (15-28 %)
- Vain varsinainen peliaika huomioidaan (ei jatkoaikaa/rankkareita 1X2-vedoissa)

## Hyväksymiskriteerit
- [x] Ennuste generoitu jokaiselle upcoming-ottelulle (game_predictions-taulu)
- [x] 1X2-todennäköisyydet laskettu Elo-kaavalla + kotiedulla (H≈30-50)
- [x] Ottelun päätyttyä: was_correct päivitetty (vain varsinainen peliaika)
- [x] Onnistumis-% näkyvissä web UI:ssa (kokonais- ja liukuva 10/30)

## Tiedostot
- `src/analyze/predict.ts`
