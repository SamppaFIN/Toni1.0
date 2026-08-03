# Tiketti #4: LLM-tapahtumaerittely + JSON-validointi

**Epic:** 🧠 Intelligence Engine — Äly
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Järjestelmä analysoi uutisartikkelit automaattisesti DeepSeek/Claude LLM:llä ja poimii niistä rakenteiset tapahtumat (loukkaantumiset, kokoonpanomuutokset jne.). Matalan confidencen tapahtumat suodatetaan pois value-moottorilta.

## Miten toteutettu
- `src/engine/nlp.ts` — `extractEvents(articleText)` lähettää promptin DeepSeek API:lle
- Prompt-pohja ohjaa mallia palauttamaan validia JSON:ia
- `validateAndParse()` — siivoaa markdown-koodilohkot ja validoi rakenteen
- `highConfidenceEvents()` — palauttaa vain confidence > 0.5 tapahtumat

## Hyväksymiskriteerit
- [x] Prompt-pohja tuottaa validia JSON:ia
- [x] extracted_json validoidaan (event_type, team, player, confidence)
- [x] Matalan confidencen (<0.5) eventit merkitään muttei vaikuta value-moottoriin

## Tiedostot
- `src/engine/nlp.ts`
