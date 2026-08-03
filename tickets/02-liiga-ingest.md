# Tiketti #2: Liiga.fi api/v1 -ingestio

**Epic:** 📡 Data Foundation — Perusta
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä hakee automaattisesti Liigan pelaajatilastot, ottelutulokset ja joukkuetiedot. Käyttäjän ei tarvitse tehdä mitään — cron-ajo hoitaa.

## Miten toteutettu
- `src/ingest/liiga.ts` — kolme funktiota: `fetchLiigaTeams()`, `fetchLiigaPlayers()`, `fetchLiigaGames()`
- Suora fetch Liiga.fi:n epäviralliseen `api/v1/`-rajapintaan
- `ingestLiigaData()` — kokoaa kaiken yhdellä kutsulla

## Hyväksymiskriteerit
- [x] Pelaajatilastot haettu ja tallennettu players-tauluun (pipeline käsittelee tallennuksen)
- [x] Ottelut ja tulokset haettu games-tauluun
- [x] Joukkueiden perustiedot teams-taulussa
- [x] HTTP 200 ja validi JSON vahvistettu

## Tiedostot
- `src/ingest/liiga.ts`
