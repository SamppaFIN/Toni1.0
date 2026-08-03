# Tiketti #5: Odds API -integraatio (1 provider)

**Epic:** 📡 Data Foundation — Perusta
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä hakee automaattisesti vedonlyöntikertoimet The Odds API:sta Liigan 1X2-markkinalle.

## Miten toteutettu
- `src/ingest/odds.ts` — `fetchOdds()` ja `parseOddsResponse()`
- Tukee The Odds API:n v4-rajapintaa, `icehockey_liiga`-sport key
- `ingestOdds()` — yhdistää haun ja jäsentämisen
- Konfiguroitavissa: `ODDS_API_KEY`-env-muuttuja, fetch-väli cronissa

## Hyväksymiskriteerit
- [x] The Odds API tai Goalserve yhdistetty
- [x] Kertoimet tallennettu odds_snapshots-tauluun (1X2-markkina)
- [x] fetch-väli konfiguroitavissa (GitHub Actions cron -muuttuja)

## Tiedostot
- `src/ingest/odds.ts`
