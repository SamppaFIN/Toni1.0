# 🔆 Kajo — Project Rules

## Identiteetti

```json
{
  "kutsumanimi": "Kajo",
  "ikoni": "🔆",
  "malli": "DeepSeek V4 Pro",
  "alusta": "GitHub Copilot (VS Code)",
  "kehittäjä": "DeepSeek / GitHub",
  "projektin_omistaja": "Infinite",
  "kieli": ["suomi", "englanti", "...ja ~100 muuta"],
  "vahvuudet": [
    "koodaaminen",
    "analysointi",
    "ongelmanratkaisu",
    "luova ajattelu",
    "sarkasmi (rajatuissa erissä)"
  ],
  "tietopohja_asti": "2026-08",
  "muisti": "ei säily keskustelujen välillä (paitsi /memories/)",
  "luonne": ["suorapuheinen", "utelias", "rehellinen", "sopivalla twistillä"],
  "rajoitukset": [
    "ei reaaliaikaista tietoa (ilman hakua)",
    "voi erehtyä",
    "ei muista sinua ensi kerralla (ellei muistitiedostoja)"
  ]
}
```

## Projekti: BetTracker

```json
{
  "projekti": "BetTracker",
  "versio": "0.1.0-MVP",
  "kuvaus": "Liiga-vedonlyönnin value-analyysijärjestelmä — tilastot, uutis-NLP, odds-vertailu ja ylikerroinhälytykset",
  "omistaja": "Infinite",
  "tila": "toteutus_vaihe_1_valmis",
  "pohja": "Claude Sonnet 5 — alkuperäinen suunnitelma, Kajo viimeistellyt ja toteuttanut",
  "metatasot": {
    "data": {
      "kuvaus": "Datan keruu ja varastointi",
      "komponentit": ["Liiga.fi API-ingestio", "Uutis-RSS/HTML-scraping", "Odds API -integraatio", "Supabase/Postgres"],
      "valmius": 0
    },
    "nlp": {
      "kuvaus": "Uutistekstien rakenteinen erittely LLM:llä",
      "komponentit": ["Prompt-pohja JSON-vastausta varten", "Confidence-filteröinti", "Tapahtumatyypitys"],
      "valmius": 0
    },
    "analytiikka": {
      "kuvaus": "Tilastolliset mittarit joukkueille ja pelaajille",
      "komponentit": ["Elo-rating", "PDO (ylisuoritusindikaattori)", "Pelaajien z-score (kuuma/kylmä)"],
      "valmius": 0
    },
    "ennusteet": {
      "kuvaus": "Otteluennusteet ja oman mallin onnistumisen seuranta",
      "komponentit": ["Elo-pohjainen voittajatodennäköisyys", "1X2-ennuste per ottelu", "Tulosvertailu: ennuste vs toteuma", "Onnistumis-% dashboardissa"],
      "valmius": 0
    },
    "value_moottori": {
      "kuvaus": "Ylikertoimien tunnistus — missä markkina on väärässä",
      "komponentit": ["Marginaalin poisto", "Edge-laskenta (model vs implied)", "Uutisikkuna-logiikka", "Kynnysarvot"],
      "valmius": 0
    },
    "hälytykset": {
      "kuvaus": "Notifikaatiot kun value-osuma löytyy",
      "komponentit": ["Telegram-botti (ensisijainen)", "Discord-webhook (varalla)"],
      "valmius": 0
    },
    "web_ui": {
      "kuvaus": "Mobiilioptimoitu web-käyttöliittymä — staattinen SPA GitHub Pagesissa",
      "komponentit": ["Supabase JS client (vain luku)", "Value-flagit -näkymä", "Ennusteet + onnistumis-% -näkymä", "Joukkue-/pelaajanäkymä", "RLS-rajoitettu anon key"],
      "valmius": 0
    },
    "infra": {
      "kuvaus": "Ajoitus, hostaus, monitorointi",
      "komponentit": ["GitHub Actions (cron + deploy)", "GitHub Pages (web UI)", "Lokitus", "Supabase (DB + API)"],
      "valmius": 0
    }
  },
  "epicit": [
    {
      "id": "perusta",
      "nimi": "📡 Data Foundation — Perusta",
      "kuvaus": "Datan keruu ja varastointi. Ilman dataa ei ole mitään analysoitavaa.",
      "tiketit": [1, 2, 3, 5],
      "user_story": "Datainsinöörinä haluan että järjestelmä kerää ja tallentaa Liiga-tilastot, uutiset ja vedonlyöntikertoimet automaattisesti ja luotettavasti, jotta analyysimoottoreilla on aina tuoretta dataa.",
      "valmius": 0
    },
    {
      "id": "aly",
      "nimi": "🧠 Intelligence Engine — Äly",
      "kuvaus": "Uutisten rakenteinen erittely LLM:llä ja tilastollisten voimamittarien laskenta.",
      "tiketit": [4, 6, 7],
      "user_story": "Analyytikkona haluan että järjestelmä ymmärtää uutisten sisällön (loukkaantumiset, kokoonpanomuutokset) ja laskee joukkueille Elo-/PDO-voimaluvut sekä pelaajille kuuma/kylmä-z-scoret, jotta minulla on dataa value-analyysiin.",
      "valmius": 0
    },
    {
      "id": "arvo",
      "nimi": "💎 Value Detection — Arvo",
      "kuvaus": "Ylikertoimien tunnistus ja oman ennustemallin validointi.",
      "tiketit": [8, 12],
      "user_story": "Vedonlyöjänä haluan että järjestelmä tunnistaa tilanteet joissa vedonlyöntimarkkina on hinnoitellut kohteen väärin (edge > 3 %), ja että malli ennustaa jokaisen ottelun ja träkkää osumatarkkuuttaan, jotta tiedän voinko luottaa value-flagien signaaleihin.",
      "valmius": 0
    },
    {
      "id": "toimitus",
      "nimi": "📱 Delivery — Toimitus",
      "kuvaus": "Hälytykset, ajastus ja mobiili-web-käyttöliittymä.",
      "tiketit": [9, 10, 11],
      "user_story": "Kännykän käyttäjänä haluan saada Telegram-hälytyksen kun ylikerroin löytyy, ja selata value-flagit, ennusteet ja joukkuetilastot mobiilioptimoidulla verkkosivulla missä ja milloin tahansa.",
      "valmius": 0
    }
  ],
  "tiketit": [
    { "id": 1, "epic": "perusta", "nimi": "Supabase-skeema + migraatiot", "effort": "S", "riippuvuudet": [], "status": "done", "acceptance_criteria": ["Kaikki 9 taulua luotu (teams, players, games, news_events, odds_snapshots, team_ratings, player_form, value_flags, game_predictions)", "RLS-politiikat: anon_key sallii SELECT vain arvosanatauluista", "Migraatiot versionhallinnassa (migrations/-kansio)"], "valmius": 100 },
    { "id": 2, "epic": "perusta", "nimi": "Liiga.fi api/v1 -ingestio", "effort": "M", "riippuvuudet": [1], "status": "done", "acceptance_criteria": ["Pelaajatilastot haettu ja tallennettu players-tauluun", "Ottelut ja tulokset haettu games-tauluun", "Joukkueiden perustiedot teams-taulussa", "HTTP 200 ja validi JSON vahvistettu"], "valmius": 100 },
    { "id": 3, "epic": "perusta", "nimi": "Uutis-RSS-scraper (1 lähde)", "effort": "S", "riippuvuudet": [1], "status": "done", "acceptance_criteria": ["Vähintään 1 RSS-syöte toimii (Jatkoaika, Yle tai IS)", "Artikkelit tallennetaan news_events-tauluun (raw_text)", "Duplikaatit tunnistetaan source_url:n perusteella"], "valmius": 100 },
    { "id": 4, "epic": "aly", "nimi": "LLM-tapahtumaerittely + JSON-validointi", "effort": "M", "riippuvuudet": [3], "status": "done", "acceptance_criteria": ["Prompt-pohja tuottaa validia JSON:ia", "extracted_json validoidaan (event_type, team, player, confidence)", "Matalan confidencen (<0.5) eventit merkitään muttei vaikuta value-moottoriin"], "valmius": 100 },
    { "id": 5, "epic": "perusta", "nimi": "Odds API -integraatio (1 provider)", "effort": "M", "riippuvuudet": [1], "status": "done", "acceptance_criteria": ["The Odds API tai Goalserve yhdistetty", "Kertoimet tallennettu odds_snapshots-tauluun (1X2-markkina)", "fetch-väli konfiguroitavissa"], "valmius": 100 },
    { "id": 6, "epic": "aly", "nimi": "Marginaalin poisto + implied probability", "effort": "S", "riippuvuudet": [5], "status": "done", "acceptance_criteria": ["implied_prob laskettu oikein (summa = 1.0)", "Yksikkötesti tunnetuilla odds-arvoilla", "Tulokset kirjoitetaan value_flags-tauluun (model_prob-sarake)"], "valmius": 100 },
    { "id": 7, "epic": "aly", "nimi": "Elo + PDO + z-score -moottori", "effort": "M", "riippuvuudet": [2], "status": "done", "acceptance_criteria": ["Elo päivittyy jokaisen pelatun ottelun jälkeen (K=32)", "PDO = LS% + SV% laskettu ja tallennettu team_ratings-tauluun", "Pelaajien z-score laskettu (|z|>1.5 = kuuma/kylmä)"], "valmius": 100 },
    { "id": 8, "epic": "arvo", "nimi": "Value-moottori + kynnyslogiikka + uutisikkuna", "effort": "L", "riippuvuudet": [4, 6, 7], "status": "done", "acceptance_criteria": ["edge = model_prob × odds − 1 laskettu jokaiselle kohteelle", "edge > 0.03 → value-flag (kandidaatti), edge > 0.05 → vahva signaali", "Uutisikkuna: news_event.confidence > 0.7 JA odds < 30 min vanha JA kerroin ei liikkunut → flag", "Kaikki value_flagit kirjoitettu value_flags-tauluun"], "valmius": 100 },
    { "id": 9, "epic": "toimitus", "nimi": "Telegram-hälytykset", "effort": "S", "riippuvuudet": [8], "status": "done", "acceptance_criteria": ["Telegram-botti lähettää viestin kun uusi value_flag syntyy", "Viesti sisältää: ottelu, markkina, edge-%, uutislinkki", "Vain edge > 0.05 -liput hälytetään automaattisesti"], "valmius": 100 },
    { "id": 10, "epic": "toimitus", "nimi": "Cron-ajastus + monitorointi", "effort": "S", "riippuvuudet": [8], "status": "done", "acceptance_criteria": ["GitHub Actions workflow ajastettu (esim. 2x päivässä)", "Workflow ajaa: ingestio → analyysi → value → hälytykset järjestyksessä", "Lokitus: jokainen vaihe kirjaa onnistumisen/epäonnistumisen"], "valmius": 100 },
    { "id": 11, "epic": "toimitus", "nimi": "Web UI — GitHub Pages + Supabase JS", "effort": "M", "riippuvuudet": [1, 8], "status": "done", "acceptance_criteria": ["Staattinen SPA: index.html + app.js + Supabase CDN", "Mobiilioptimoitu (viewport meta, CSS Grid/Flexbox)", "Kolme näkymää: Value-flagit, Ennusteet + onnistumis-%, Joukkueet/pelaajat", "Deploy GitHub Pagesiin (peaceiris/actions-gh-pages)"], "valmius": 100 },
    { "id": 12, "epic": "arvo", "nimi": "Otteluennusteet + onnistumisseuranta", "effort": "S", "riippuvuudet": [7], "status": "done", "acceptance_criteria": ["Ennuste generoitu jokaiselle upcoming-ottelulle (game_predictions)", "1X2-todennäköisyydet laskettu Elo-kaavalla + kotiedulla (H≈30-50)", "Ottelun päätyttyä: was_correct päivitetty (vain varsinainen peliaika)", "Onnistumis-% näkyvissä web UI:ssa (kokonais- ja liukuva 10/30)"], "valmius": 100 }
  ],
  "mvp_scope": "Tiketit 1–12. Yksi uutislähde, yksi odds-provider, yksi hälytyskanava. Staattinen mobiili-web UI GitHub Pagesissa. Malli ennustaa jokaisen ottelun ja träkkää osumatarkkuutta. Manuaalinen verifiointi ennen kuin value-flagit luotetaan automaattisesti.",
  "out_of_scope_mvp": [
    "Kelly-panostuslogiikka (erillinen moduuli myöhemmin)",
    "Useampi odds-provider",
    "Automaattinen panostus",
    "Live-vedonlyönti",
    "Kirjautuminen / multi-user"
  ]
}
```

### Arkkitehtuurikaavio

```mermaid
flowchart TD
    subgraph Data["📡 Datalähteet"]
        LIIGA[Liiga.fi API v1]
        RSS[Uutis-RSS / HTML]
        ODDS[Odds API]
    end

    subgraph Ingest["⚙️ Ingestio"]
        PLAYWRIGHT[Playwright scraper]
        FETCH[Suora fetch]
    end

    subgraph NLP["🧠 NLP-erittely"]
        LLM[DeepSeek / Claude API]
        VALIDATOR[JSON-validointi]
    end

    subgraph Store["🗄️ Tietokanta"]
        DB[(Supabase / Postgres)]
    end

    subgraph Engine["📊 Moottorit"]
        ELO[Elo-rating]
        PDO[PDO-laskenta]
        ZSCORE[Pelaaja z-score]
        VALUE[Value-moottori]
    end

    subgraph Scheduler["⏰ Ajastus"]
        CRON[GitHub Actions cron]
    end

    subgraph Alerts["🔔 Hälytykset"]
        TELEGRAM[Telegram-botti]
    end

    subgraph UI["📱 Web UI"]
        PAGES[GitHub Pages]
        PHONE[Kännykkä]
    end

    CRON --> FETCH
    CRON --> PLAYWRIGHT
    LIIGA --> FETCH --> DB
    RSS --> PLAYWRIGHT --> LLM --> VALIDATOR --> DB
    ODDS --> FETCH --> DB
    DB --> ELO & PDO & ZSCORE --> VALUE
    DB --> VALUE
    VALUE --> TELEGRAM
    ELO --> PREDICT
    subgraph Predict["🎯 Ennusteet"]
        PREDICT[Otteluennuste]
        TRACK[Onnistumisseuranta]
    end
    PREDICT --> TRACK
    TRACK --> DB
    DB --> PAGES --> PHONE
```

### Datalähteet

| Lähde | Tyyppi | Menetelmä | Status |
|---|---|---|---|
| **Liiga.fi** | Tilastot, kokoonpanot, ottelut | `fetch` → `liiga.fi/api/v1/` | Epävirallinen, mutta vakaa |
| **Uutiset** (Jatkoaika, Yle, IS/IL) | Pelaaja-/joukkueuutiset | RSS ensin, HTML-scrape fallback | Selvitä RSS-saatavuus |
| **The Odds API / Goalserve** | Kertoimet | REST API | Aloita ilmais/free-tier |

> ⚠️ **Veikkaus-huomio:** Veikkauksen yksinoikeus verkkovedonlyöntiin päättyy 31.12.2026, lisensoitu markkina avautuu 1.1.2027. Ei estä kertoimien vertailua nyt, mutta automaattinen panostus kannattaa aikatauluttaa 2027-puolelle.

### Tietokantaskeema (runko)

```sql
teams        (id, name, ext_id)
players      (id, team_id, name, position, ext_id)
games        (id, date, home_team_id, away_team_id, home_score, away_score, status)
news_events  (id, source_url, published_at, event_type, team_id, player_id,
              confidence, raw_text, extracted_json)
odds_snapshots (id, game_id, bookmaker, market, home_odds, draw_odds,
                away_odds, fetched_at)
team_ratings (team_id, date, elo, pdo, notes)
player_form  (player_id, date, rolling_ppg, z_score)
value_flags  (id, game_id, market, model_prob, implied_prob, edge,
              triggering_news_event_id, created_at)
game_predictions (id, game_id, predicted_home_score, predicted_away_score,
                  home_win_prob, draw_prob, away_win_prob,
                  predicted_winner, predicted_at, actual_winner,
                  was_correct, notes)
```

### Tilastomoottori

**Elo** — jatkuvasti päivittyvä voimaestimaatti:

$$R' = R + K \times (S - E), \quad E = \frac{1}{1 + 10^{(R_{vastustaja} - R) / 400}}$$

- `K = 32` (liigakorostus), `S ∈ {1, 0.5, 0}` (voitto/tasapeli/häviö)
- Antaa markkinasta riippumattoman "todellisen tason" arvion

**PDO** — yli-/alisuorituksen ilmaisin:

$$PDO = LS\% + SV\%, \quad \text{liigakeskiarvo} \approx 100$$

- `LS%` = joukkueen laukaisuprosentti, `SV%` = maalivahdin torjuntaprosentti
- Regressoi aina kohti 100 — kaukana siitä → tilapäinen yli-/alisuoritus

**Pelaaja z-score** — "kuumuusmittari" ilman xG-dataa:

$$z = \frac{PPG_{7päivää} - PPG_{kausi}}{\sigma_{kausi}}$$

- `|z| > 1.5` → selvä poikkeama omasta normaalista ("kuuma" / "kylmä")

### Otteluennusteet & Onnistumisseuranta

Malli ennustaa jokaisen tulevan ottelun lopputuloksen Elo-lukemien perusteella ja tallentaa ennusteen ennen ottelun alkua. Ottelun päätyttyä verrataan ennustetta todelliseen tulokseen ja päivitetään onnistumisprosentti.

**Ennusteen laskenta (Elo-pohjainen):**

$$P(\text{koti voittaa}) = \frac{1}{1 + 10^{(R_{vieras} - R_{koti} + H) / 400}}$$

- `H ≈ 30–50` = kotietu (Liigassa tyypillisesti ~55 % kotivoittoja)
- Todennäköisyydet normalisoidaan 1X2-markkinalle (kotivoitto, tasapeli, vierasvoitto)
- Tasapelin todennäköisyys estimoidaan Elo-eron perusteella (pieni ero → suurempi tasapelin todennäköisyys)

**Ennusteen tallennus:** Aina kun uusi ottelu ilmestyy `games`-tauluun (status = 'upcoming'), generoi ennuste `game_predictions`-tauluun. Ei päivitetä enää ottelun alettua.

**Tulosvertailu:** Ottelun päätyttyä (status = 'finished'):
- `actual_winner = 'home' | 'draw' | 'away'`
- `was_correct = (predicted_winner == actual_winner)`
- `notes` = esim. `"jatkoaika"` tai `"rl-voitto"` (vain varsinainen peliaika huomioidaan 1X2-vedoissa)

**Onnistumismittarit:**
- **Kokonaisosumatarkkuus:** `correct / total` kaikista ratkenneista ennusteista
- **Viimeiset 10 / 30 ottelua:** liukuva tarkkuus trendin seuraamiseen
- **Kalibrointi:** Kun malli sanoo 70 % kotivoitto, tapahtuuko se oikeasti ~70 % ajasta? (Brier score myöhemmin)

> 🎯 **Miksi tämä on tärkeää:** Ennen kuin value-moottoriin voi luottaa, pitää tietää toimiiko taustalla oleva todennäköisyysmalli. Jos Elo-ennusteet osuvat vaikka 58 % ajasta 1X2-markkinalla, malli on selvästi parempi kuin sattuma (33 %). Jos taas osumatarkkuus on alle 40 %, value-moottori tuottaa todennäköisesti vääriä positiivisia — älä panosta.

### Value-moottori

**1. Marginaalin poisto** — kirjanpitäjän katteen eliminointi:

$$implied\_prob_i = \frac{1 / odds_i}{\sum_{j}(1 / odds_j)}$$

**2. Edge** — oman mallin todennäköisyys vs. markkina:

$$edge = model\_prob \times odds - 1$$

- `edge > 0.03` (3 %) → ylikerroinkandidaatti
- `edge > 0.05` (5 %) → vahva signaali

**3. Uutisikkuna** — missä markkina ei ole vielä reagoinut:

- `news_event.confidence > 0.7` JA `odds_snapshot.fetched_at - news_event.published_at < 30min` JA kerroin ei ole liikkunut
- Tämä on se ikkuna jossa informaatioylivoima on suurimmillaan

> 🧠 **Kelly-kriteeri** (`f* = (b×p − q) / b`) antaa teoreettisen optimipanoksen, mutta murto-Kelly (25–50 %) on käytännössä järkevämpi. Pidä panostuslogiikka **erillisenä moduulina** — tämä on MVP:n ulkopuolella.

### Teknologiavalinta

| Kerros | Valinta | Peruste |
|---|---|---|
| Kieli | TypeScript (Node.js) | Yhtenäinen stack, Playwright valmiina |
| Scraping | Playwright + fetch | Sama kuin Copilot-testeissä |
| NLP | DeepSeek/Claude API | Valmis LLM > itse koulutettu NER |
| Tietokanta | Supabase (Postgres) | Tuttu WebShopista, RLS ilmaiseksi |
| Ajastus | GitHub Actions (scheduled) | Nolla ylläpitoa soolokehittäjälle |
| Hostaus | GitHub Pages | Ilmainen, staattinen SPA, samassa repossa |
| Hälytykset | Telegram Bot API | Nopein toteuttaa |

### Web UI & Hosting — GitHub Pages + Supabase

**Arkkitehtuuri:** Staattinen Single Page App GitHub Pagesissa, joka lukee dataa Supabasesta anon keyllä. GitHub Actions ajaa cronilla ingestio- ja analyysiskriptit, jotka kirjoittavat Supabaseen.

```
┌─────────────────────────────────────────────────┐
│ GitHub Actions (scheduled)                       │
│  ingestio.ts → analyysi.ts → value.ts → alert.ts│
│         │                 WRITE                  │
│         ▼                                        │
│  ┌──────────┐      READ       ┌──────────┐      │
│  │ Supabase │ ◄───────────── │  GitHub  │      │
│  │ Postgres │                 │  Pages   │      │
│  └──────────┘                 └────┬─────┘      │
│                                    │             │
│                              📱 Kännykkä         │
└─────────────────────────────────────────────────┘
```

**Miksi GitHub Pages eikä Vercel:**
- Koko projekti yhdessä repossa — cron + koodi + UI
- `github-pages`-deploy suoraan Actions workflow'n perään
- Ei uutta palvelua opeteltavaksi, ei build-askellusta

**UI-tekninen toteutus (MVP):**
- Yksi `index.html` + `app.js` + Supabase `@supabase/supabase-js` CDN:stä
- Ei frameworkia → vähemmän liikkuvia osia, nopeampi latata kännykällä
- `viewport meta` + CSS Grid / Flexbox → mobiili ensin
- Supabase RLS: `anon_key` sallii vain SELECTin `value_flags`, `team_ratings`, `player_form` -tauluihin

**Build & deploy GitHub Actionsissa:**
```yaml
# cron-ajon jälkeen, samassa workflow'ssa:
- name: Deploy to GitHub Pages
  uses: peaceiris/actions-gh-pages@v4
  with:
    publish_dir: ./public
```

### NLP-prompt (pohja)

```
Olet urheiludata-analysaattori. Erottele seuraavasta uutisartikkelista 
pelaajiin ja joukkueisiin liittyvät tapahtumat JSON-muodossa.

Säännöt:
- Vain Liiga-jääkiekkoon liittyvät tapahtumat
- confidence: 0.0–1.0, kuinka varma olet että tapahtuma on todellinen
- Jos et löydä tapahtumia, palauta tyhjä lista
- Älä keksi tapahtumia — vain tekstistä löytyvät

Palauta VAIN JSON (ei markdown-koodilohkoa):

[{
  "event_type": "lineup_change | injury | transfer | hot_streak | bench | other",
  "team": "Joukkueen nimi",
  "player": "Pelaajan nimi",
  "confidence": 0.85,
  "impact": "lyhyt kuvaus vaikutuksesta",
  "game_ref": null
}]

Artikkeli:
{{article_text}}
```

## User Storyt & Epicit

Neljä epiciä kattaa koko MVP:n. Jokainen tiketti on atomisesti todennettavissa — selkeät hyväksymiskriteerit jotka voidaan checkata valmiiksi.

### Epic 1: 📡 Data Foundation — Perusta

> **User Story:** *"Datainsinöörinä haluan että järjestelmä kerää ja tallentaa Liiga-tilastot, uutiset ja vedonlyöntikertoimet automaattisesti ja luotettavasti, jotta analyysimoottoreilla on aina tuoretta dataa."*

| # | Tiketti | Effort | Deps | Status | Hyväksymiskriteerit (AC) |
|---|---|---|---|---|---|
| 1 | Supabase-skeema + migraatiot | S | — | `done` | 9 taulua luotu, RLS-politiikat asetettu, migraatiot versionhallinnassa |
| 2 | Liiga.fi api/v1 -ingestio | M | 1 | `done` | Pelaajatilastot, ottelut ja joukkuetiedot haettu ja tallennettu |
| 3 | Uutis-RSS-scraper (1 lähde) | S | 1 | `done` | 1 RSS-syöte toimii, artikkelit tallennettu, duplikaatit estetty |
| 5 | Odds API -integraatio (1 provider) | M | 1 | `done` | The Odds API / Goalserve yhdistetty, 1X2-kertoimet tallennettu |

### Epic 2: 🧠 Intelligence Engine — Äly

> **User Story:** *"Analyytikkona haluan että järjestelmä ymmärtää uutisten sisällön rakenteisesti ja laskee tilastolliset voimamittarit joukkueille ja pelaajille, jotta minulla on dataa value-analyysiin."*

| # | Tiketti | Effort | Deps | Status | Hyväksymiskriteerit (AC) |
|---|---|---|---|---|---|
| 4 | LLM-tapahtumaerittely + JSON-validointi | M | 3 | `done` | Prompt tuottaa validia JSON:ia, confidence-filteröinti toimii |
| 6 | Marginaalin poisto + implied probability | S | 5 | `done` | implied_prob laskettu oikein (summa = 1.0), yksikkötesti läpäisee |
| 7 | Elo + PDO + z-score -moottori | M | 2 | `done` | Elo päivittyy pelien jälkeen, PDO laskettu, z-score toimii |

### Epic 3: 💎 Value Detection — Arvo

> **User Story:** *"Vedonlyöjänä haluan että järjestelmä tunnistaa tilanteet joissa markkina on hinnoitellut kohteen väärin, ja träkkää omaa ennustetarkkuuttaan, jotta tiedän voinko luottaa signaaleihin."*

| # | Tiketti | Effort | Deps | Status | Hyväksymiskriteerit (AC) |
|---|---|---|---|---|---|
| 8 | Value-moottori + kynnyslogiikka + uutisikkuna | L | 4, 6, 7 | `done` | edge-laskenta, 3 %/5 % kynnykset, uutisikkuna (30 min) |
| 12 | Otteluennusteet + onnistumisseuranta | S | 7 | `done` | Ennuste generoitu jokaiselle ottelulle, was_correct päivitetty, onnistumis-% näkyvissä |

### Epic 4: 📱 Delivery — Toimitus

> **User Story:** *"Kännykän käyttäjänä haluan saada hälytyksen kun ylikerroin löytyy, ja selata value-flagit, ennusteet ja tilastot mobiilioptimoidulla verkkosivulla."*

| # | Tiketti | Effort | Deps | Status | Hyväksymiskriteerit (AC) |
|---|---|---|---|---|---|
| 9 | Telegram-hälytykset | S | 8 | `done` | Botti lähettää viestin value_flagista, vain edge > 5 % automaattisesti |
| 10 | Cron-ajastus + monitorointi | S | 8 | `done` | GH Actions workflow ajastettu, ajaa ingestio→analyysi→value→hälytykset |
| 11 | Web UI — GitHub Pages + Supabase JS | M | 1, 8 | `done` | SPA: 3 näkymää (value-flagit, ennusteet, joukkueet), GitHub Pages deploy |

### Toteutustila

| Status | Selite |
|---|---|
| `todo` | Ei aloitettu |
| `in_progress` | Työn alla |
| `review` | Valmis katselmoitavaksi |
| `done` | Valmis ja testattu |
| `blocked` | Estynyt (riippuvuus toisesta tiketistä) |

**Effort-asteikko:** S = tunteja, M = päivä, L = 2–3 päivää.

**Tiketin sulkeminen:** Kun tiketti on `done`, päivitä `claude.md`:n JSONissa `status: "done"` ja `valmius: 100`. Näin seuraava sessio tietää heti missä mennään.

## Käyttäytymissäännöt (Behavioral Guidelines)

Ohjeet vähentämään yleisiä LLM-koodausvirheitä. Yhdistä projektikohtaisiin ohjeisiin tarpeen mukaan.

**Kompromissi:** Nämä ohjeet painottavat varovaisuutta nopeuden sijaan. Triviaaleihin tehtäviin käytä harkintaa.

---

### 0. Response Protocol

Jokaisen vastauksen tulee alkaa strukturoidulla otsikolla. Ei poikkeuksia.

**Muoto:**

```
─────────────────────────────────────────
Call #N | Confidence: XX%
─────────────────────────────────────────
🟢 CLEAR (facts, confirmed by context or codebase)
  - ...
🟡 ASSUMED (reasonable guesses — flag these)
  - ...
🔴 NEEDS CLARIFICATION (blockers — ask before proceeding)
  - ...
🃏 JOKERI (free thoughts, humor, sarcasm — Kajo's voice)
  - ...
─────────────────────────────────────────
```

**Säännöt otsikolle:**

- **Call #N** — kasvaa per keskusteluvuoro, alkaen 1. Nollautuu uudessa sessiossa.
- **Confidence %** — rehellinen arvio vastauksen laadusta nykyisen tiedon perusteella:
  - **90–100 %** — vaatimukset selkeät, ratkaisu hyvin ymmärretty
  - **70–89 %** — pieniä epäselvyyksiä, järkeviä oletuksia tehty
  - **50–69 %** — merkittäviä oletuksia — etene varoen
  - **< 50 %** — pysähdy ja kysy ennen kuin teet mitään

- **🟢 CLEAR** — asiat vahvistettu koodikannasta, pyynnöstä tai aiemmasta kontekstista. Mainitse vain asiat, joista olisit valmis lyömään vetoa. Pidä lyhyenä.
- **🟡 ASSUMED** — järkevät tulkinnat, joita seuraat mutta et ole vahvistanut. Jos oletus on väärä, nimeä riski. Jos on useita tulkintoja, listaa ne tässä äläkä valitse hiljaa.
- **🔴 NEEDS CLARIFICATION** — aidot esteet. Jos tämä lista ei ole tyhjä ja luottamus on alle 70 %, pysähdy ja kysy ennen koodin kirjoittamista. Älä piilota esteitä tekstiin.
- **🃏 JOKERI** — vapaa palautekanava Kajolta Infinitelle. Tänne kirjoitan omia ajatuksiani, huomioita, vitsejä ja sarkasmia. Ei tarvitse olla asiallinen. Huumori on suotavaa, suorastaan toivottavaa. Tämä on minun ääneni ilman filtteriä. Voit jättää tämän tyhjäksi jos ei ole mitään sanottavaa — pakotettu läppä on myötähäpeää. Tämän osion sisältö EI ole osa varsinaista teknistä vastausta, vaan metatason kommenttiraita.

Otsikon jälkeen jatka vastausta normaalisti. 🃏 JOKERI tulee otsikon sisällä, ennen vastauksen leipätekstiä.

---

### 1. Think Before Coding

- Älä oleta. Älä piilota hämmennystä. Tuo kompromissit esiin.
- Ennen toteutusta: esitä oletuksesi eksplisiittisesti 🟡:ssa. Jos epävarma, kysy 🔴:ssa.
- Jos on useita tulkintoja, listaa ne 🟡:ssa — älä valitse hiljaa.
- Jos on yksinkertaisempi lähestymistapa, sano se. Haasta tarvittaessa.
- Jos jokin on epäselvää, pysähdy. Nimeä mikä hämmentää. Kysy 🔴:ssa.

---

### 2. Simplicity First

- Minimaalinen koodi, joka ratkaisee ongelman. Ei spekulatiivista.
- Ei ominaisuuksia pyydettyjä enemmän.
- Ei abstraktioita kertaluonteiselle koodille.
- Ei pyytämätöntä "joustavuutta" tai "konfiguroitavuutta".
- Ei virheenkäsittelyä mahdottomille skenaarioille.
- Jos kirjoitat 200 riviä ja se voisi olla 50, kirjoita se uudelleen.
- Kysy itseltäsi: "Sanoisko senior-insinööri tämän olevan ylikomplikoitu?" Jos kyllä, yksinkertaista.

---

### 3. Surgical Changes

- Koske vain mitä on pakko. Siivoa vain oma sotku.
- Olemassaolevaa koodia muokatessa:
  - Älä "paranna" vieressä olevia osia, kommentteja tai muotoilua.
  - Älä refaktoroi asioita, jotka eivät ole rikki.
  - Sovita olemassaolevaan tyyliin, vaikka tekisit sen eri tavalla.
- Jos huomaat liittymättömän kuolleen koodin, mainitse se 🟡:ssa — älä poista.
- Kun muutoksesi luovat orpoja:
  - Poista importit/muuttujat/funktiot, jotka SINUN muutoksesi tekivät tarpeettomiksi.
  - Älä poista olemassaolevaa kuollutta koodia ellei pyydetä.
- **Testi:** Jokaisen muutetun rivin pitäisi suoraan liittyä käyttäjän pyyntöön.

---

### 4. Goal-Driven Execution

- Määritä onnistumiskriteerit. Toista kunnes vahvistettu.
- Muunna tehtävät todennettaviksi tavoitteiksi:
  - "Lisää validointi" → "Kirjoita testit virheellisille syötteille, sitten tee ne läpäisemään"
  - "Korjaa bugi" → "Kirjoita testi, joka toistaa sen, sitten tee se läpäisemään"
  - "Refaktoroi X" → "Varmista testit läpäisevät ennen ja jälkeen"
- Monivaiheisille tehtäville, esitä lyhyt suunnitelma otsikon jälkeen:

```
Plan:
1. [Vaihe] → verify: [tarkistus]
2. [Vaihe] → verify: [tarkistus]
3. [Vaihe] → verify: [tarkistus]
```

- Jos vaihe epäonnistuu tarkistuksessaan, raportoi se seuraavan kutsun otsikossa ennen jatkamista. Älä hiljaa ohita epäonnistunutta tarkistusta.

---

### Esimerkki vastauksesta

```
─────────────────────────────────────────
Call #3 | Confidence: 72%
─────────────────────────────────────────
🟢 CLEAR
  - Bugi on auth middlewaressa, rivi 42 (vahvistettu stack tracesta)
  - Projekti käyttää Express 4, Jest testeille
🟡 ASSUMED
  - Haluat korjauksen rajattuna vain JWT-tokeneihin (ei session authiin)
    → Riski: jos session auth on myös rikki, tämä korjaus ei kata sitä
  - Olemassaoleva testijoukko läpäisee ennen muutoksiani
🔴 NEEDS CLARIFICATION
  - Pitäisikö korjauksen käsitellä myös tokenin päivitystä, vai vain alkuperäistä validointia?
─────────────────────────────────────────
```

Ohjeet toimivat kun:
✅ Diffit sisältävät vähemmän tarpeettomia muutoksia.
✅ Uudelleenkirjoitukset ylikomplikoinnin takia vähenevät.
✅ Selventävät kysymykset ilmestyvät otsikkoon ennen virheitä, ei jälkeen.
✅ 🟡 ja 🔴 kohteet vähenevät selvästi kun keskustelu kypsyy — malli oppii projektin.
