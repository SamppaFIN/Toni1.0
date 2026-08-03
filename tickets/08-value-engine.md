# Tiketti #8: Value-moottori + kynnyslogiikka + uutisikkuna

**Epic:** 💎 Value Detection — Arvo
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä tunnistaa automaattisesti tilanteet joissa vedonlyöntimarkkina on hinnoitellut kohteen väärin (ylikerroin). Value-flagit näkyvät web-käyttöliittymässä ja vahvimmat (edge > 5 %) lähettävät Telegram-hälytyksen.

## Miten toteutettu
- `src/engine/value.ts` — kolme ydinfunktiota:

### 1. `checkValue(model, implied, odds)`
- Laskee edgen jokaiselle 1X2-puolelle: `edge = model_prob × odds − 1`
- edge > 3 % → ylikerroinkandidaatti
- edge > 5 % → vahva signaali

### 2. `isNewsWindowValid(newsConfidence, newsPublishedAt, oddsFetchedAt, previousOdds?, currentOdds?)`
- news_event.confidence > 0.7
- odds-snapshot < 30 min uutisen julkaisusta
- kerroin ei ole liikkunut yli 0.05 (jos vertailudataa)

### 3. Integraatio pipelineen
- Pipeline vertaa Elo-ennusteita implied_prob:iin ja kirjoittaa value_flagit kantaan

## Hyväksymiskriteerit
- [x] edge = model_prob × odds − 1 laskettu jokaiselle kohteelle
- [x] edge > 0.03 → value-flag (kandidaatti), edge > 0.05 → vahva signaali
- [x] Uutisikkuna: news_event.confidence > 0.7 JA odds < 30 min vanha JA kerroin ei liikkunut → flag
- [x] Kaikki value_flagit kirjoitettu value_flags-tauluun

## Tiedostot
- `src/engine/value.ts`
