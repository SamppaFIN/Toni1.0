# Tiketti #33: Tarkkuus- ja CLV-mittarit

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** S → M (tulosten haku laajensi)
**Riippuvuudet:** 32, 34

## Mitä käyttäjä voi tehdä
Näkee Seuranta-välilehdellä onko malli oikeasti hyvä: osumatarkkuus, Brier score, log loss, kalibrointi, CLV ja paperitulos — **jokainen markkinaan verrattuna**. Ja kun otos on liian pieni, näkymä sanoo sen isolla eikä alaviitteenä.

## Tämä tiketti vaati oikeat lopputulokset

Ilman niitä tarkkuusmittarit ovat tyhjä kuori. The Odds APIn **`/scores`-pääte** antaa päättyneiden otteluiden tulokset (2 krediittiä per sarja) — testattu ja käytössä:

```
[Results] Veikkausliiga: 1 päättynyttä, 1 uutta — kvootta jäljellä 467
  2026-08-14 15:00  VPS Vaasa 1–3 TPS Turku  (away)
```

Tulokset kerätään **kumulatiivisesti** `public/data/results.json`:iin, koska `/scores` palauttaa vain viimeiset kolme päivää. Kerran menetettyä tulosta ei saa takaisin ilmaistasolla.

## Kaksi periaatetta jotka ohjaavat koko moduulia

### 1. Yksikään luku ei esiinny ilman vertailukohtaa

> malli 0.58 Brier — onko se hyvä? Ei tiedä.
> malli 0.58, markkina 0.61, tasajako 0.667 — nyt tietää.

Absoluuttinen Brier score on tulkitsematon. Siksi jokainen mittari lasketaan myös **markkinalle** ja **arvaukselle** samasta otoksesta, ja UI näyttää ne rinnakkain kolmena sarakkeena. Se kertoo suoraan kumpi on edellä.

### 2. Liian pieni otos sanotaan suoraan

Kolmen ottelun tarkkuusluku näyttää mittarilta muttei ole mittari. `MIN_SAMPLE = 20`, ja sen alle jäävä otos saa keltaisen varoituksen:

> ⚠️ **Otos on liian pieni: 0 / 20 ottelua.** Alla olevat luvut ovat kohinaa. Ne täyttyvät itsestään kun cron kerää dataa kahdesti vuorokaudessa ja otteluita ratkeaa. **Älä tee päätöksiä näiden perusteella.**

Sama varoitus toistuu blend-painon kohdalla vielä tiukempana, koska siellä houkutus toimia on suurin.

## Mittarit

| Mittari | Mitä se kertoo |
|---|---|
| **Osumatarkkuus** | Kuinka usein todennäköisin kohde toteutui. Karkein mittari. |
| **Brier score** | Osumatarkkuus **ja** kalibrointi yhdessä. 90 %:n varmuudella annettu virhe rangaistaan kovemmin kuin 40 %:n. Vaihteluväli 0–2, tasajako 0.667. |
| **Log loss** | Kuin Brier mutta ankarampi varmoista virheistä. Nollatodennäköisyys leikataan, muuten arvo olisi ääretön. |
| **Kalibrointi** | Kun malli sanoo 70 %, tapahtuuko se 70 % ajasta? Viisi koria, ennustettu vs. toteutunut rinnakkain. |
| **CLV** | Voitettiinko sulkeutumislinja. |
| **Paperitulos** | 1 yksikkö jokaiseen liputettuun kohteeseen avaushinnalla. |

### CLV on tärkein — ja se toimii ilman tuloksia

```
CLV = otettu_kerroin / reilu_sulkeutumiskerroin − 1
```

Kymmenen ottelun **tulokset** ovat kohinaa. Kymmenen ottelun **CLV** kertoo jo osuuko malli hinnoitteluvirheisiin, koska se vertaa hintaa hintaan eikä tarvitse ottelutuloksia lainkaan. Systemaattisesti positiivinen CLV → tuotto seuraa perässä. Negatiivinen → voitollinen jakso oli tuuria.

Tämä on syy siihen miksi tiketissä 34 korjattiin historiatiedoston nimeäminen: ilman erillistä avaus- ja sulkeutumishavaintoa CLV:tä ei voisi laskea lainkaan.

## Kriittinen yksityiskohta: ennuste luetaan AVAUSHAVAINNOSTA

Mittarit käyttävät ottelun **ensimmäistä** havaintoa, eivät viimeistä. Sulkeutumislinjaa vasten mittaaminen olisi itsepetosta: malli hyötyisi tiedosta joka syntyi vasta ennusteen jälkeen, ja tarkkuusluku näyttäisi paremmalta kuin se on.

Tämä on testattu eksplisiittisesti (`mittaa AVAUSHAVAINNOSTA eikä sulkeutumisesta`).

## Blend-painon kalibrointi

`w` on mallin ainoa vapaa parametri. Kalibrointi kokeilee kaikki painot välillä 0–1 (askel 0.05) tallennetuista Poisson- ja markkinajakaumista, laskee Brierin jokaiselle ja kertoo minkä data valitsisi.

Testattu kahteen suuntaan: kun Poisson on oikeassa, suositus on > 0.8; kun markkina on oikeassa, < 0.2.

Ja se tärkein: **suositus annetaan aina, mutta pienellä otoksella sen viereen tulee punainen varoitus.** Kahdenkymmenen ottelun perusteella viritetty paino on ylisovitettu — se selittää menneen eikä ennusta tulevaa.

## Simuloitu erotellaan oikeasta

Simuloidut tulokset (`bt_sim_results`) ja simuloidut vedot esitetään **omassa osiossaan**, ja se osio sanoo itse:

> **Nämä luvut eivät kerro mallin laadusta mitään.** Simulaatio arpoo tulokset mallin omista todennäköisyyksistä, joten se on määritelmällisesti "oikeassa" mallin kanssa.

Simuloidut luvut eivät koskaan summaudu oikeiden kanssa. Tiketin 32 `simulated: true` -lippu tekee tämän mahdolliseksi.

## Kvootta
Tuloshaku kustantaa 2 krediittiä per sarja. Päättyneen ottelun tulos ei muutu, joten haku ajetaan **vain iltapäivän ajossa**:

```
kerroinhaku   2 sarjaa × 1 kr × 2 ajoa = 4 kr/vrk
tuloshaku     2 sarjaa × 2 kr × 1 ajo  = 4 kr/vrk
                                        = 8 kr/vrk ≈ 240/kk
```

Ilmaistason raja on 500/kk, joten pelivaraa jää. Ilman tätä rajausta kulutus olisi 360/kk.

## Nykytila: mittarit ovat tyhjät, ja se on oikein

```
Historiatiedostoja: 5 · tuloksia: 1
Otteluita seurannassa: 5 · ratkennut: 0
⚠️  Otos on liian pieni (0 < 20). Luvut ovat kohinaa.
```

Syy on legitiimi: ainoa päättynyt ottelu (VPS–TPS) oli **jo alkanut** kun ensimmäinen snapshot ajettiin, joten se ei ole koskaan ollut ennusteissa. Putki snapshottaa vain tulevia otteluita.

Mittarit täyttyvät itsestään: cron ajaa kahdesti vuorokaudessa, ja jokainen ratkennut ottelu joka oli snapshotissa lisää otokseen. Parin viikon päästä luvut alkavat kertoa jotain.

Koska livedata on tyhjä, **laskenta on todennettu synteettisellä datalla**: 62 yksikkötestiä kattavat Brierin ääriarvot (0 ja 2), log lossin leikkauksen, kalibroinnin ylivarmalla mallilla, CLV:n molempiin suuntiin, paperituloksen ja blend-kalibroinnin kumpaankin suuntaan.

## Hyväksymiskriteerit
- [x] Osumatarkkuus, Brier, log loss, kalibrointi, CLV, ROI laskettu ja testattu
- [x] **Jokainen mittari markkinaan ja arvaukseen verrattuna** — absoluuttinen luku ei esiinny yksin
- [x] Seuranta-välilehti näyttää mittarit
- [x] Sim vs. real eroteltu näkyvästi, simuloitu-osio sanoo ettei se mittaa mallia
- [x] Blend-painon kalibrointi Brier scoren perusteella, varoitus pienestä otoksesta
- [x] Ennuste luetaan avaushavainnosta, ei sulkeutumislinjasta
- [x] Oikeat lopputulokset haetaan `/scores`-päätteestä, kumulatiivisesti
- [x] Kvootta 240/kk (rajattu tuloshaku), ilmaistaso 500/kk
- [x] 62 uutta yksikkötestiä

## Ajo
```bash
npm run results         # hae päättyneiden otteluiden tulokset
npm run metrics         # laske mittarit → public/data/metrics.json
npm run model:scoring   # demonstraatio: Brier ja CLV eri tilanteissa
```

## Tiedostot
- `src/analyze/scoring.ts` — mittarit puhtaina funktioina
- `src/ingest/results.ts` — tulosten haku ja kumulatiivinen tallennus
- `src/publish/metrics.ts` — historian luku, aikajanat, mittarien kokoaminen
- `src/ingest/odds-football.ts` — jaettu `buildMatchId()` jotta tulokset täsmäävät ennusteisiin
- `public/app/football-metrics.js` — mittarinäkymä
- `.github/workflows/football-snapshot.yml` — tulos- ja mittarivaiheet
- `src/__tests__/scoring.test.ts`, `metrics.test.ts`
