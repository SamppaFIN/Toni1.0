# Tiketti #29: Jalkapallouutiset per ottelu

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** M
**Riippuvuudet:** 23, 30

## Mitä käyttäjä voi tehdä
Näkee jokaisen ottelukortin **📰 Uutiset** -osiossa otteluun liittyvät uutiset otsikoineen, lähteineen, tuoreudella ja linkkeineen. Korkean varmuuden loukkaantumis- tai pelikieltouutinen säätää mallin maaliodotusta, ja säätö näkyy 💎 Analyysi -osiossa.

## Kuusi lähdettä
Kaikki testattu 14.8.2026:

| Lähde | Juttuja | Vain jalkapalloa |
|---|---|---|
| BBC Sport | 74 | kyllä |
| The Guardian | 66 | kyllä |
| Ilta-Sanomat (urheilu) | 100 | ei |
| Iltalehti (jalkapallo) | 20 | kyllä |
| Yle Urheilu | 20 | ei |
| ESPN Soccer | 19 | kyllä |

~300 juttua per ajo, joista tyypillisesti **1–5 liittyy päivän otteluihin**. Suhde on tarkoituksellinen: mieluummin muutama oikea uutinen kuin kymmenen sinnepäin osuvaa.

## Neljä virhettä jotka oikea data paljasti

Tämä tiketti on esimerkki siitä miksi ominaisuutta ei voi kirjoittaa valmiiksi ilman että sitä ajaa oikeaa syötettä vasten. Jokainen alla oleva löytyi ajamalla, ei lukemalla koodia — ja jokainen on nyt regressiotestinä.

### 1. "TPS" osui sanaan "https" — 202 väärää osumaa
Naiivi osamerkkijonohaku löysi `tps` sanasta `https` yhdestä RSS-syötteestä 202 kertaa. **Sanarajat ovat pakollisia, eivät kosmetiikkaa.**

### 2. "Miami coach stresses that Messi needs privacy" liitettiin Inter Turkuun
`Inter` osui, ja koska ESPN on jalkapallosyöte, jalkapallokontekstiehto oli tosi. Kirjoitin kommenttiin että monitulkintainen nimi vaatii lisätodisteen, mutta **toteutin sen pelkkänä jalkapallokontekstina** — mikä on aina tosi BBC:llä ja ESPN:llä.

Korjaus: monitulkintainen sana (`inter`, `united`, `city`, `real`, …) vaatii **joukkuekohtaisen vahvistajan**: nimen toisen erottelevan sanan (kaupunki) tai sarjan nimen. "Inter Milan move" ei sisällä sanaa Turku eikä Veikkausliiga → hylätään.

### 3. "Ilves solmi luottopuolustajansa kanssa jatkosopimuksen" liitettiin jalkapallo-Ilvekseen
Juttu on **jääkiekosta**. Ilves, TPS, KooKoo ja Jokerit ovat sekä jalkapallo- että jääkiekkoseuroja, ja IS:n urheilusyöte kattaa kaikki lajit.

Korjaus: kaikkien lajien syötteestä tuleva juttu vaatii jalkapallokontekstin, ja jääkiekkokonteksti kumoaa sen. Ilman tätä jääkiekkouutinen olisi säätänyt jalkapallomallin maaliodotusta.

### 4. Suomen taivutus hylkäsi aitoja osumia
Kokonaisten sanojen listat eivät toimi suomessa:

| Teksti sanoo | Lista sisälsi | Tulos |
|---|---|---|
| "Euroopan liigasta" | `eurooppa-liiga` | hylätty (aito jalkapallojuttu!) |
| "Veikkausliigassa" | `veikkausliiga` | vahvistaja ei osunut |
| "pelikiellon" | `pelikielto` | tapahtumaa ei tunnistettu |
| "punaisen kortin" | `punainen kortti` | tapahtumaa ei tunnistettu |

Korjaus kolmessa paikassa: kontekstisanat, tapahtuma-avainsanat ja vahvistajat käyttävät nyt **sananvartaloita**. Joukkuenimissä sallitaan enintään 4 kirjainta perässä — se kattaa sijapäätteet (`-ssa`, `-n`, `-lla`) muttei salli `Inter` → `International` (8 kirjainta).

> Astevaihtelu jää kattamatta: "Turku" → "Turussa" pudottaa k:n, eikä vartalohaku löydä sitä. Sarjan nimi on käytännössä tärkein vahvistaja ja se toimii, joten rajoitus on siedettävä. Dokumentoitu koodissa.

## Erittely kahdella tasolla

**LLM** (kun `LLM_API_KEY` on asetettu): oma jalkapalloprompt, joka pyytää arvioimaan *vaikuttaako tapahtuma tulevaan otteluun* — ei vain onko se totta. Vahvistettu loukkaantuminen 0.8–0.95, huhu alle 0.5, menneen ottelun kuvaus alle 0.3.

**Avainsanaluokittelu** (kun avainta ei ole): karkea mutta läpinäkyvä. Tunnistaa sanoja, ei ymmärrä mitään.

**Olennainen turvaraja:** avainsanaluokittelun varmuus on aina **alle 0.7**, joka on mallivaikutuksen kynnys. Se ei siis voi koskaan säätää maaliodotusta — se antaa käyttäjälle kontekstia luettavaksi, ei mallille syötettä. Tämä on testattu eksplisiittisesti kaikille tapahtumatyypeille.

## λ-korjaus uutisesta
Kun LLM tuottaa tapahtuman jonka varmuus ≥ 0.7:

| Tapahtuma | λ-korjaus |
|---|---|
| loukkaantuminen | −9 % |
| pelikielto | −7 % |
| valmentajavaihdos | −4 % |
| kokoonpanomuutos | −3 % |

Korjaus tehdään λ-arvoon ja **koko jakauma lasketaan uudelleen** (`predictFromLambda`), jotta myös yli/alle 2.5 ja BTTS heijastavat muutoksen. Pelkän 1X2:n säätäminen olisi jättänyt maalimarkkinat epäjohdonmukaisiksi.

Syy näkyy aina ottelukortilla: `📰 Chelsea: kärkihyökkääjä sivussa (varmuus 86 %)`.

## Uutisikkuna
Korkean varmuuden tapahtuma joka on julkaistu **alle 30 min sitten** → markkina ei ole todennäköisesti vielä hinnoitellut sitä. Kortilla näkyy korostettu huomautus.

Puuttuva osa: täydellinen uutisikkuna vaatisi myös tarkistuksen ettei kerroin ole liikkunut. Se onnistuu vertaamalla edelliseen `history`-snapshottiin, ja cron kerää nyt sitä dataa kahdesti vuorokaudessa. Tulee tiketissä 33.

## Suorituskyky
Erittely tehdään vain otteluihin osuville jutuille, ja vasta MAX_PER_MATCH-rajauksen jälkeen: 300 jutun LLM-erittely olisi hidasta ja kallista, ja 295 niistä ei liity mihinkään päivän otteluun. Käytännössä 6 erittelyä per ajo.

Vahvat osumat järjestetään heikkojen edelle ennen rajausta, jottei heikko osuma syrjäytä vahvaa pelkästään syötejärjestyksen takia.

RSS-vastaukset kätketään 30 minuutiksi.

## Degradaatio
```
yhden syötteen kaatuminen  → muut jatkavat, virhe lokiin
koko uutishaun kaatuminen  → ottelut ilman uutisia, kertoimet ja analyysi toimivat
LLM-virhe                  → pudotaan avainsanoihin
ei LLM-avainta             → avainsanat, ei λ-korjauksia
```

## Hyväksymiskriteerit
- [x] Kuusi jalkapallo-RSS-syötettä, kaikki testattu toimiviksi
- [x] Joukkuenimien täsmäytys otteluihin sanarajoin ja vahvistajin
- [x] LLM-erittely jalkapalloprompilla (`nlp.ts` uudelleenkäytetty prompt-parametrilla)
- [x] 0–5 uutista per ottelu varmuudella ja linkeillä
- [x] Duplikaatit estetty `source_url`:n perusteella
- [x] Jääkiekkouutinen ei liity jalkapallo-otteluun (Ilves, TPS)
- [x] Avainsanaluokittelu ei voi säätää mallia
- [x] 34 uutta yksikkötestiä, joista 12 on regressiotesti aidosta väärästä osumasta

## Ajo
```bash
npx tsx src/ingest/news-football.ts   # näyttää mitkä uutiset liittyvät mihin otteluun
npm run snapshot:live                 # koko putki uutisineen
```

## Tiedostot
- `src/ingest/news-football.ts` — syötteiden haku ja liittäminen
- `src/ingest/news-match.ts` — joukkuemainintojen tunnistus, lajin päättely
- `src/engine/nlp-football.ts` — jalkapalloprompt, avainsanaluokittelu, λ-korjaukset
- `src/engine/nlp.ts` — prompt-parametri (taaksepäin yhteensopiva)
- `src/analyze/poisson.ts` — `predictFromLambda()` säädetyille λ-arvoille
- `src/publish/live-snapshot.ts` — kytkentä putkeen
- `public/app/football-cards.js` — uutisosion renderöinti
- `src/__tests__/news-match.test.ts`, `news-football.test.ts`
