# Tiketti #24: Tunnusluvut ja joukkuevoimat

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** M
**Riippuvuudet:** 23, 26

## Mitä käyttäjä voi tehdä
Näkee jokaisen ottelun kohdalla joukkueiden tunnusluvut — sarjasija, pelatut, maalit tehty/päästetty per peli, pisteet per peli — ja **Poisson-malli aktivoituu** näiden pohjalta: λ-arvot, yli/alle 2.5, BTTS ja todennäköisimmät tarkat tulokset.

## Miten umpikuja ratkesi

Lähtötilanne oli este: kummallakaan ilmaisella rajapinnalla ei saanut nykyisen kauden tunnuslukuja Veikkausliigasta.

| Lähde | Ongelma |
|---|---|
| API-Football (ilmaistaso) | `"Free plans do not have access to this season, try from 2022 to 2024."` |
| football-data.org (ilmaistaso) | 13 sarjaa, Veikkausliiga ei niiden joukossa |
| veikkausliiga.com | Node fetch kaatuu: `UNABLE_TO_VERIFY_LEAF_SIGNATURE` — sivu ei tarjoa välisertifikaattia. Selain ja curl selviävät hakemalla puuttuvan sertin AIA-kentästä, Node ei tee sitä. **TLS-tarkistuksen ohitusta ei tehty.** |

Ratkaisu on **Wikipedia**: MediaWiki-API on julkinen ja uudelleenkäyttöä varten, TLS on kunnossa, ja sarjataulukot ovat vakiomuotoisia (`Pos/Team/Pld/W/D/L/GF/GA/Pts`) **kaikissa** sarjoissa — sama parsija kattaa siis minkä tahansa sarjan, ei vain Veikkausliigan.

Luvut ristiintarkistettiin veikkausliiga.comia vasten 14.8.2026: **identtiset** (KuPS 19 peliä, 34−17, 40 pistettä).

## Kolme toteutettua vaihtoehtoa

### A — football-data.org (`stats-footballdata.ts`)
Valioliiga, Championship, La Liga, Serie A, Bundesliga, Ligue 1. API antaa **TOTAL, HOME ja AWAY** -taulukot, joten koti/vierassplitit ja sarjan koti/vieras-maalikeskiarvot ovat mitattuja eikä estimoituja. Myös `form` tulee suoraan ("W,W,D" → "WWD") ja `shortName`/`tla` aliaksiksi täsmäytystä varten.

### B — Wikipedia (`stats-wikipedia.ts`)
Veikkausliiga ja varalähde muille. Sarjataulukko ei erittele koti- ja vieraspelejä, joten sarjan maalikeskiarvo jaetaan 55/45 kotietuoletuksella ja `splitsEstimated: true` merkitään snapshotiin — estimaatti ei esiinny mitattuna.

### C — Kausiblendi (`analyze/strength.ts`)
Kauden alussa nykyinen data on hyödytöntä. `shrinkStrength()` kutistaa voiman kohti sarjan keskitasoa 1.0, mikä on turvallista muttei informatiivista: se sanoo "en tiedä mitään", vaikka tiedämme viime kauden.

```
voima = w × tämä_kausi + (1 − w) × regressoitu_viime_kausi,   w = pelatut/(pelatut+k)
```

Viime kauden voimaa vaimennetaan `SEASON_REGRESSION = 0.75` -kertoimella ennen käyttöä, koska edellinen kausi on eri joukkue: pelaajat ja valmentaja vaihtuvat, nousija kohtaa kovempaa vastusta.

Vaikutus vahvalle joukkueelle (71−27 / 38 ottelua viime kaudelta):

| Pelatut | Hyökkäysvoima priorilla | Ilman prioria | Peruste |
|---|---|---|---|
| 0 | 1.251 | 1.000 | viime kausi |
| 3 | 1.310 | 1.143 | tämä + viime kausi |
| 6 | 1.280 | 1.155 | tämä + viime kausi (50 %) |
| 24 | 1.345 | — | tämä + viime kausi (80 %) |
| 38 | 1.339 | — | tämä kausi (86 %) |

Ilman prioria malli olisi kauden ensimmäiset ~6 kierrosta käytännössä markkinan kopio.

## Joukkueiden täsmäytys (`team-match.ts`)
Kerroinlähde ja tilastolähde eivät kirjoita nimiä samalla tavalla. Aidot parit tästä projektista:

```
"KuPS Kuopio"     ↔ "KuPS"          "Jaro"             ↔ "FF Jaro"
"FC Inter Turku"  ↔ "Inter Turku"   "Manchester City"  ↔ "Man City" / "Manchester City FC"
```

Täsmäytys: normalisoi (diakriitit, välimerkit) → pudota seuraetuliitteet (FC, AC, IF, IFK, FF…) → vaadi että toisen nimen sanajoukko on **toisen osajoukko**. Pelkkä leikkaus ei riitä: `"FC Inter Turku"` ja `"TPS Turku"` jakavat sanan *turku* olematta sama joukkue.

**Epäselvä täsmäytys palauttaa null.** Väärän joukkueen arvaaminen laskisi koko analyysin vääristä luvuista — parempi pudota market-only-tilaan näkyvän varoituksen kanssa.

Kaikki 12 Veikkausliigan joukkuetta täsmäytyvät oikein (testattu eksplisiittisesti aidoilla nimillä molemmista lähteistä).

## Rakenteellinen tarkistus joka pelastaa hiljaiselta virheeltä
Sarjataulukossa pätee aina: **ΣTM = ΣPM** (jokainen maali on jonkun tekemä ja jonkun päästämä) ja **ΣV = ΣH** (jokainen voitto on jonkun häviö), ja jokaisella joukkueella V+T+H = pelatut.

Jos sivun sarakejärjestys muuttuu, parsija lukisi väärät sarakkeet ja luvut menisivät läpi hiljaa — koko analyysi laskettaisiin roskasta. `assertTableBalances()` heittää selkeän virheen, ja kutsuja putoaa market-only-tilaan. Tämä invariantti löysi virheen jo omasta testifixtuuristani.

## Degradaatio on suunniteltu, ei sattuma
```
tilastolähde puuttuu      → market-only, loki kertoo miksi
haku epäonnistuu          → market-only, virhe lokiin, putki jatkaa
joukkuetta ei täsmätty    → market-only + varoitus joukkueen nimellä
edellistä kautta ei saada → pelkkä kutistus keskitasoon
```
Hauras lähde ei koskaan kaada koko analyysiä: kertoimet ja hintavertailu toimivat aina.

## Välimuisti (`cache.ts`)
Sarjataulukko muuttuu vain ottelupäivinä. Vastaukset kätketään `.cache/`-hakemistoon (gitignoressa) 12 tunniksi. Suojaa football-data.orgin 10 pyyntöä/min -rajalta ja pitää kehityssyklin nopeana. `CACHE_DISABLED=1` ohittaa.

## Todennettu oikealla datalla
```
[Stats] Veikkausliiga 2026: 12 joukkuetta, 114 ottelua pelattu, priori kaudelta 2025 (Wikipedia)

⚫ IFK Mariehamn vs SJK Seinäjoki — malli: poisson+sharp-blend
   λ 0.82 − 2.07 | yli 2.5: 55.1% | BTTS: 49.2% | todennäköisin 0-2
   Poisson  13.3% / 20.8% / 66.0%
   markkina 15.8% / 19.7% / 64.5%     ← itsenäinen malli on lähellä markkinaa
   tunnusluvut  IFK: sija 12, 0.47−2.16 maalia/peli | SJK: sija 10, 1.26−1.53
```

Että maalidatasta rakennettu malli osuu 2–3 prosenttiyksikön sisään markkinasta on paras saatavilla oleva järkevyystarkistus: se kertoo että malli ei ole rikki.

## Hyväksymiskriteerit
- [x] Päivän ottelut ja tunnusluvut haettu (Veikkausliiga: Wikipedia, PL/ELC ym.: football-data.org)
- [x] Tunnusluvut: sija, pelatut, TM/PM per peli, PPG, form (kun lähde tarjoaa), koti/vierassplitit (mitattuna football-data.orgista)
- [x] Joukkuevoimat nykyisestä + edellisestä kaudesta — kauden alun otantaongelma ratkaistu
- [x] Sarjan maalikeskiarvot lasketaan datasta, ei kovakoodattuna
- [x] Joukkueiden täsmäytys testattu kaikilla 12 Veikkausliigan joukkueella
- [x] Rakenteellinen tarkistus estää väärin luettujen sarakkeiden läpimenon
- [x] Välimuisti 12 h, gitignoressa, ohitettavissa
- [x] Degradaatio market-only-tilaan jokaisessa vikatilanteessa, aina lokitettuna
- [x] 59 uutta yksikkötestiä (team-match 19, strength 19, stats-parse 21)
- [x] Mallin peruste näkyy snapshotissa: `"Voimat: tämä + viime kausi (HJK, 19 ottelua) · koti/vierasjakauma estimoitu"`

## Puuttuu vielä (tiketti 29)
- H2H-otteluhistoria (`h2h: []` toistaiseksi)
- Lepopäivät (`rest_days: null`)
- Loukkaantumiset — API-Footballin `/injuries` ei ole käytettävissä ilmaistasolla, joten nämä tulevat uutis-NLP:n kautta

## Ajo
```bash
npm run snapshot:live                       # koko putki
npx tsx src/ingest/stats-wikipedia.ts 2026  # Veikkausliigan taulukko
npx tsx src/ingest/stats-footballdata.ts PL # Valioliigan taulukko
npx tsx src/analyze/strength.ts             # kausiblendin demonstraatio
```

## Tiedostot
- `src/ingest/stats.ts` — rekisteri, sarja → adapteri
- `src/ingest/stats-wikipedia.ts` — Wikipedia-adapteri (B)
- `src/ingest/stats-footballdata.ts` — football-data.org-adapteri (A)
- `src/ingest/team-match.ts` — nimien täsmäytys
- `src/ingest/cache.ts` — välimuisti
- `src/analyze/strength.ts` — kausiblendi (C)
- `src/publish/live-snapshot.ts` — kytkentä putkeen
- `src/__tests__/team-match.test.ts`, `strength.test.ts`, `stats-parse.test.ts`
