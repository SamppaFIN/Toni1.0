# Tiketti #28: Kelly-panostuslogiikka

**Epic:** ⚽ Football Foundation — Jalkapalloperusta
**Status:** ✅ done
**Effort:** S
**Riippuvuudet:** 27

## Mitä käyttäjä voi tehdä
Näkee jokaiselle value-kohteelle konkreettisen panossuosituksen euroina oman kassansa mukaan — ei pelkkää "tässä on 5 % edge, keksi itse paljonko panostat".

## Kaava
```
f* = (b × p − q) / b        b = kerroin − 1,  q = 1 − p
panos = min(f* × 0.25, 0.02) × kassa
```

## Miksi murto-Kelly eikä täysi
Täysi Kelly maksimoi kassan logaritmisen kasvun **olettaen että `model_prob` on täsmälleen oikein**. Meidän malli on Poisson-blendi kymmenen ottelun datasta — siinä on virhettä. Kun `p` on yliarvioitu, täysi Kelly ylipanostaa rajusti ja kassa heiluu tavalla joka ajaa käyttäjän lopettamaan ennen kuin edge realisoituu.

Esimerkki miksi katto tarvitaan: `p = 0.90`, kerroin `1.50` → täysi Kelly on **70 % kassasta**. Murto-Kelly 25 % antaisi silti 17,5 %. 2 %:n katto tuo sen 2 %:iin. Yksi virheellinen 90 %:n arvio ei silloin kaada kassaa.

## Miten toteutettu
`src/engine/kelly.ts`:
- `kellyStake(modelProb, odds, bankroll, options)` → `{ full_fraction, fraction, stake, capped }`
- Palauttaa nollan aina kun vetoa ei pitäisi lyödä: `f* ≤ 0`, kerroin ≤ 1, kassa ≤ 0, NaN, Infinity, `p ∉ (0,1)`
- `full_fraction` näkyy palautuksessa informatiivisena — käyttäjä näkee mitä Kelly *halusi* ja mitä turvarajat siitä jättivät
- `capped`-lippu kertoo että katto osui
- `edgeOf()` mukavuusfunktio jotta ottelukortti saa edgen ja panoksen yhdellä kutsulla

## Yhteispeli value-kynnysten kanssa
Kelly antaa positiivisen panoksen heti kun `edge > 0`. Projektin value-kynnys on kuitenkin 3 %, koska sen alle jäävä edge on mallin virherajojen sisällä. `buildAnalysisView()` (tiketti 23) portittaa panossuosituksen kynnykseen: jos lippu on `none`, panos on 0. Näin lippu ja panossuositus eivät koskaan ole eri mieltä.

## Hyväksymiskriteerit
- [x] `f* = (bp − q)/b` toteutettu ja todennettu käsin lasketulla arvolla (p=0.55, kerroin 2.0 → f* = 0.10)
- [x] Murto-Kelly 25 % konfiguroitavana (`KELLY_FRACTION`)
- [x] Kova katto 2 % kassasta (`MAX_STAKE_FRACTION`), `capped`-lippu kertoo kun se osuu
- [x] `edge ≤ 0` → panos 0, ei koskaan negatiivinen panos
- [x] Kelvottomat syötteet (NaN, Infinity, kerroin ≤ 1, kassa ≤ 0) → panos 0
- [x] Panos skaalautuu lineaarisesti kassan mukaan, pyöristetty sentteihin
- [x] 14 yksikkötestiä, mukana ekvivalenssitesti: `stake > 0` täsmälleen silloin kun `edge > 0`

## Ajo
```bash
npm run model:kelly
```

## Tiedostot
- `src/engine/kelly.ts`
- `src/__tests__/kelly.test.ts`
