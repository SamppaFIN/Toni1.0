# Tiketti #27: Markkinakonsensus + sharp-ankkuri + blend

**Epic:** ⚽ Football Foundation — Jalkapalloperusta
**Status:** ✅ done
**Effort:** S
**Riippuvuudet:** 26

## Mitä käyttäjä voi tehdä
Näkee ottelukortilla kolme lukua rinnakkain: mitä oma malli sanoo, mitä markkina sanoo, ja mikä on näiden yhdistelmä jota vasten edge lasketaan. Mikään ei ole mustaa laatikkoa.

## Miksi blendi eikä pelkkä oma malli
Kymmenen ottelun Poisson-malli **häviää** markkinalle. Pinnaclen hintaan on puskettu satoja miljoonia euroja informaatiota: kokoonpanot, loukkaantumiset, sää, motivaatio, rahavirrat. Jos malli poikkeaa markkinasta 15 prosenttiyksikköä, todennäköisempi selitys on että malli on väärässä.

Blendi antaa mallille oman äänen ilman että se kuvittelee tietävänsä enemmän kuin markkina:

```
model_prob = w × poisson + (1 − w) × sharp,   w = 0.35
```

`w` on se **yksi numero** jota kalibroidaan toteutuneita tuloksia vasten (Brier score, tiketti 33). `w = 1` → luota pelkkään omaan malliin ja todennäköisesti häviä. `w = 0` → seuraa markkinaa, älä koskaan löydä edgeä muttei myöskään häviä.

## Miten toteutettu
`src/analyze/consensus.ts`:

- **`consensusProbs()`** — devigaa jokaisen toimiston **erikseen** ja ottaa mediaanin.
  Järjestys on olennainen: jos ottaisimme ensin mediaanikertoimen ja devigaisimme sen, sekoittaisimme eri toimistojen katerakenteita keskenään. Mediaani on myös robusti yksittäiselle virheelliselle kertoimelle — keskiarvo romahtaisi.
- **`sharpAnchor()`** — valitsee tarkimman saatavilla olevan lähteen `SHARP_PRIORITY`-järjestyksessä (Pinnacle → Betfair → Matchbook → Smarkets), muuten putoaa koko markkinan mediaaniin. Tunnistaa toimiston avaimen etuliitteestä, joten `pinnacle` ja `pinnacle_eu` osuvat molemmat.
- **`blendProbs()`** — painotettu yhdistelmä, `w` rajattu välille 0–1, tulos normalisoitu.
- **`normalize()`** — nollasummalla tasajako eikä NaN.

## Hyväksymiskriteerit
- [x] Pinnacle-devig valitaan sharp-ankkuriksi kun saatavilla
- [x] Mediaanikonsensus varalähteenä kun sharp-toimistoa ei ole
- [x] Blend-paino `w` konfiguroitava (`MODEL_BLEND_WEIGHT`, oletus 0.35)
- [x] Kaikki todennäköisyydet summautuvat ykköseen
- [x] 19 yksikkötestiä, mukana käsin laskettu blendi (0.35 × 0.60 + 0.65 × 0.40 = 0.47)
- [x] Mediaanin robustius poikkeavalle kertoimelle todennettu testillä

## Ajo
```bash
npm run model:consensus
```

## Tiedostot
- `src/analyze/consensus.ts`
- `src/__tests__/consensus.test.ts`
