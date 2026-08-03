# Tiketti #9: Telegram-hälytykset

**Epic:** 📱 Delivery — Toimitus
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Käyttäjä saa Telegram-viestin puhelimeensa kun järjestelmä löytää vahvan value-flagin (edge > 5 %). Viesti sisältää ottelun, markkinan, edge-prosentin ja linkin uutisartikkeliin.

## Miten toteutettu
- `src/alert/telegram.ts` — kaksi funktiota:
  - `sendTelegramAlert(payload)` — lähettää yhden viestin Telegram Bot API:n kautta
  - `alertStrongValues(checks, gameLabel, newsUrl?)` — suodattaa vain strong-flagit ja lähettää hälytykset
- Viestiformaatti: MarkdownV2, sisältää edge-prosentin, kertoimen ja uutislinkin
- Konfiguraatio: `TELEGRAM_BOT_TOKEN` ja `TELEGRAM_CHAT_ID` env-muuttujina

## Hyväksymiskriteerit
- [x] Telegram-botti lähettää viestin kun uusi value_flag syntyy
- [x] Viesti sisältää: ottelu, markkina, edge-%, uutislinkki
- [x] Vain edge > 0.05 -liput hälytetään automaattisesti

## Tiedostot
- `src/alert/telegram.ts`
