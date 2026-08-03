# Tiketti #1: Supabase-skeema + migraatiot

**Epic:** 📡 Data Foundation — Perusta
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Ei suoraa käyttäjätoimintoa — tämä on infrastruktuuritiketti. Luo tietokannan johon kaikki data tallennetaan.

## Miten toteutettu
- 9 taulua SQL-migraationa: `migrations/001_schema.sql`
- RLS-politiikat anon_key:lle: SELECT-oikeudet `value_flags`, `team_ratings`, `player_form`, `game_predictions`
- TypeScript-tyypit: `src/types.ts`
- Supabase-client: `src/db/supabase.ts`

## Hyväksymiskriteerit
- [x] Kaikki 9 taulua luotu (teams, players, games, news_events, odds_snapshots, team_ratings, player_form, value_flags, game_predictions)
- [x] RLS-politiikat: anon_key sallii SELECT vain arvosanatauluista
- [x] Migraatiot versionhallinnassa (`migrations/`-kansio)
- [x] Supabase-projekti luotu (käyttäjän vastuulla — yhteystiedot `.env`-tiedostoon)

## Tiedostot
- `migrations/001_schema.sql`
- `src/types.ts`
- `src/db/supabase.ts`
- `src/config.ts`
