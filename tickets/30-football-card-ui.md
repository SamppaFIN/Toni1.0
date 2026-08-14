# Tiketti #30: Jalkapallo-ottelukortti käyttöliittymässä

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** M
**Riippuvuudet:** 23, 24, 25, 28

## Mitä käyttäjä voi tehdä
Näkee päivän jalkapallo-ottelut oikeilla kertoimilla usealta toimistolta, ja jokaiselta ottelulta kolme avattavaa osiota: **📊 Tunnusluvut**, **📰 Uutiset**, **💎 Analyysi**. Kerrointa klikkaamalla voi asettaa vedon, ja ponnahdus kertoo mitä malli kohteesta ajattelee.

## Arkkitehtuuri: moduulit, ei kasvavaa demo.html:ää

Handoverissa varoitettiin että `demo.html` (933 riviä) on rajoillaan. Jalkapallokortti olisi kasvattanut sen ~1500 riviin.

Ratkaisu: jalkapallonäkymä on **ES-moduuleissa** `public/app/`-hakemistossa, ladattuna `<script type="module">`-tagilla. Ei build-vaihetta, ei frameworkia, ei uutta riippuvuutta — "vähemmän liikkuvia osia" -periaate säilyy.

Jääkiekkokoodiin **ei koskettu**. Yhteys kulkee kahden kapean rajapinnan kautta:

```
window.BT   — demon tarjoamat toiminnot moduulille
              getBankroll, getBets, addBet, toast, save, isHockey

window.BTF  — moduulin tarjoamat toiminnot demolle ja onclick-käsittelijöille
              reload, renderAllCards, renderPlacedBets, toggleSection,
              setStake, confirmBet, openBetPopup, getSnapshot
```

Muutokset `demo.html`:ään ovat pieniä ja rajattuja: lajilippu, kaksi porttia (`loadData`, `renderRound`), silta, moduulitagi ja Admin-osio. Jääkiekon 23 E2E-testiä toimivat ennallaan.

## Selain ei laske analytiikkaa uudelleen
Kertoimet, devig, malli, edge ja Kelly-panos tulevat valmiina snapshotista. Kortti vain näyttää ne. Yksi totuus: sama luku lokissa, testissä ja ruudulla. Jos selain laskisi edgen uudelleen, kaksi toteutusta erkanisivat väistämättä.

## Kolme osiota

### 📊 Tunnusluvut
Sarjasija, pelatut, pisteet/peli, maalit/peli, päästetyt/peli, koti- ja vieraskeskiarvot, viime ottelut väripalloina (V/T/H), aiemmat kohtaamiset. Jos sarjalle ei ole tunnuslukulähdettä, osio **kertoo sen** eikä näytä tyhjää.

### 📰 Uutiset
Otsikot linkkeineen, tapahtumatyyppi (🤕 loukkaantuminen, 🔄 kokoonpanomuutos), lähde ja varmuusarvio. Yli 0.7 varmuus korostetaan vihreänä. Toistaiseksi lista on tyhjä ja osio selittää mitä sinne on tulossa (tiketti 29) — tyhjä osio ilman selitystä näyttäisi rikkinäiseltä.

### 💎 Analyysi
- **Mallin tila selitettynä**: "Poisson + markkina" / "Vain markkina" ja mitä se tarkoittaa luottamuksen kannalta
- **Poisson · markkina · malli · ero** rinnakkain per kohde — analyysin ydin yhdellä silmäyksellä
- Markkinan kate, sharp-ankkuri, oman mallin paino blendissä
- **Maalimarkkinat**: yli 2.5, molemmat maalin, odotetut maalit (λ), viisi todennäköisintä tulosta — kaikki reiluine kertoimineen
- **Edge ja panossuositus** per kohde: näytetty kerroin, komission jälkeinen hinta (vain jos ne eroavat), toimisto, reilu kerroin, edge ja Kelly-panos euroina
- Kaava auki kirjoitettuna ja kynnykset selitettynä
- Mallin peruste: *"Voimat: tämä + viime kausi (IFK, 19 ottelua) · koti/vierasjakauma estimoitu"*

## Yksityiskohdat jotka ratkaisevat käytettävyyden

**Value-kohteet ensin.** Kortit järjestetään niin että yli 3 %:n edget nousevat ylös, muut aikajärjestyksessä. Käyttäjä näkee löydöt ilman selaamista.

**Lähdebanneri.** Kertoo onko data oikeaa vai esimerkkiä, kuinka vanhaa se on ja mistä se tuli. Yli 4 tuntia vanha merkitään `VANHENTUNUT` — kertoimet ovat liikkuneet. `mock`-data saa `ESIMERKKIDATA`-varoituksen, jotta kukaan ei erehdy lyömään vetoa keksittyihin lukuihin.

**Reilu kerroin näkyvissä.** Mallin todennäköisyys esitetään myös kertoimena (25 % → 4.00). Sitä vasten toimiston hintaa voi verrata suoraan ilman päässälaskua.

**Komissio näkyy vain kun se muuttaa hintaa.** Muuten se on melua. Kerroinnapin vihjeessä lukee pörssin komissioprosentti.

**Panossuositus ponnahduksessa.** Jos malli suosittelee vetoa, Kelly-panos on esitäytettynä ja "Kelly"-pikanappi asettaa sen. Jos ei suosittele, ponnahdus **sanoo sen suoraan**: *"⚠️ Malli: edge −8.6 % — ei panossuositusta tälle kohteelle"*. Työkalu ei hiljaa anna lyödä huonoa vetoa.

**Avoin osio pysyy avoinna** uudelleenrenderöinnin yli (vedon asettaminen ei sulje analyysiä).

## Vedot
Jalkapallovedot merkitään `practice: true, football: true`. `practice` saa demon vetolapun näyttämään manuaaliset ✅/❌-napit ja estää jääkiekkosimulaation koskemasta niihin; `football` erottaa nämä harjoituskohteista, jotta tiketin 32 simulaatio löytää ne. Olemassa olevaa vetolappukoodia ei tarvinnut muuttaa lainkaan.

## Todennettu selaimessa
Playwright-ajo mobiiliviewportissa (420 px): 5 ottelukorttia, 135 kerroinnappia, 15 parasta hintaa (3 per ottelu), kaikki kolme osiota avautuvat, veto vähentää kassasta 100 → 85 €, veto ilmestyy sekä kortille että vetolappuun, **nolla konsolivirhettä**.

Komissiologiikka näkyy ruudulla: Betfairin 6.20 hävisi ⭐:n 1xBetin 6.05:lle, koska 5 %:n komission jälkeen se on 5.94.

## Hyväksymiskriteerit
- [x] Kortti renderöityy `data/today.json`:sta
- [x] Varoitus kun `source === 'mock'` tai data on vanhentunut
- [x] Kertoimet per toimisto pystyriveinä, paras korostettu (komission jälkeen)
- [x] Kolme osiota: Tunnusluvut / Uutiset / Analyysi
- [x] Kelly-panossuositus euroina näkyvissä
- [x] Veto siirtyy vetolappuun ja kassaan
- [x] `demo.html` ei kasvanut: jalkapallokoodi on `public/app/*.js`-moduuleissa, ei build-vaihetta
- [x] 14 uutta E2E-testiä, kaikki 37 vihreänä (23 vanhaa jääkiekkotestiä ennallaan)

## Tiedostot
- `public/app/snapshot.js` — lataus, validointi, muotoilu
- `public/app/football-cards.js` — korttien ja osioiden renderöinti
- `public/app/football.js` — liitos, vedonasetus, `window.BTF`
- `public/demo.html` — lajilippu, portit, silta, moduulitagi, Admin-osio
- `e2e/specs/football.spec.ts`, `e2e/helpers.ts`
