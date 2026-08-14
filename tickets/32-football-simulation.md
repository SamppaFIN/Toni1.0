# Tiketti #32: Jalkapallon päiväsimulaatio

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** L
**Riippuvuudet:** 26, 30

## Mitä käyttäjä voi tehdä
Painaa Seuranta-välilehdellä **▶️ Käynnistä pelipäivän simulaatio** ja katsoo päivän ottelut läpi 20 sekunnissa: maalit minuutteineen, keltaiset ja punaiset kortit, kulmat ja xG. Vedot ratkeavat, pikavetoja voi lyödä kesken ottelun, ja lopussa kierrosraportti vertaa ennustetta toteumaan.

## Keskeinen suunnitteluratkaisu: simulaatio noudattaa kortin lukuja

Simulaatio **arpoo lopputuloksen kortilla näkyvistä mallin todennäköisyyksistä**, ei λ-arvoista suoraan.

Miksi tämä on tärkeää: kortti näyttää blendatun mallin (Poisson + markkina), esim. 74/16/10. Jos simulaatio arpoisi maalit pelkästä λ:sta, pitkällä aikavälillä kotivoittoja tulisi *Poissonin* osuudella — eikä sillä osuudella jonka kortti lupasi. Käyttäjä ei voisi luottaa kumpaankaan lukuun, ja ristiriita olisi hiljainen.

Toteutus kahdessa vaiheessa:
1. Arvo lopputulos (`home`/`draw`/`away`) mallin todennäköisyyksillä
2. Arvo maalimäärät λ:sta **ehdolla** että lopputulos täsmää (hylkäysotanta, yläraja 600 kierrosta + varasuunnitelma)

**Tämä väite on testattu tilastollisesti**, ei vain kommentoitu. 4000 ajoa per skenaario, kolme skenaariota:

| Skenaario | Malli sanoo | Simulaatio tuottaa |
|---|---|---|
| Selvä kotisuosikki | 74 / 16 / 10 | ±3 prosenttiyksikön sisällä |
| Tasainen ottelu | 38 / 30 / 32 | ±3 pp |
| Altavastaaja suosikkina | 8 / 14 / 78 | ±3 pp, eikä 8 % katoa |

Kolmas testi on siellä siksi, että hylkäysotanta voisi epäonnistua epätodennäköisillä lopputuloksilla ja vääristää jakaumaa hiljaa.

## Simuloitu ja oikea pidetään erillään

```
bt_sim_results   ← simuloidut tulokset, jokainen simulated: true
bt_real_results  ← oikeat lopputulokset (ei vielä lähdettä)
```

Myös vetohistorian jalkapallovedot saavat `simulated: true`. Ilman tätä erottelua tiketin 33 tarkkuustilasto ja ROI mittaisivat **arpanoppaa** eikä mallia — ja sellainen luku on pahempi kuin ei lukua lainkaan, koska siihen luotettaisiin.

`SIMULOITU`-merkki näkyy joka kortissa, kierrosraportissa ja Seuranta-näkymän otsikossa. Raportti sanoo suoraan: *"Nämä ovat arvottuja tuloksia, eivät oikeita. Ne eivät kirjaudu mallin tarkkuustilastoon."*

## Ei keksittyjä maalintekijöitä

Jääkiekkodemo arpoo maalintekijöiden nimet mock-listalta. Jalkapallopuolella sitä **ei tehdä**: kokoonpanodataa ei ole ilmaistasolla, ja tekaistu *"Ville Virtanen 34'"* oikean joukkueen nimen vieressä näyttäisi oikealta datalta. Maali kirjataan joukkueelle ja minuutille: `⚽ 34' HJK`.

Sama periaate on ohjannut koko projektia: estimoidut luvut merkitään estimoiduiksi, puuttuvat luvut jätetään puuttumaan.

## Mitä simulaatio tuottaa

| | |
|---|---|
| Kesto | 90 min → 20 s, 200 ms tikki (100 tikkiä) |
| Maaliminuutit | lievä painotus 2. puoliajalle (55 %) — kuten oikeissa otteluissa |
| Lisäajat | 1. puoliaika +1–3 min, 2. puoliaika +2–5 min |
| Kortit | keltaisia 2–5 per ottelu, punainen 22 %:n todennäköisyydellä |
| Kulmat ja xG | korreloivat maalimäärään muttei ole sama asia |
| Sivumarkkinat | yli/alle 2.5 ja BTTS toteuma näkyvissä — mallin arvion voi tarkistaa |

Realistisuus testattu: keskimaalimäärä 2.0–3.4, nollapelejä ja 4+ maalin otteluita esiintyy molempia, kulmia enemmän kuin maaleja, korkein tulos alle 13 maalia.

## Vedot

**1X2-vedot** ratkeavat lopputuloksella. Ratkaisulaskenta todennettu asettamalla veto kaikkiin kolmeen kohteeseen samasta ottelusta: tasan yksi voittaa, ja kassa 70 € → 84,50 € = 70 + 10 × 1.45. Oikein.

**Pikaveto "seuraava maali"** 5 € @ 1.90 ratkeaa heti maalin tullessa, kesken simulaation.

**Kierrosraportti** näyttää per veto: odotus (mitä lyötiin), toteuma (mikä lopputulos oli) ja tulos euroina — sama rakenne kuin jääkiekkodemon raportissa, joka oli sen paras osa.

Mallin osumatarkkuus näkyy kierrokselta, mutta **varauksen kanssa**: *"yhden kierroksen otos ei kerro mallin laadusta mitään"*. Viisi ottelua on viisi kolikonheittoa.

## Arkkitehtuuri
Jääkiekkokoodiin ei koskettu. Seuranta-välilehti on nyt molemmilla lajeilla, ja `renderTracker()` sekä `runSimulation()` haarautuvat lajilipun mukaan. Uusi silta `window.BTT` moduulille, ja `window.BT.settleFootballBet()` vetojen ratkaisuun.

Jalkapallon simulaatio on kahdessa moduulissa: `football-sim.js` (laskenta ja renderöinti) ja `football-tracker.js` (näkymä, vedot, tallennus).

## Hyväksymiskriteerit
- [x] Maalit Poisson-mallista, keskimäärä jalkapallolle realistinen (2.0–3.4)
- [x] **Simulaation jakauma vastaa kortin mallia** — testattu 4000 ajolla, ±3 pp
- [x] 90 min → 20 s, puoliaika ja lisäajat
- [x] Maalit minuutteineen, keltaiset ja punaiset kortit, kulmat, xG
- [x] Ratkaisee 1X2-vedot ja pikavedon; O/U 2.5 ja BTTS toteuma näkyvissä
- [x] `SIMULOITU`-merkki jokaisessa tuloksessa ja raportissa
- [x] Simuloidut ja oikeat tulokset eri avaimissa, `simulated: true` -lipulla
- [x] Ei keksittyjä pelaajanimiä
- [x] 16 uutta yksikkötestiä (tilastollinen todennus) + 9 uutta E2E-testiä

## Ajo
```bash
npm run demo   # → Seuranta-välilehti → ▶️ Käynnistä pelipäivän simulaatio
```

## Tiedostot
- `public/app/football-sim.js` — otteluiden simulointi, ajastus, renderöinti
- `public/app/football-tracker.js` — Seuranta-näkymä, vedot, tallennus
- `public/demo.html` — lajihaarautus, `settleFootballBet`-silta
- `src/__tests__/football-sim.test.ts` — tilastollinen todennus
- `e2e/specs/football-sim.spec.ts` — 9 E2E-testiä
