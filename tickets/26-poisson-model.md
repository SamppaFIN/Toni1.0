# Tiketti #26: Poisson-malli jalkapallolle

**Epic:** ⚽ Football Foundation — Jalkapalloperusta
**Status:** ✅ done
**Effort:** M
**Riippuvuudet:** —

## Mitä käyttäjä voi tehdä
Näkee jokaiselle ottelulle mallin oman arvion: odotetut maalimäärät (λ), 1X2-todennäköisyydet, yli/alle 2.5 maalia, molemmat maalintekijöinä (BTTS) ja todennäköisimmät tarkat tulokset — kaikki samasta laskennasta.

## Miksi Elo ei riitä jalkapalloon
Elo (`src/analyze/predict.ts`) antaa vain 1X2:n ja arvaa tasapelin kiinteällä kertoimella. Jalkapallossa arvo asuu maalimarkkinoissa, joita Elo ei tuota lainkaan. Poisson tuottaa koko tulosjakauman yhdestä λ-parista, joten O/U, BTTS ja tarkat tulokset syntyvät samasta mallista ilman erillisiä viritysparametreja.

## Miten toteutettu
`src/analyze/poisson.ts`:

```
attack  = maalit tehty / peli   ÷ sarjan keskiarvo
defense = maalit päästetty / peli ÷ sarjan keskiarvo
λ_koti   = attack_koti × defense_vieras × sarjan koti-ka
λ_vieras = attack_vieras × defense_koti × sarjan vieras-ka
```

- `poissonPmf()` — laskee logaritmeissa, joten `k!` ei ylivuoda suurilla k-arvoilla
- `scoreMatrix()` — 9 × 9 tulosmatriisi, normalisoitu summaan 1.0
- `outcomeProbs()` / `overProb()` / `bttsProb()` / `topScores()` — markkinat matriisista
- `predictPoisson()` — koko ennuste yhdellä kutsulla
- `adjustLambda()` — suhteellinen λ-korjaus uutistiedosta

### Dixon–Coles-korjaus
Puhdas Poisson aliarvioi matalat tulokset, koska se olettaa maalit toisistaan riippumattomiksi. τ-kerroin (`rho = -0.05`) nostaa 0-0:n ja 1-1:n todennäköisyyttä ja laskee 1-0:n ja 0-1:n. Matriisi normalisoidaan korjauksen jälkeen uudelleen.

### Kutistus otoskoon mukaan — tärkein yksittäinen lisäys
Ensimmäinen ajo antoi Arsenal–Chelsea-ottelulle 67 % kotivoittotodennäköisyyden ja **10,5 %:n edgen**. Se ei ollut löydös vaan otantavirhe: kolmen ottelun maalikeskiarvo ei ole voimaestimaatti.

```
paino = pelatut / (pelatut + k),   k = 6
voima = 1 + (raakavoima − 1) × paino
```

Kutistuksen jälkeen sama ottelu antaa 50,5 % ja edgen −0,1 % — eli oikean vastauksen: 1,9 %:n katteella ja kolmen ottelun datalla siinä ei ole arvoa. Ilman tätä malli tuottaisi alkukaudesta pelkkiä vääriä positiivisia.

## Hyväksymiskriteerit
- [x] λ-laskenta joukkuevoimista ja sarjan keskiarvoista
- [x] Tulosmatriisi summautuu ykköseen — myös Dixon–Coles-korjauksen jälkeen
- [x] 1X2 + yli/alle 2.5 + BTTS + top-5 tarkat tulokset
- [x] Dixon–Coles-korjaus todennettu: 0-0 ja 1-1 nousevat, 1-0 ja 0-1 laskevat
- [x] Kutistus otoskoon mukaan + testi joka todentaa alkukauden vääriä positiivisia vastaan
- [x] 34 yksikkötestiä, mukana käsin laskettu vertailuarvo (λ=1.5, k=2 → 0.25102)
- [x] Realistisuustarkistukset: tasavahvoilla tasapeli 22–30 %, yli 2.5 keskitasolla 44–58 %

## Ajo
```bash
npm run model:poisson
```

## Tiedostot
- `src/analyze/poisson.ts`
- `src/__tests__/poisson.test.ts`
