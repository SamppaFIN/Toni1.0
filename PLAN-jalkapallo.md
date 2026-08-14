# 📋 Toteutussuunnitelma — Vaihe 2: Oikeat kertoimet + jalkapalloanalytiikka

> **Laatija:** Claude Opus 5 (Claude Code) · **Päivä:** 2026-08-14
> **Lähtötila:** claude.md tiketit 1–22 `done`. Demo toimii mock-datalla, jääkiekko pääkohteena, jalkapallo vain 3 kovakoodattua "harjoituskorttia".
> **Tavoite:** Jalkapallo pääkohteeksi oikeilla kertoimilla oikeista toimistoista, per-ottelu uutiset + tunnusluvut + vedonlyöntianalytiikka, päiväsimulaatio joka simuloi päivän ottelutulokset. Jääkiekko piiloon lipun taakse.

---

## ✅ Tilanne 2026-08-14: vaihe A valmis

| Tiketti | Tila |
|---|---|
| 23 — `today.json`-skeema + snapshot-julkaisu | ✅ done |
| 24 — Tunnusluvut ja joukkuevoimat (A+B+C) | ✅ done |
| 25 — Jalkapallokertoimien haku (The Odds API) | ✅ done |
| 26 — Poisson-malli (+ kutistus otoskoon mukaan) | ✅ done |
| 27 — Markkinakonsensus + sharp-ankkuri + blend | ✅ done |
| 28 — Kelly-panostuslogiikka | ✅ done |
| 30 — UI: jalkapallo-ottelukortti | ✅ done |
| 31 — Jääkiekon piilotus lajilipun taakse | ✅ done |
| 29, 32, 33, 34 | `todo` — seuraavaksi simulaatio (32) |

**Testit:** 234 yksikkötestiä + 37 E2E-testiä, kaikki vihreänä. Typecheck puhdas.

**Käyttöliittymä on käytössä.** `npm run demo` → http://localhost:3333/demo.html näyttää päivän jalkapallo-ottelut oikeilla kertoimilla, tunnusluvut, analyysin ja Kelly-panossuositukset. Jääkiekko on lipun takana Admin-välilehdellä.

**Koko putki toimii oikealla datalla:**
```
npm run snapshot:live

[Odds]  Veikkausliiga: 6 ottelua — kvootta jäljellä 489
[Stats] Veikkausliiga 2026: 12 joukkuetta, 114 ottelua pelattu, priori kaudelta 2025 (Wikipedia)
✓ 5 ottelua kirjoitettu  ·  malli: poisson+sharp-blend  ·  tunnusluvut 5/5
```

**Avaimet:** The Odds API ✅ · football-data.org ✅ · API-Football ⚠️ avain toimii mutta ilmaistaso kattaa vain kaudet 2022–2024 → ei käytössä.

**Neljä virhettä korjattu ennen kuin ne pääsivät tuotantoon:**
1. Alkukauden otantavirhe tuotti 10,5 %:n haamuedgen → kutistus otoskoon mukaan (kohta 3)
2. Kelly ja value-kynnys olivat eri mieltä → panossuositus vain kynnyksen ylittäville (kohta 3)
3. Pörssin komissio puuttui → 8,1 %:n edge oli todellisuudessa 4,7 % (tiketti 25)
4. Sarjataulukon sarakkeet voisivat vaihtua hiljaa → rakenteellinen tarkistus ΣTM=ΣPM, ΣV=ΣH (tiketti 24)

---

## 1. Arkkitehtuuripäätös: snapshot-putki (kriittinen)

GitHub Pages on staattinen. Selain **ei voi** hakea kertoimia suoraan:
- API-avain paljastuisi sivun lähdekoodissa
- CORS estää useimmat kerroin-API:t
- Ilmaistason kvootta paloi jokaisella sivulatauksella

**Ratkaisu — laajennetaan olemassa oleva FALLBACK-patterni snapshot-putkeksi:**

```
GitHub Actions cron (2x/vrk)
  └─ npm run football
       1. ingest/football.ts   → tämän päivän ottelut + sarjataulukko + tunnusluvut
       2. ingest/odds.ts       → oikeat 1X2-kertoimet per toimisto (The Odds API)
       3. ingest/news-football → RSS per ottelu + LLM-erittely
       4. analyze/*            → devig → Poisson-malli → blend → edge → Kelly
       └─ publish/snapshot.ts  → public/data/today.json
  └─ commit data/ + deploy gh-pages

Selain (demo.html):
  fetch('data/today.json')  →  jos 404  →  fetch('/rest/v1/...')  →  jos ei  →  FALLBACK
```

**Miksi näin:** yksi uusi latauspolku UI:hin, nolla salaisuuksia selaimeen, historia versionhallinnassa (`data/history/YYYY-MM-DD.json`) → CLV- ja tarkkuusseuranta saa oikeaa aineistoa. Analytiikka lasketaan Node-puolella missä on jo testattu koodi (`margin.ts`, `value.ts`, `predict.ts`), ei duplikaattina JS:ssä.

**Ensimmäinen työ = skeeman lukitseminen.** `today.json` -skeema kirjoitetaan ensin ja käsintehty esimerkkitiedosto committoidaan. Näin UI-työ (tiketit 29–31) etenee rinnakkain vaikka API-avainta ei vielä ole.

### `today.json` -skeema (v1)

```jsonc
{
  "schema_version": 1,
  "generated_at": "2026-08-14T09:00:00Z",
  "sport": "football",
  "source": "the-odds-api+football-data.org",   // "manual" | "mock" mahdollisia
  "matches": [{
    "id": "soccer_epl:2026-08-14:ARS-CHE",
    "league": "Valioliiga",
    "kickoff": "2026-08-14T18:30:00Z",
    "home": { "name": "Arsenal", "short": "ARS", "color": "#EF0107" },
    "away": { "name": "Chelsea", "short": "CHE", "color": "#034694" },

    "odds": [                                    // rivi per toimisto, oikeat kertoimet
      { "bookmaker": "Pinnacle", "key": "pinnacle", "market": "1X2",
        "home": 2.10, "draw": 3.45, "away": 3.60, "fetched_at": "..." },
      { "bookmaker": "Unibet", "key": "unibet_eu", "market": "1X2", "...": "..." }
    ],
    "best": { "home": 2.15, "draw": 3.50, "away": 3.70,
              "home_book": "Unibet", "draw_book": "Betsson", "away_book": "Pinnacle" },
    "market": { "margin": 0.042, "implied": { "home": 0.46, "draw": 0.28, "away": 0.26 },
                "sharp": { "home": 0.47, "draw": 0.27, "away": 0.26 } },

    "model": {
      "method": "poisson+sharp-blend",
      "lambda_home": 1.62, "lambda_away": 1.18,
      "probs": { "home": 0.49, "draw": 0.26, "away": 0.25 },
      "over25": 0.54, "btts": 0.52,
      "top_scores": [{ "score": "1-1", "p": 0.11 }, { "score": "2-1", "p": 0.10 }],
      "adjustments": [{ "reason": "Chelsea: avainhyökkääjä loukkaantunut", "delta_lambda_away": -0.09 }]
    },

    "analysis": {
      "edges": [{ "side": "home", "odds": 2.15, "book": "Unibet",
                  "model_prob": 0.49, "implied_prob": 0.46, "edge": 0.054,
                  "flag": "strong", "kelly_fraction": 0.021, "stake_suggestion": 2.10 }],
      "news_window": false
    },

    "stats": {                                   // "tunnusluvut" per joukkue
      "home": { "rank": 2, "played": 3, "form": "WWD", "gf_pg": 2.33, "ga_pg": 0.67,
                "home_gf_pg": 2.50, "xg_pg": null, "rest_days": 6, "ppg": 2.33 },
      "away": { "...": "..." },
      "h2h": [{ "date": "2026-04-11", "score": "1-2", "venue": "home" }]
    },

    "news": [{ "title": "...", "url": "...", "source": "BBC Sport",
               "published_at": "...", "event_type": "injury",
               "team": "Chelsea", "player": "...", "confidence": 0.84,
               "impact": "avainhyökkääjä sivussa 3 viikkoa" }]
  }]
}
```

---

## 2. Datalähteet

| Tarve | Lähde | Hinta | Huomiot |
|---|---|---|---|
| **Kertoimet 1X2 + O/U** | The Odds API v4, `soccer_*`-sarjat | ilmainen 500 krediittiä/kk | ✅ **Testattu ja käytössä.** 19 toimistoa Veikkausliigaan, mukana Pinnacle (sharp-ankkuri), Unibet, Betsson, NordicBet, Coolbet, Betfair, 1xBet. |
| **Varalähde otteluille ja sarjataulukoille** | football-data.org v4 | ilmainen, 10 pyyntöä/min | ✅ **Avain testattu.** Ilmaistaso: **13 sarjaa** — Valioliiga, Championship, La Liga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira, CL, EM, MM, Brasileirão, Copa Libertadores. **Ei Veikkausliigaa.** `X-Auth-Token`-otsake. |
| ~~**Tunnusluvut, loukkaantumiset, kokoonpanot**~~ | ~~API-Football~~ | ❌ **ei käytettävissä** | Avain toimii (Free, aktiivinen), mutta ilmaistaso on rajattu **kausiin 2022–2024**: `"Free plans do not have access to this season, try from 2022 to 2024."` Nykyisen kauden tunnuslukuja ei saa. Ks. kohta 2b. |
| **xG** (valinnainen, myöhemmin) | Understat / FBref -scrape | ilmainen, ToS-harmaa | Hauras. Ei vaiheeseen 2. |

### 2b. Tilastolähteen umpikuja — ✅ ratkaistu (A + B + C toteutettu)

> **Ratkaisu:** Veikkausliigan tunnusluvut tulevat **Wikipedian** sarjataulukosta (MediaWiki-API, julkinen, TLS kunnossa, vakiomuotoinen taulukko kaikissa sarjoissa). Luvut ristiintarkistettu veikkausliiga.comia vasten: identtiset. PL/Championship ym. tulevat **football-data.orgista** mitatuin koti/vierassplitein. **Kausiblendi** (C) käyttää edellistä kautta priorina, joten kauden alun otantaongelma on ratkaistu.
>
> `veikkausliiga.com` hylättiin: se ei tarjoa välisertifikaattia ja Node fetch kaatuu virheeseen `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Selain ja curl selviävät hakemalla puuttuvan sertin AIA-kentästä; Node ei tee sitä. Kierto olisi ollut TLS-tarkistuksen ohitus — sitä ei tehty.
>
> Yksityiskohdat: `tickets/24-football-stats.md`

Alkuperäinen ongelma-analyysi säilytetty alla, koska se selittää miksi ratkaisu on tällainen.

Testaus 14.8.2026 paljasti että **kummallakaan ilmaisella tilastorajapinnalla ei saa nykyisen kauden tunnuslukuja Veikkausliigasta**:

| | Kertoimet | Nykyisen kauden tilastot |
|---|---|---|
| **Veikkausliiga** (kausi käynnissä, ~20 kierrosta pelattu) | ✅ The Odds API | ❌ API-Football rajattu kausiin 2022–2024, football-data.org ei kata sarjaa |
| **Valioliiga / Championship** | ✅ The Odds API | ✅ football-data.org — **mutta kausi 2026/27 alkaa vasta 21.8.2026**, eli 0 pelattua ottelua → ei GF/GA-dataa |

Siksi malli on toistaiseksi **`market-only`**: sharp-devig (Pinnacle) kertoo reilun hinnan, ja edge syntyy hintavertailusta toimistojen yli. Se on rehellinen tila — parempi kuin keksiä joukkuevoimat tyhjästä — ja tuottaa aitoja löytöjä (1/5 ottelusta ensimmäisessä ajossa). Poisson-moottori odottaa valmiina siihen asti kun tilastolähde ratkeaa.

**Vaihtoehdot ja mitä niistä tehtiin:**

| # | Vaihtoehto | Tila |
|---|---|---|
| **A** | Valioliiga + Championship football-data.orgilla | ✅ **toteutettu** — `stats-footballdata.ts`, 6 sarjaa rekisteröity, mitatut koti/vierassplitit |
| **B** | Raaputa Veikkausliigan sarjataulukko julkiselta sivulta | ✅ **toteutettu** — `stats-wikipedia.ts`. Lähde vaihtui veikkausliiga.comista Wikipediaan TLS-ongelman vuoksi; samalla parsija yleistyi kattamaan minkä tahansa sarjan |
| **C** | Edellinen kausi joukkuevoimien pohjaksi | ✅ **toteutettu** — `analyze/strength.ts`, kausiblendi painolla `pelatut/(pelatut+k)` ja regressiolla 0.75 |
| **D** | Maksullinen API-Football ~15 €/kk | ei tarvittu; jäisi vaihtoehdoksi jos loukkaantumiset ja kokoonpanot halutaan rakenteisena |

**Vaihtoehdon C mitattu vaikutus** — vahva joukkue (71−27 / 38 ottelua viime kaudelta):

| Pelatut tänä kautena | Hyökkäysvoima priorilla | Ilman prioria |
|---|---|---|
| 0 | 1.251 | 1.000 |
| 3 | 1.310 | 1.143 |
| 6 | 1.280 | 1.155 |

Ilman prioria malli olisi kauden ensimmäiset ~6 kierrosta käytännössä markkinan kopio. Tämä on se ero jonka C tekee.

### Järkevyystarkistus: malli vs. markkina

Maalidatasta rakennettu Poisson-malli osuu 2–3 prosenttiyksikön sisään markkinasta:

```
IFK Mariehamn vs SJK    Poisson  13.3% / 20.8% / 66.0%
                        markkina 15.8% / 19.7% / 64.5%
```

Tämä on paras saatavilla oleva vahvistus sille että malli ei ole rikki. Jos itsenäinen malli olisi 15 prosenttiyksikköä markkinasta sivussa, todennäköisempi selitys olisi bugi kuin löytö.
| **Uutiset** | RSS: BBC Sport Football, Guardian Football, ESPN Soccer, Yle Urheilu, IS Jalkapallo | ilmainen | `src/ingest/news.ts` + `src/engine/nlp.ts` uudelleenkäytettävissä, prompt vaihtuu jalkapalloon. |

### Kvoottamatematiikka (The Odds API)

Yhden pyynnön hinta = `markkinoiden lkm × alueiden lkm`. Eli `markets=h2h,totals` + `regions=eu` = **2 krediittiä/pyyntö**.

| Kokoonpano | Krediittiä/vrk | Kuukaudessa | Mahtuu 500:aan? |
|---|---|---|---|
| 2 sarjaa × 2 ajoa × 2 markkinaa | 8 | ~240 | ✅ reilusti |
| 4 sarjaa × 3 ajoa × 2 markkinaa | 24 | ~720 | ❌ ylittyy |

**Suositus:** aloita 2–3 sarjalla ja 2 ajolla/vrk. Kvootta budjetoidaan `config.odds.dailyCreditBudget` -asetuksella ja putki lokittaa käytön.

API-Footballin puolella kvootta on **100 pyyntöä/vrk**, ja yksi ajo kuluttaa karkeasti: 1 (fixtures) + 2×N (tilastot per joukkue) + 1 (loukkaantumiset) + 1 (H2H) per ottelu. 5 ottelua ≈ 16 pyyntöä → 2 ajoa/vrk ≈ 32. Mahtuu, mutta tilastovastaukset kannattaa **kätkeä vuorokaudeksi** (`data/cache/`) koska joukkuetilastot eivät muutu ottelupäivien välillä.

**Veikkausliiga on siis mahdollinen** API-Footballin kautta (tilastot) + The Odds APIn `soccer_finland_veikkausliiga` (kertoimet) — tämä poistaa aiemman rajoitteen.

### Miksi EI suoraa scrapea Unibetin/Veikkauksen sivuilta

claude.md listaa tämän jo MVP:n ulkopuolelle, ja syyt pätevät edelleen: käyttöehtorikkomus, bottisuojaus, DOM hajoaa viikoittain. The Odds API **on** oikeiden toimistojen oikeat kertoimet — samat luvut, kestävä rajapinta.

---

## 3. Analytiikkamalli — tämä on työn ydin

Nykyinen malli (`predict.ts`) on Elo + kiinteä tasapelikerroin. Jalkapallolle se on liian karkea, eikä tuota O/U- tai BTTS-markkinoita joissa arvo tosiasiassa asuu.

**Uusi ketju, 4 vaihetta:**

> **Toteutuksessa löytyi kaksi virhettä jotka olisivat tuottaneet vääriä value-signaaleja:**
>
> **a) Alkukauden otantavirhe.** Ensimmäinen ajo antoi Arsenal–Chelsealle 67 % kotivoittotodennäköisyyden ja **10,5 %:n edgen**. Syy: kolmen ottelun maalikeskiarvo ei ole voimaestimaatti. Korjaus — kutistus otoskoon mukaan (`shrinkStrength()`): `paino = pelatut / (pelatut + 6)`, voima kutistetaan kohti sarjan keskitasoa. Sama ottelu antaa nyt 50,5 % ja edgen −0,1 %, eli oikean vastauksen: 1,9 %:n katteella ja kolmen ottelun datalla siinä ei ole arvoa.
>
> **b) Kelly ja value-kynnys olivat eri mieltä.** Kelly antaa positiivisen panoksen heti kun edge > 0, joten kortti näytti 2,4 %:n edgelle lipun ⚫ "ei arvoa" **ja** panossuosituksen 0,46 €. Korjaus: panossuositus vain kynnyksen (3 %) ylittäville kohteille. Alle sen jäävä edge on mallin virherajojen sisällä — panossuositus siitä olisi valheellista tarkkuutta.

**1) Poisson-perusta** (`src/analyze/poisson.ts`, uusi)
```
attack_h  = (kotijoukkueen GF/peli)      / sarjan keskiarvo GF/peli
defense_a = (vierasjoukkueen GA/peli)    / sarjan keskiarvo GA/peli
λ_koti    = attack_h × defense_a × sarjan_koti_ka
λ_vieras  = attack_a × defense_h × sarjan_vieras_ka
```
Tulosmatriisi 0–8 × 0–8 → 1X2, O/U 2.5, BTTS, todennäköisimmät tarkat tulokset. Dixon–Coles-korjaus matalille tuloksille (0-0, 1-0, 0-1, 1-1) valinnaisena parametrina.

**2) Sharp-ankkuri** (`src/analyze/consensus.ts`, uusi)
Pinnacle on markkinan tarkin hinnoittelija. Devigataan sen kertoimet (`removeMargin()` on valmiina) → `sharp_prob`. Varalla toimistojen mediaani.

**3) Blend — rehellinen osa**
```
model_prob = w × poisson_prob + (1 − w) × sharp_prob,   w = 0.35 (konfiguroitava)
```
Puhdas 10 ottelun Poisson **häviää** markkinalle. Blendi antaa mallille oman äänen ilman että se kuvittelee tietävänsä enemmän kuin sadat miljoonat euroa markkinassa. `w` on se numero jota kalibroidaan tuloksia vasten.

**4) Uutissäätö**
`confidence > 0.7` -tapahtuma (loukkaantuminen / kokoonpanomuutos) → λ-korjaus −5…−12 % kyseiselle joukkueelle, kirjataan `model.adjustments[]`-listaan näkyviin. Ei mustaa laatikkoa.

**Sitten:** `edge = model_prob × paras_kerroin − 1` (paras kerroin toimistojen yli — siinä oikea arvo on), kynnykset 3 %/5 % kuten ennen, ja päälle **Kelly** (`src/engine/kelly.ts`, uusi):
```
f* = (b·p − q) / b,   panos = clamp(0.25 × f* × kassa, 0, 0.02 × kassa)
```
Murto-Kelly 25 %, kova katto 2 % kassasta. Negatiivinen edge → panos 0.

**Mittarit joilla tiedämme toimiiko tämä** (`src/analyze/scoring.ts`, uusi): osumatarkkuus, **Brier score** (kalibrointi), ROI, ja **CLV** (avauskerroin vs. sulkeutumiskerroin) — CLV on ainoa mittari joka kertoo lyötiinkö markkinaa vai käytiinkö vain tuurilla.

---

## 4. Ottelukortti UI:ssa

Jokainen jalkapallokortti saa kolme avattavaa osiota käyttäjän pyynnön mukaisesti:

```
┌────────────────────────────────────────────────┐
│ Valioliiga · Tänään 21:30      💎 +5.4% VAHVA │
│ 🔴 Arsenal  vs  Chelsea 🔵                     │
│                                                │
│ Toimisto      1       X       2                │
│ Pinnacle    2.10    3.45   3.60 ⭐             │
│ Unibet      2.15 ⭐  3.40   3.55               │
│ Betsson     2.08    3.50 ⭐ 3.50               │
│                                                │
│ [📊 Tunnusluvut] [📰 Uutiset 3] [💎 Analyysi] │
└────────────────────────────────────────────────┘
```

- **📊 Tunnusluvut** — sarjasija, form (WWDLW), GF/GA per peli, koti/vieras-splitit, PPG, lepopäivät, H2H-historia, xG (kun saatavilla)
- **📰 Uutiset** — 3–5 otsikkoa lähteineen ja linkkeineen, LLM-eritellyt tapahtumat tyyppi- ja confidence-merkinnöin, uutisikkunan tila (< 30 min & kerroin ei liikkunut → informaatioylivoima)
- **💎 Analyysi** — marginaali, devig-implied vs. malli rinnakkain, λ-arvot, edge per kohde, Poisson-tulosmatriisin top 5, O/U 2.5 + BTTS, **Kelly-panossuositus euroina**, ja kaavat auki kirjoitettuna (nykyisen `buildAnalysis()`:n tapaan — se osio on demon paras palanen, se säilyy)

---

## 5. Jääkiekon piilotus

```js
const SPORT = localStorage.getItem('bt_sport') || 'football';
```
Jääkiekkokierros, sen simulaatio ja Liiga-joukkuenäkymä renderöidään vain kun `SPORT === 'hockey'`. Admin-välilehdelle toggle *"Näytä jääkiekkokierrokset (kehitys)"*.

**Mitään ei poisteta** — koodi jää paikalleen, E2E-testit päivitetään asettamaan lippu setupissa (ei skippausta; skipatut testit lakastuvat hiljaa, sen opetuksen handover jo kirjasi).

---

## 6. Päiväsimulaatio (jalkapallo)

Nykyinen simulaatio on jääkiekkoa: eriä, jäähyjä, ylivoimaa, JA/RL. Jalkapallolle uusi `simulateFootballDay()`:

- **Maalit Poisson-mallista**, ei satunnaisesta Elo-virityksestä → tulokset ovat sisäisesti johdonmukaisia kortin ennusteen kanssa (ka ~2.7 maalia/ottelu)
- 90 min pakattuna ~20 sekuntiin, puoliaika 10 s kohdalla, lisäajat
- Tapahtumat: maalintekijät, keltaiset/punaiset kortit, kulmat, kumuloituva xG, pallonhallinta
- Ratkaisee **1X2, O/U 2.5, BTTS** ja pikavedon "seuraava maali"
- Kierrosraportti: odotus → toteuma → tulos (nykyinen rakenne säilyy), + mallin tarkkuus, Brier ja CLV päivittyvät

**Kriittinen erottelu:** simuloidut tulokset menevät avaimeen `bt_sim_results`, oikeat lopputulokset (kun ne haetaan) avaimeen `bt_real_results`, ja Seuranta-välilehti merkitsee näkyvästi kumpaa katsotaan. Jos simulaatio ratkoo oikeita otteluita samaan tarkkuustilastoon, tarkkuusluku ei mittaa yhtään mitään. `SIMULOITU`-badge jokaiseen simuloituun tulokseen.

---

## 7. Tiketit 23–33

| # | Tiketti | Effort | Deps | Hyväksymiskriteerit |
|---|---|---|---|---|
| 23 | **`today.json` -skeema + snapshot-julkaisu** | S | — | Skeema dokumentoitu, `src/publish/snapshot.ts` kirjoittaa validin tiedoston, käsintehty esimerkki `public/data/today.json` committoitu, validointitesti |
| 24 | **Jalkapallo-ingestio** (`ingest/football.ts`) | M | 23 | Päivän ottelut + sarjataulukko + viim. 10 ottelua haettu valituille sarjoille, normalisoitu skeemaan, HTTP-virheet käsitelty, normalisoijalle unit-testit |
| 25 | **Odds-ingestion laajennus jalkapalloon** | S | 23 | `soccer_*`-sport keyt konfiguroitavina, bookmaker key→näyttönimi-mäppäys, kvoottalokitus + budjettikatto, testit mäppäykselle |
| 26 | **Poisson-malli** (`analyze/poisson.ts`) | M | — | λ-laskenta, tulosmatriisi, 1X2 + O/U 2.5 + BTTS + top-5 tulokset, Dixon–Coles-korjaus, unit-testit tunnetuilla λ-arvoilla (summat = 1.0) |
| 27 | **Sharp-ankkuri + blend** (`analyze/consensus.ts`) | S | 25, 26 | Pinnacle-devig, mediaanikonsensus varalla, blend-paino `w` konfiguroitava, testit |
| 28 | **Kelly-moduuli** (`engine/kelly.ts`) | S | 27 | `f* = (bp−q)/b`, murto-Kelly 25 %, katto 2 % kassasta, edge ≤ 0 → panos 0, unit-testit |
| 29 | **Jalkapallouutiset per ottelu** | M | 23 | Jalkapallo-RSS-syötteet, joukkuenimien matchaus otteluihin, LLM-erittely jalkapalloprompilla, 0–5 uutista per ottelu confidencella, ei duplikaatteja |
| 30 | **UI: jalkapallo-ottelukortti** | M | 23, 28 | Kortti renderöityy snapshotista, kertoimet per toimisto (⭐ paras), kolme osiota (tunnusluvut / uutiset / analyysi), Kelly-panossuositus, veto siirtyy vetolappuun, E2E-testi |
| 31 | **Jääkiekon piilotus SPORT-lipulla** | S | 30 | Oletuksena vain jalkapallo näkyvissä, Admin-toggle palauttaa jääkiekon, jääkiekon E2E-testit päivitetty asettamaan lippu (ei skippausta) |
| 32 | **Jalkapallon päiväsimulaatio** | L | 26, 30 | Poisson-pohjaiset tulokset (ka ~2.7 maalia), 90min→20s + puoliaika, maalintekijät/kortit/xG, ratkaisee 1X2+O/U+BTTS+pikavedon, `SIMULOITU`-badge, sim- ja oikeat tulokset eri avaimissa |
| 33 | **Tarkkuus- ja CLV-mittarit** (`analyze/scoring.ts`) | S | 32 | Osumatarkkuus, Brier score, ROI, CLV laskettu ja testattu, Seuranta-välilehti näyttää ne, sim vs. real eroteltu näkyvästi |
| 34 | **GH Actions: snapshot-cron** | S | 24, 25, 29 | Uusi workflow, `workflow_dispatch` tuottaa validin `today.json`:n, committoi `public/data/`, deployaa Pagesiin, cron päälle kun secretit asetettu |

### Vaiheistus

| Vaihe | Tiketit | Miksi tässä järjestyksessä |
|---|---|---|
| **A — Kontrakti + moottori** ✅ | 23, 26, 27, 28 | Skeema lukkoon ensin → UI ja backend etenevät rinnakkain. Poisson, blendi ja Kelly ovat puhdasta laskentaa, testattavissa ilman yhtään API-avainta. Tiketti 27 siirtyi tähän vaiheeseen, koska sekään ei tarvitse avaimia. |
| **B — Oikea data sisään** | 24, 25, 29 | Tarvitsee API-avaimet. Verifioitavissa CLI:llä: `npm run football` → validi `today.json` oikeilla kertoimilla. |
| **C — UI** | 30, 31 | Kortti + jääkiekon piilotus. Voi alkaa heti vaiheen A jälkeen käsintehdyllä snapshotilla. |
| **D — Simulaatio + seuranta** | 32, 33 | Vaatii mallin (A) ja kortin (C). |
| **E — Automaatio** | 34 | Viimeisenä, kun putki toimii käsin ajettuna. |

Arvio: A ≈ 1 pv, B ≈ 1,5 pv, C ≈ 1 pv, D ≈ 1,5 pv, E ≈ 0,5 pv → **noin 5–6 työpäivää**.

---

## 8. Löydetyt ongelmat jotka purevat heti

**1) Kerroinsuodatin pudottaa kaikki oikeat kertoimet hiljaa** — `demo.html:316`:
```js
oddsSnapshots = (o||[]).filter(x => bookmakers.some(b => b.name === x.bookmaker))
```
Vertailu on **case-sensitiivinen ja tarkka**. The Odds API palauttaa `bookmaker.key`-arvoja kuten `pinnacle`, `unibet_eu`, `williamhill`, kun UI:n lista sisältää `'Pinnacle'`, `'Unibet'`. Tulos: nolla riviä, tyhjä kerroinlista, ei virheilmoitusta. → Tarvitaan `key → näyttönimi` -mäppäystaulu (tiketti 25). `src/ingest/odds.ts:43` tekee vertailun jo oikein (`toLowerCase()`), UI ei.

**2) `genOddsForBookmaker()` keksii kertoimia** — `demo.html:220`. Kun oikeat kertoimet saapuvat, tämä **ei saa** ajaa jalkapallo-otteluille, tai keksityt ja oikeat kertoimet sekoittuvat samaan listaan erottamattomasti. Portti `SPORT`-lipun taakse jääkiekkodemoa varten (tiketti 31).

**3) `demo.html` on 933 riviä** ja täyttää kohta jokaisen varoitusmerkin. Jalkapallokortti + uusi simulaatio nostavat sen ~1500 riviin. **Suositus:** pilko `public/app/*.js`-moduuleihin `<script type="module">`:lla — ei build-vaihetta, ei frameworkia, ei uutta riippuvuutta, "vähemmän liikkuvia osia" -periaate säilyy. Tehdään tiketin 30 yhteydessä, ei erillisenä refaktorointina.

**4) `src/pipeline.ts` on tyngät täynnä** — vaiheet 2–4 ovat `TODO`-kommentteja ja `console.log`-lauseita. Kertoimet haetaan, mutta value-moottoria ei koskaan ajeta. Uusi jalkapalloputki (`src/pipeline-football.ts`) kirjoitetaan kokonaisena; vanha jääkiekkoputki jää koskematta.

**5) Kaikki 8 `bt_*`-localStorage-avainta ovat versioimattomia.** Snapshot-skeeman muuttuminen rikkoo vanhan selaintilan hiljaa. → `bt_schema_version` ja migraatio/nollaus latauksessa (tiketti 23).

---

## 9. Päätökset jotka tarvitsevat sinua

| # | Kysymys | Suositus |
|---|---|---|
| 1 | **Onko The Odds API -avain?** Ilman sitä ei ole oikeita kertoimia. | Rekisteröi ilmaistaso (500 krediittiä/kk) → `ODDS_API_KEY`. Väliaikana: käsintehty snapshot + Admin-välilehden manuaalinen kerroinsyöttö. |
| 2 | **Mitkä sarjat?** | **Veikkausliiga + Valioliiga** — API-Football kattaa Veikkausliigan ilmaistasolla, joten kotimainen sarja onnistuu. Championship kolmanneksi jos kvootta riittää. |
| 3 | **API-Football -avain?** (ilmainen, sähköposti riittää) | Kyllä — tämä on tunnuslukujen, loukkaantumisten ja kokoonpanojen lähde. football-data.org vain varalle. |
| 4 | **LLM uutisten erittelyyn: DeepSeek vai Claude?** | `nlp.ts` on jo DeepSeek/OpenAI-yhteensopiva. Claude vaatii ~20 rivin adapterin. Huom: loukkaantumiset tulevat nyt rakenteisena API-Footballista, joten LLM on **täydentävä eikä kriittinen** — tämä voi jäädä myöhemmäksi. |
| 5 | **Riittääkö GF/GA + form, vai halutaanko xG?** | Riittää vaiheeseen 2. xG vaatisi Understat-scrapen (hauras, ToS-harmaa) — omaksi tiketiksi myöhemmin. |
| 6 | **Simulaation rooli: opetus/demo vai myös oikeat tulokset?** | Molemmat, mutta tiukasti erillään (kohta 6). Simulaatio on demoa ja opettelua varten; oikeat lopputulokset haetaan putkessa ja niistä lasketaan ainoa merkitsevä tarkkuusluku. |

---

## 10. Mitä tämä suunnitelma **ei** sisällä

- Automaattista panostusta oikealla rahalla (Veikkauksen yksinoikeus päättyy 31.12.2026 — lisensoitu markkina avautuu 1.1.2027, siihen asti tämä on analyysityökalu)
- Live-vedonlyöntiä ottelun aikana
- Suoria scrapereita toimistojen sivuille
- Kirjautumista tai monen käyttäjän tukea
- xG-mallinnusta (oma tiketti myöhemmin)
- Supabase-yhteyttä — snapshot-JSON riittää ja on yksinkertaisempi. Supabase palaa mukaan jos historiadata kasvaa yli git-mukavuusrajan.
