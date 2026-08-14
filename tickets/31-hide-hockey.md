# Tiketti #31: Jääkiekon piilotus lajilipun taakse

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** S
**Riippuvuudet:** 30

## Mitä käyttäjä voi tehdä
Avaa demon ja näkee jalkapallon: oikeat kertoimet, tunnusluvut, analyysi. Jääkiekkokierrokset eivät ole tiellä. Jos jääkiekkodemo halutaan takaisin, Admin-välilehden napista se palaa kokonaisena.

## Toteutus
```js
let SPORT = localStorage.getItem('bt_sport') || 'football';
function isHockey(){ return SPORT === 'hockey' }
```

Neljä porttia:

| Kohta | Käyttäytyminen jalkapallotilassa |
|---|---|
| `loadData()` | Palaa heti, ei hae jääkiekkodataa |
| `renderRound()` | Delegoi `window.BTF.renderAllCards()`:iin |
| `resetSimulation()` | Ei palauta FALLBACK-jääkiekkodataa |
| Välilehdet | `[data-sport="hockey"]` piiloon (Seuranta, Joukkueet) |

Otsikko vaihtuu 🏒 → ⚽ ja badge kertoo tilan. Lajinvaihto tekee koko sivun uudelleenlatauksen — osittainen vaihto jättäisi vanhaa tilaa roikkumaan, ja lajinvaihto ei ole niin tiheä operaatio että lataus haittaisi.

## Tärkein yksityiskohta: keksityt kertoimet eivät saa sekoittua oikeisiin

`genOddsForBookmaker()` (demo.html:220) **keksii** kertoimia Elo-lukemista jääkiekkodemolle. Sitä kutsuu `syncBookmakerOdds()`, joka ajetaan `loadData()`:n lopussa, `advanceRound()`:ssa ja `resetSimulation()`:ssa.

Jos se pääsisi ajamaan jalkapallotilassa, keksityt ja oikeat kertoimet olisivat samassa listassa **erottamattomina**. Käyttäjä lyö vetoa lukuun jota mikään toimisto ei tarjoa.

Portit `loadData()`:ssa ja `resetSimulation()`:ssa estävät tämän. `advanceRound()` on saavutettavissa vain jääkiekkosimulaatiosta, joka on itsessään lipun takana.

E2E-testi todistaa asian vahvimmalla saatavilla olevalla tavalla: se hakee `data/today.json`:n ja varmistaa että **jokainen ruudulla näkyvä toimiston nimi löytyy snapshotista**. Keksitty rivi ei läpäisisi.

## Mitään ei poistettu
Koko jääkiekkokoodi — simulaatio, Elo-päivitykset, paine-mekaniikka, kierrosraportti, pikavedot, PDO-analyysi — on paikallaan ja toimii. Ainoa muutos on että se on lipun takana.

## E2E-testit päivitettiin, ei skipattu
Handover kirjasi opetuksen: *"E2E-testien päivitys jäi jälkeen — kun UI:n rakenne muuttui, testit hajosivat."* Skipatut testit lakastuvat hiljaa.

`e2e/helpers.ts` tarjoaa `useHockey(page)` / `useFootball(page)` / `resetState(page)`. Nämä käyttävät `addInitScript`:iä, joka ajetaan **ennen sivun omia skriptejä** — ainoa oikea paikka, koska demo lukee lipun heti latautuessaan.

Neljään jääkiekkospecciin lisättiin `beforeEach`, joka asettaa lipun. Kaikki 23 vanhaa testiä läpäisevät ennallaan.

`resetState()` korjasi samalla piilevän ongelman: kassa ja vedot säilyvät localStoragessa, joten ilman nollausta testit vuotavat toisiinsa rinnakkaisajossa.

## Hyväksymiskriteerit
- [x] Oletuksena vain jalkapallo näkyvissä (`bt_sport = 'football'`)
- [x] Admin-toggle palauttaa jääkiekkokierrokset kokonaisena
- [x] `genOddsForBookmaker()` ei aja jalkapallotilassa — todennettu E2E-testillä snapshotia vasten
- [x] Jääkiekon E2E-testit päivitetty asettamaan lippu setupissa, ei skippausta
- [x] Mitään jääkiekkokoodia ei poistettu
- [x] 37/37 E2E-testiä vihreänä

## Tiedostot
- `public/demo.html` — lajilippu, portit, `applySportVisibility()`, `setSport()`, Admin-osio
- `e2e/helpers.ts` — lajitilan asetus testeille
- `e2e/specs/{predictions,teams,value-flags,practice}.spec.ts` — `beforeEach` lipulle
