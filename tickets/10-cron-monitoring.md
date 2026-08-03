# Tiketti #10: Cron-ajastus + monitorointi

**Epic:** 📱 Delivery — Toimitus
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä ajaa koko pipeline:n automaattisesti 2 kertaa päivässä (aamulla klo 08 ja illalla klo 20). Käyttäjä voi myös ajaa manuaalisesti GitHub Actionsin kautta. Lokit näkyvät Actions-välilehdellä.

## Miten toteutettu
- `.github/workflows/bettracker.yml` — GitHub Actions workflow
  - Ajastus: `cron: '0 6 * * *'` ja `cron: '0 18 * * *'` (UTC, eli 08/20 Suomen aikaa)
  - `workflow_dispatch` — manuaalinen ajo
  - Askeleet: checkout → Node.js 22 → npm ci → pipeline → deploy GitHub Pagesiin
- Pipeline (`src/pipeline.ts`) ajaa: ingestio → analyysi → value → hälytykset
- Jokainen vaihe kirjaa onnistumisen/epäonnistumisen konsoliin → näkyy Actions-lokissa

## Hyväksymiskriteerit
- [x] GitHub Actions workflow ajastettu (2x päivässä)
- [x] Workflow ajaa: ingestio → analyysi → value → hälytykset järjestyksessä
- [x] Lokitus: jokainen vaihe kirjaa onnistumisen/epäonnistumisen

## Tiedostot
- `.github/workflows/bettracker.yml`
- `src/pipeline.ts`
