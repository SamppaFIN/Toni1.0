# Tiketti #23: `today.json` -skeema + snapshot-julkaisu

**Epic:** ⚽ Football Foundation — Jalkapalloperusta
**Status:** ✅ done
**Effort:** S
**Riippuvuudet:** —

## Mitä käyttäjä voi tehdä
Selain saa kaikki päivän ottelut, kertoimet, tunnusluvut, uutiset ja valmiiksi lasketun analytiikan yhdestä staattisesta tiedostosta. Mitään API-avainta ei tarvita selainpuolella eikä kuukausikvootta pala sivulatauksista.

## Miksi näin
GitHub Pages on staattinen hosting. Jos selain hakisi kertoimet suoraan:
- API-avain näkyisi sivun lähdekoodissa kaikille
- CORS estäisi useimmat kerroin-API:t
- 500 pyynnön kuukausikvootta palaisi muutamassa sadassa sivulatauksessa

Node-putki laskee kaiken valmiiksi ja kirjoittaa `public/data/today.json`:n. Selain vain renderöi. Sama tiedosto kopioidaan `public/data/history/YYYY-MM-DD.json`:iin, mikä antaa CLV- ja tarkkuusseurannalle oikeaa aineistoa versionhallintaan.

## Miten toteutettu
- `src/types-football.ts` — koko kontrakti tyyppeinä, `SCHEMA_VERSION = 1`
- `src/publish/snapshot.ts`
  - `bestOdds()` — paras kerroin per kohde kaikkien toimistojen yli
  - `buildMarketView()` — kate, devigattu konsensus, sharp-ankkuri
  - `buildModelView()` — Poisson + blendi, molemmat näkyvissä läpinäkyvyyden vuoksi
  - `buildAnalysisView()` — edge, value-lippu ja Kelly-panos per kohde
  - `buildMatchCard()` / `buildSnapshot()` — kokoaminen
  - `validateSnapshot()` — palauttaa virhelistan; rikkinäistä ei julkaista
  - `writeSnapshot()` — validoi, kirjoittaa today.json + history-kopion
- `src/publish/mock-snapshot.ts` — deterministinen esimerkkisnapshot ilman API-avaimia
- `src/env.ts` — `.env`-lataus ilman riippuvuuksia (Node 20:ssä ei automaattista)
- `public/data/today.json` — committoitu esimerkki, 4 ottelua, `source: "mock"`

## Suunnittelupäätökset
- **Ei skeemakirjastoa.** zod olisi uusi riippuvuus yhden tiedostomuodon takia. `validateSnapshot()` tarkistaa juuri ne asiat jotka rikkovat UI:n: kerroin ≤ 1, todennäköisyyssummat ≠ 1, kelvoton ISO-aika, vajaa edge-lista.
- **Panossuositus vain kynnyksen ylittäville.** Kelly antaisi positiivisen panoksen heti kun edge > 0, mutta alle 3 %:n edge on mallin virherajojen sisällä. Lippu ja panossuositus pysyvät näin samaa mieltä — ei valheellista tarkkuutta.
- **Kate lasketaan parhaista kertoimista.** Se on kate jonka käyttäjä tosiasiassa maksaa kun hän shoppailee jokaisen kohteen parhaalta toimistolta.
- **Esimerkkisnapshot on deterministinen.** Ei `Math.random()`ia, jotta committoitu tiedosto ei muutu joka ajolla ja diffit pysyvät luettavina.
- **`source`-kenttä pakollinen.** `"mock"` kertoo UI:lle että kertoimet ovat esimerkkejä eivätkä oikeita — käyttäjä ei saa erehtyä lyömään vetoa keksittyihin lukuihin.

## Hyväksymiskriteerit
- [x] Skeema dokumentoitu (`src/types-football.ts` + `PLAN-jalkapallo.md` kohta 1)
- [x] `writeSnapshot()` kirjoittaa validin tiedoston ja kaataa ajon jos validointi ei mene läpi
- [x] Esimerkki `public/data/today.json` committoitu (4 ottelua, kaikki kolme lipputilaa: 💎 1, 🟡 1, ⚫ 10)
- [x] Validointitestit: 34 testiä, myös rikkinäiselle datalle (väärä versio, kerroin ≤ 1, summa ≠ 1, kelvoton aika, null-syöte)
- [x] `history/YYYY-MM-DD.json` -kopio syntyy samalla ajolla

## Ajo
```bash
npm run snapshot:mock     # kirjoittaa public/data/today.json
```

## Tiedostot
- `src/types-football.ts`
- `src/publish/snapshot.ts`
- `src/publish/mock-snapshot.ts`
- `src/env.ts`
- `src/__tests__/snapshot.test.ts`
- `public/data/today.json`, `public/data/history/2026-08-14.json`
