# Tiketti #3: Uutis-RSS-scraper (1 lähde)

**Epic:** 📡 Data Foundation — Perusta
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä lukee automaattisesti Jatkoajan ja Ylen RSS-syötteet ja tallentaa uutisartikkelit tietokantaan NLP-erittelyä varten.

## Miten toteutettu
- `src/ingest/news.ts` — käyttää `rss-parser`-kirjastoa
- `fetchRssFeed(url)` — hakee yhden syötteen
- `ingestNewsFromAllFeeds()` — käy läpi kaikki konfiguroidut syötteet
- Duplikaatit estetään `source_url`:n perusteella (UNIQUE-rajoite)

## Hyväksymiskriteerit
- [x] Vähintään 1 RSS-syöte toimii (Jatkoaika, Yle tai IS)
- [x] Artikkelit tallennetaan news_events-tauluun (raw_text)
- [x] Duplikaatit tunnistetaan source_url:n perusteella

## Tiedostot
- `src/ingest/news.ts`
