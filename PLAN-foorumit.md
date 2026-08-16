# 📣 PLAN — Foorumikeskustelut ja trendaavat mielipiteet

> **Tila:** suunniteltu, ei toteutettu. Tiketit 41–44.
> **Edellinen vaihe:** tiketit 35–40 valmiit (ks. `claude.md`, epic `tyokalut`).
> **Kirjoittaja:** Claude Opus 5, 16.8.2026. Tutkimustyö tehty ja varmistettu —
> älä toista sitä, se maksoi aikaa ja verkkopyyntöjä.

---

## 1. Mitä rakennetaan ja miksi

BetTracker hakee jo uutiset kuudesta RSS-syötteestä ja liittää ne otteluihin
(tiketti 29). Uutislähteet ovat hitaita pienessä sarjassa: paikallinen fani näkee
harjoitukset ja kokoonpanovihjeet ennen kuin lehti ehtii kirjoittaa. Foorumit
ovat se paikka missä tuo tieto liikkuu ensin.

**Käyttäjän (Infinite) valitsemat tavoitteet:**

1. **Aikainen kokoonpano-/loukkaantumistieto** — faktaväitteet ennen valtamediaa
2. **Trendaavat mielipiteet** — mistä puhutaan poikkeuksellisen paljon juuri nyt
3. **Fiiliksen suunta** — kumpaa puolta keskustelu kannattaa

**Käyttäjän valitsema vaikutustaso: vain näyttö aluksi.** Signaali EI koske
λ:aan, edgeen eikä Kellyyn.

### Miksi vain näyttö — lue tämä ennen kuin ehdotat muuta

Foorumikonsensus on markkinaa **huonompi** ennustaja. Pehmeät toimistot jo
hinnoittelevat yleisön mielipiteen linjoihinsa, joten konsensusta seuraamalla
ostaisi systemaattisesti huonointa hintaa. Foorumidatan arvo on:

- **(a) faktaväitteissä ennen mediaa** — tämä on aitoa ja mitattavaa
- **(b) mahdollisesti vastavirtaan** — ei myötävirtaan

Jos annat foorumifiiliksen nostaa mallin todennäköisyyttä siihen suuntaan johon
foorumi kallistuu, teet mallista huonomman ja et huomaa sitä ennen kuin kassa on
tyhjä. Vaikutus avataan vasta jos `metrics.ts` osoittaa otoksella n ≥ 20, että
signaalilla on ennustearvoa **markkinan yli**. Sama kuri kuin tiketissä 33.

---

## 2. Lähdetutkimus — VARMISTETTU 16.8.2026, älä tee uudestaan

### 2.1 robots.txt, kaikki neljä lähdettä tarkistettu

| Lähde | Tila | Rajoitteet |
|---|---|---|
| **futisforum2.org** | ✅ Sallittu | `Crawl-delay: 10`. `Disallow: /*action, /*wap, /*imode, /*type=rss, /*layout, /*PHPSESSID, /*msg, /*new, /images, /Smileys, /Themes, /tietoa`. Sitemap: `sitemap.php`, `sitemap-boards.php` |
| **keskustelu.suomi24.fi** | ✅ Sallittu | *"All robots are welcome"*. Vain `/haku`, `/t/uusi$`, `/t/uusi/` kielletty |
| **www.reddit.com** | ❌ Raapiminen kielletty | `User-agent: * / Disallow: /`. **Ainoa sallittu tie on virallinen OAuth-API** |
| **bsky.app** | ✅ Sallittu | `Allow: /`, robots.txt suorastaan kehottaa käyttämään AT Protocol -APIa. Käyttäjä jätti pois — Veikkausliiga-keskustelu liian ohutta |
| **www.jatkoaika.com** | ⚠️ `Content-Signal: search=yes, ai-train=no, use=reference` | Jääkiekkoa, tällä hetkellä scopen ulkopuolella |

**Tärkeä yksityiskohta:** `/*msg` on kielletty, mutta SMF:n sivutus toimii myös
offsetilla: `index.php?topic=284367.15` (15 viestin askel). Tuo URL **ei** sisällä
`msg`-osaa, joten sivutus on sallittua. Älä käytä `topic=N.msgXXXXX`-muotoa.

### 2.2 futisforum2.org — rakenne kartoitettu

Cloudflare edessä, mutta palauttaa 200 OK tavalliselle `curl`ille custom
User-Agentilla. Ei bot-haastetta. Alusta on SMF.

Laudat `sitemap-boards.php`:stä ja etusivulta (`index.php?board=N.0`):

| board | Nimi | Aiheita | Viestejä | Huomio |
|---|---|---|---|---|
| **2** | Liigan yleiskeskustelu | 2 191 | 454 790 | |
| **4** | Muut sarjat | | | |
| **7** | Jalkapallokulttuuri | | | |
| **9** | Kausiotsikot | 818 | **750 454** | ⚠️ **ULKOMAISET seurat**, ei Veikkausliiga |
| **11** | Otteluseuranta | 3 789 | 622 124 | Sekä Veikkausliiga että `Jornada`-ketjuja |
| **20** | Suomen Maajoukkueen Kannattajat ry | 534 | 103 849 | |
| **22** | Futsal | 819 | 72 657 | |
| **25** | Ykkösen otteluseuranta | 2 711 | 147 717 | |
| **33** | Nuoret | 727 | 55 931 | |
| **35** | Harrastefutis | 630 | 20 925 | |
| **36** | Nuorten maajoukkueet | 124 | 45 779 | |
| **39** | Kakkosen otteluseuranta | 818 | 26 053 | |
| **45** | Arkisto | 0 | 0 | |
| **57** | Cup-otteluseuranta | 1 355 | 116 845 | |
| **68** | Ykkösliigan otteluseuranta | 258 | 12 757 | |

**Yllätys 1 — board 9 on ulkomaisia seuroja.** Kausiotsikot-laudan ketjut ovat
Tottenham, Sunderland, Hamburger SV, Man City, AC Milan, Newcastle, Roma, Real
Madrid, RB Leipzig, Liverpool, Chelsea, Arsenal, Inter Milano, Leeds, St. Pauli.
Lauta on **vilkas** — ylin viesti 16.08.2026 klo 08:16 (kartoitushetkellä tänään).
Tämä palvelee siis **Valioliigaa** (`soccer_epl`, jo configissa) paremmin kuin
Veikkausliigaa. Se on hyvä uutinen, ei huono.

**Yllätys 2 — Veikkausliigan tuoreiden ottelukeskustelujen sijainti on AVOIN.**
Board 11:stä löytyi Veikkausliigan ottelukohtaisia ketjuja, mutta näkemäni olivat
**toukokuulta** vaikka kausi on kesken. Samalla laudalla oli espanjalaisia
`Jornada`-ketjuja heinäkuulta. En lähtenyt arvaamaan.

➡️ **Ensimmäinen toteutusaskel on kartoitusskripti, ei jäsennin.** Ks. §4.1.

### 2.3 Oikeita ketjuotsikoita — käytä nämä jäsentimen testifixtuureina

Nämä ovat **aitoja**, haettu board=11:stä 15.8.2026. Ne näyttävät miksi
täsmäytys on vaikeaa:

```
IFK Mariehamn vs KuPS 16.5.2026 klo. 17:00 WHA
SJK-Inter la 16.5. klo 17,  Jouppilanvuoren juurella
HJK - FC Lahti 4.5.2026 klo. 19 @Bolt areena Tölikkä - Jousia ja nuolia
IF Gnistan - FF Jaro 16.5 klo.19.00 @MPA (Markku Piste fi Areena)
IF Gnistan - FC Inter 5.5 klo.19.00 @MPA (Markku Piste fi Areena)
AC Oulu - KuPS - Kovaa ajoa Raatissa
SJK - ILVES
Kierrosseuranta 8.5. -
Jornada 20
Käytäntö liigaotteluiden streamien levittämisestä
```

Havainnot jotka jäsentimen on kestettävä:
- Erotin vaihtelee: `vs`, ` - `, `-` ilman välejä
- Päivämäärä: `16.5.2026`, `16.5.`, `4.5.2026`, `5.5`, tai **puuttuu kokonaan**
- Joukkuenimet sekä lyhyinä (`SJK`, `Inter`, `KuPS`, `ILVES`) että pitkinä
  (`IFK Mariehamn`, `FC Lahti`, `IF Gnistan`) — **sama lyhyt/pitkä-ongelma jonka
  `eloKeyFor()` jo ratkaisee** (`src/publish/live-snapshot.ts`, tiketti 40)
- Otsikossa on vapaata tekstiä perässä (`Kovaa ajoa Raatissa`, areenan nimi)
- Mukana on ketjuja jotka **eivät ole otteluita** (`Käytäntö…`, `Kierrosseuranta`)
- `AC Oulu - KuPS - Kovaa ajoa Raatissa` sisältää **kolme** väliviivaa → naiivi
  `split('-')` hajoaa

---

## 3. Keskeiset suunnittelupäätökset

### 3.1 SCHEMA_VERSION pysyy 1:ssä — `discussion` on valinnainen kenttä

`public/app/snapshot.js:71` **hylkää koko snapshotin** jos versio ei täsmää:

```js
if (snapshot.schema_version !== SCHEMA_VERSION) {
  return { snapshot: null, error: `Snapshotin versio on ${...}, käyttöliittymä odottaa ${...}` };
}
```

GitHub Pages deployaa **vain** cronilla (08/14 UTC) tai `workflow_dispatch`illa,
ei `git push`illa. Version nosto tarkoittaisi ikkunan jossa tuotanto näyttää
pelkkää virheilmoitusta kunnes seuraava cron ajaa.

Additiivinen valinnainen kenttä on yhteensopiva molempiin suuntiin:
`match.discussion ?? null`. Vanha data toimii uudella UI:lla ja päinvastoin.
Versionosto on varattu **rikkoville** muutoksille. Kirjaa perustelu
`types-football.ts`:n kommenttiin, koska tiedoston nykyinen ohje (`:1-5`) sanoo
"bump it if you change the structure" ja tämä on tietoinen poikkeus siihen.

### 3.2 Käyttäjänimiä ei tallenneta lainkaan

Foorumin käyttäjänimi + siihen liitetty mielipide on **henkilötietoa** (GDPR),
ja viestit ovat kirjoittajiensa tekijänoikeuden alaisia.

- `DiscussionItem`issa **ei ole** kirjoittajakenttää
- Linkki osoittaa **ketjuun**, ei yksittäiseen viestiin
- Tallennettava lainaus ≤ **200 merkkiä**, ei koko viestiä
- Sama linja kuin uutisissa: otsikko + linkki + lyhyt tiivistys

### 3.3 Trendi lasketaan yhdestä sivulatauksesta

Naiivi z-score joukkueen omaa historiaa vastaan vaatisi viikkojen datan ennen
kuin näyttäisi mitään. Sen sijaan:

```
nykyinen tahti   = 15 uusinta viestiä / (uusin_aika − vanhin_aika)   [viestiä/h]
ketjun perustaso = vastauksia yhteensä / (viimeisin − ensimmäinen)   [viestiä/h]
trend            = nykyinen tahti / perustaso
```

Molemmat saadaan lautalistauksesta + ketjun viimeiseltä sivulta. Tulos on heti
tulkittava (*"keskustelu käy 4,2× normaalia vilkkaammin"*) eikä vaadi kertyvää
historiaa. Perustaso on **ketjukohtainen**, joten HJK:n suurempi lähtövolyymi ei
vääristä vertailua IFK Mariehamniin.

Kun `public/data/history/`-kansioon on kertynyt snapshotteja, tämän rinnalle voi
lisätä aidon z-scoren — mutta se ei ole vaiheen 1 este.

### 3.4 LLM-kutsuja rajoitetaan aggressiivisesti

Ketjussa voi olla satoja viestejä. Sama kaksivaiheinen kuvio kuin `attachNews`
(`src/ingest/news-football.ts:190-240`):

1. Valitse enintään ~15 viestiä: avainsanaosuma edellä, sitten tuorein
2. Niputa ne **yhdeksi** tekstiksi
3. Tee **yksi** LLM-kutsu per ottelu — ei per viesti

Uutispuolella vastaava raja on `MAX_PER_MATCH = 5` ja teksti katkaistaan 1200
merkkiin. Foorumille sopiva katkaisu on ~3000 merkkiä (useita viestejä).

### 3.5 Kohteliaisuusrajat ovat kovakoodattuja, eivät valinnaisia

- **10 s viive** pyyntöjen välillä (robots.txt `Crawl-delay: 10`)
- `FORUM_MAX_REQUESTS` (oletus 12) katkaisee ajon — bugi ei voi hakata palvelinta
- `User-Agent` tunnistaa botin ja sisältää repo-osoitteen
- robots.txt dokumentoidaan tiedoston alkuun, kuten
  `src/ingest/results-veikkausliiga.ts:8` tekee

Cron ajaa 2×/vrk, joten 12 pyyntöä × 10 s = 2 min per ajo. Täysin siedettävää.

---

## 4. Vaihe 1 — futisforum2-ingestio, trendi ja näyttö (tiketti 41)

Ensimmäinen julkaistava kokonaisuus. **Ei LLM:ää vielä.**

### 4.1 Askel 0: kartoitusskripti (tee tämä ENSIN)

`src/tools/forum-discover.ts` + `npm run forum:discover`

Kertakäyttöinen työkalu joka hakee `sitemap-boards.php`:n ja jokaisen laudan
listaussivun, ja tulostaa: **lautatunnus, nimi, aiheiden määrä, tuoreimman
viestin aika, 5 tuoreinta ketjuotsikkoa.**

Tämä ratkaisee §2.2:n avoimen kysymyksen havainnolla eikä oletuksella. Kirjaa
tulos tähän dokumenttiin ja vie lautatunnukset configiin.

⚠️ Muista 10 s viive myös tässä. 15 lautaa = 2,5 min. Aja kerran, cachea tulos.

### 4.2 Uudet tiedostot

| Tiedosto | Vastuu |
|---|---|
| `src/ingest/forum-futisforum.ts` | HTTP + `parseBoardListing(html)` + `parseThreadPage(html)` — **puhtaat jäsentimet erillään hakemisesta** |
| `src/ingest/forum-match.ts` | `attachDiscussion(matches, threads, now)` — sama kaksivaiheinen rakenne kuin `attachNews` |
| `src/analyze/forum-trend.ts` | `postingRate()`, `trendRatio()` — puhdas laskenta |
| `src/tools/forum-discover.ts` | Kartoitus, §4.1 |

### 4.3 Muokattavat tiedostot

**`src/types-football.ts`**
```ts
export interface DiscussionItem {
  title: string;           // ketjun otsikko
  url: string;             // linkki KETJUUN, ei viestiin
  source: string;          // 'futisforum2.org'
  last_activity: string;   // ISO
  posts_recent: number;    // viestejä viim. 24 h
  excerpt: string | null;  // ≤ 200 merkkiä, EI käyttäjänimeä
  event_type: string | null;  // vaihe 2 täyttää
  confidence: number | null;  // vaihe 2 täyttää
}

export interface DiscussionView {
  threads: DiscussionItem[];
  trend_ratio: number | null;   // §3.3
  posts_24h: number;
  baseline_rate: number | null; // viestiä/h
  lean: 'home' | 'away' | 'none' | null;  // vaihe 2
  lean_confidence: number | null;         // vaihe 2
}
```
`MatchCard.discussion?: DiscussionView` **valinnaisena**. SCHEMA_VERSION pysyy 1.

**`src/publish/snapshot.ts`** — `BuildMatchCardInput.discussion?` ja
`discussion: input.discussion ?? null`. Kuvio kuten `news` (`:209`, `:235`).

**`src/publish/live-snapshot.ts`** — haku kerran koko kierrokselle oman
try/catchin sisällä (uutishaku `:124-141` on malli), ja
`providers.push('futisforum2.org')` (`:174` kuvio).

**`src/config.ts`** — `config.forum = { enabled, boards, maxRequests, crawlDelayMs, maxAgeHours }`.
Kaikki ympäristömuuttujista, `Number()` / `split(',')` -idiomeilla kuten `:21`, `:24-27`.

**`public/app/football-cards.js`**
- `discussionSection(match)` — renderöijä
- Yksi rivi `SECTIONS`-rekisteriin (`:679`)
- Yleistä `key === 'news'` -laskuririvi (`:706`) kattamaan myös keskustelu
- Uusi pilleri `factorPills`iin: trendiluku, jos poikkeuksellinen

**`public/app/football-prefs.js`** — yksi `DISPLAY_OPTIONS`-rivi, `default: false`
(raskaat osiot suljettuina, `:26` konventio). `getPrefs()` mergeää oletukset
tallennetun päälle, joten **migraatiota ei tarvita** (`:42-43`).

### 4.4 Suoraan uudelleenkäytettävä koodi — ÄLÄ kirjoita uusiksi

| Tarve | Käytä tätä | Huomio |
|---|---|---|
| Joukkuetunnistus | `buildTeamPattern` / `mentionsTeam` / `isAboutFootball` — `src/ingest/news-match.ts:87,177,247` | **Säilytä korroboraattorivaatimus.** Foorumilauta on yksilajinen, joten lajikonteksti ei erottele mitään — täsmälleen sama ansa jonka takia "Inter Miami" liittyi aikanaan Inter Turkuun (`news-match.ts:166-176`) |
| Nimien normalisointi | `normalizeName()`, `significantTokens()`, `namesMatch()` — `src/ingest/team-match.ts:23,37,50` | |
| Lyhyt↔pitkä nimi | `eloKeyFor()` + `STATS_TO_ELO_NAME` — `src/publish/live-snapshot.ts` | Sama ongelma, tiketti 40 ratkaisi sen jo kerran |
| Välimuisti | `cached(key, fetcher, ttlMs)` — `src/ingest/cache.ts:56` | TTL 30 min kuten RSS. `CACHE_DISABLED=1` ohittaa |
| HTTP | `fetch` + moduulitason `USER_AGENT`-vakio — `src/ingest/results-veikkausliiga.ts:19,118-122` | Ei jaettua wrapperia, tämä on talon tapa |
| CLI-vartija | `pathToFileURL(process.argv[1]).href` — `news-football.ts:250` | **Windows-pakollinen**, `file://${process.argv[1]}` ei toimi |
| Kaksivaiheinen liitos | `attachNews` rakenne — `news-football.ts:124-248` | Kerää ehdokkaat → priorisoi → vasta sitten kallis operaatio |

### 4.5 Jäsentimen virheenkäsittely

Noudata `src/ingest/results-veikkausliiga.ts:69-116` -mallia:

1. Ankkurin etsintä → heitä jos puuttuu: `/rakenne on muuttunut/`
2. Tagien riisuminen `|`-erotelluiksi tokeneiksi
3. Positiotulkinta
4. **Kolme validointiporttia jotka heittävät** — liian vähän rivejä →
   `/parsinta on rikki/`

Hiljainen puolikas data on pahempi kuin kaatuminen. Tiketti 40 opetti tämän
kantapään kautta: Elo-nimien täsmäytys epäonnistui hiljaa ja 3/4 ottelusta jäi
ilman lukua ilman yhtään virheilmoitusta.

**Erikoistapaus jota uutispuolella ei ole:** SMF näyttää kuluvan päivän viestit
muodossa *"Tänään klo 08:16"* absoluuttisen aikaleiman sijaan. Käsittele
eksplisiittisesti. Huomaa ero uutispuoleen: `attachNews` **säilyttää**
jäsentymättömät aikaleimat (`news-football.ts:132`), mutta trendilaskenta
*vaatii* ajan → jäsentymätön aikaleima **pudottaa viestin trendilaskennasta**
eikä oleta sitä tuoreeksi.

### 4.6 Testit

Konventio on **inline-fixtuurit, ei tiedostoja levyllä**
(`src/__tests__/news-match.test.ts:13-32`, `season-elo.test.ts:215-259`).
Repossa ei ole yhtään fixture-tiedostoa — älä aloita sitä tapaa.

- `src/__tests__/forum-parse.test.ts` — aitoa futisforum2-HTML:ää inline-vakiona,
  **molemmat epäonnistumistilat**, "Tänään klo" -aikaleima, sivutus offsetilla
- `src/__tests__/forum-trend.test.ts` — trendilaskenta **käsin lasketulla
  vertailuarvolla**, nollajakaja, yhden viestin ketju
- `src/__tests__/forum-match.test.ts` — ketjun otsikko → ottelu -täsmäytys
  **§2.3:n oikeilla otsikoilla**, regressiotestit väärille osumille
- `e2e/specs/football-discussion.spec.ts` — osio näkyy, tyhjä tila selittää
  itsensä, asetustoggle piilottaa sen, **eikä osio muuta analyysin lukuja**
  (sama snapshot-vertailu kuin `football-display.spec.ts:263`)

E2E:ssä käytä `useFixtureSnapshot(page)` (`e2e/helpers.ts`) — se irrottaa testit
cronin vaihtuvasta datasta.

---

## 5. Vaihe 2 — LLM-erittely: väitteet ja fiilis (tiketti 42)

Yhä **vain näyttöä**.

- **`src/engine/nlp-forum.ts`** — `FORUM_SYSTEM_PROMPT` peilaa
  `src/engine/nlp-football.ts:18-39` mutta **matalammalla kalibroinnilla**:
  foorumiväite on oletuksena huhu. Yli 0,5 vaatii korroboroinnin (useampi
  toisistaan riippumaton kirjoittaja tai linkki lähteeseen).
- **Prompt kieltää eksplisiittisesti sarkasmin tulkitsemisen kirjaimellisesti.**
  Suomalainen foorumikulttuuri on vahvasti ironista ja tämä on ylivoimaisesti
  suurin väärintulkinnan lähde. Avainsanapohjainen sentimentti EI toimi täällä
  — siksi fiilis vaatii LLM:n eikä `classifyByKeywords`-tyyppistä ratkaisua.
- Käyttää `extractEvents(text, systemPrompt)` — `src/engine/nlp.ts:42`. Se on
  **jo rakennettu juuri tätä varten**: doc-kommentti `:37-41` sanoo että
  prompt-parametri on olemassa toista domainia varten ilman duplikointia.
- Fiiliksen suunta erillisenä kenttänä (`lean`, `lean_confidence`). Näytetään
  **vastavirtatulkinnan kanssa**, ei suosituksena.

### ⚠️ Korjattava samalla

`validateAndParse` (`src/engine/nlp.ts:85`) pudottaa `confidence: 0`
-tapahtumat totuusarvotarkistuksen (`!e.confidence`) takia. Matalan varmuuden
foorumivirta osuu tähän paljon useammin kuin uutiset. Korjaa
`typeof e.confidence === 'number'` -tarkistukseksi.

---

## 6. Vaihe 3 — Suomi24 ja Reddit (tiketti 43)

**Suomi24** (`keskustelu.suomi24.fi`) — robots.txt sallii. Sama jäsenninrakenne
kuin vaiheessa 1. Odotusarvo: **heikoin signaali/kohina-suhde** kaikista.
Merkitse lähdekohtaisella painolla, **älä sekoita futisforum2:n kanssa yhdeksi
luvuksi** — muuten hyvä lähde hukkuu huonoon.

**Reddit** — robots.txt on `Disallow: /`, joten sivuston raapiminen on kielletty
kokonaan. Ainoa sallittu tie on virallinen OAuth-API:

- Rekisteröi sovellus: `reddit.com/prefs/apps` → tyyppi "script"
- Kaksi uutta salaisuutta: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- Lisää ne `.env`iin **ja** GitHub Secrets -kohtaan (Settings → Secrets and
  variables → Actions), sekä `.github/workflows/football-snapshot.yml`:n
  `env`-lohkoon
- Token: `POST https://www.reddit.com/api/v1/access_token` (Basic auth)
- Haku: `https://oauth.reddit.com/r/{sub}/new`
- Ilmaistaso 100 QPM OAuthilla — reilusti riittävä 2×/vrk cronille
- Arvo painottuu isoihin sarjoihin (r/soccer). **r/Veikkausliiga on hyvin pieni**

---

## 7. Vaihe 4 — mittaus, ja vasta sitten mahdollinen mallivaikutus (tiketti 44)

Tämä vaihe ratkaisee saako signaaliin luottaa. Älä ohita sitä.

- Signaali on jo snapshotissa → se tallentuu `public/data/history/`-kansioon
  automaattisesti jokaisella cron-ajolla
- `src/publish/metrics.ts` -lisäys: onko korkean trendin / vahvan fiiliksen
  otteluissa systemaattista eroa Brier-luvussa **markkinaan verrattuna**
- Pisteytys **avaushavainnosta**, ei sulkeutumislinjasta — `metrics.ts:129-131`
  sanoo suoraan miksi: *"sulkeutumislinjaa vasten mittaaminen olisi
  itsepetosta, malli hyötyisi ennusteen jälkeen syntyneestä informaatiosta"*
- `MIN_SAMPLE = 20` (`src/analyze/scoring.ts:18`) alle → sanotaan
  **varoituksena, ei alaviitteenä**
- Jokainen luku esitetään vertailukohdan kanssa (`metrics.ts:9-12`)

**Vasta jos signaali voittaa markkinan baselinen:** keskustellaan saako se
nostaa `news_window`-lipun. λ-korjaus jää tämänkin jälkeen **erilliseksi
päätökseksi** — foorumihuhu ei ole sama asia kuin toimittajan vahvistama tieto.

Nykyinen mallivaikutuksen portti on `MODEL_IMPACT_THRESHOLD = 0.7`
(`nlp-football.ts:137`) ja `affectsModel()` (`:148-150`). Avainsanapolku ei
koskaan yllä siihen — se on lukittu testillä `news-football.test.ts:135-150`.
Tee foorumille vastaava lukitus.

---

## 8. Hyväksymiskriteerit — vaihe 1 valmis kun kaikki pitävät

1. `npm run forum:discover` tulostaa lautatunnukset, nimet ja tuoreimman viestin
   ajan → **Veikkausliigan ottelukeskustelujen sijainti varmistettu havainnolla**,
   ei oletuksella. Tunnukset kirjattu configiin ja tähän dokumenttiin.
2. `npm test` — nykyiset **471** + uudet jäsennin-, trendi- ja täsmäytystestit
   vihreänä.
3. `npx tsc --noEmit` puhdas.
4. `npm run snapshot:live` tuottaa validin `today.json`:n jossa `discussion`-kenttä
   on täytetty vähintään yhdelle ottelulle. Lokista tarkistetaan: **pyyntömäärä
   ≤ `FORUM_MAX_REQUESTS`** ja **pyyntöjen väli ≥ 10 s**.
5. **Degradaatio todennettu:** `FORUM_ENABLED=0` ja verkkokatkos (väärä URL) →
   snapshot syntyy silti, kertoimet ja analyysi ennallaan, lokissa varoitus.
   Sama vaatimus kuin tilastolähteillä (`live-snapshot.ts:10-12`).
6. `npm run e2e` — nykyiset **115** + uudet keskusteluosion testit vihreänä,
   mukaan lukien testi joka todistaa ettei osio muuta snapshotin lukuja.
7. Selaimessa **390 px** leveydellä: keskusteluosio avautuu, trendiluku on
   tulkittava, tyhjä tila selittää miksi mitään ei löytynyt, linkit avautuvat
   **ketjuun** (eivät yksittäiseen viestiin).
8. `git diff public/data/today.json` — `discussion` sisältää lyhyitä lainauksia
   (≤ 200 merkkiä) eikä **yhtään käyttäjänimeä**.

---

## 9. Muistilista Kajolle

- **`claude.md`:n tiketit 41–44 pitää lisätä** JSON-lohkoon epiciin `tyokalut`
  ennen kuin aloitat. Nykyinen viimeinen on 40.
- **Deploy ei tapahdu pushilla.** GitHub Pages päivittyy vain
  `football-snapshot.yml`:n cronilla (08/14 UTC) tai käsin: Actions →
  Jalkapallosnapshot → Run workflow. Tämä yllätti kerran jo (tiketti 40).
- **Working directory nollautuu** `c:\Projects\Bet`iin — `cd /c/Projects/Bet/Toni1.0`
  eksplisiittisesti.
- **Portti 3000 varattu** (Minecraft). E2E käyttää 3333.
- Vastausprotokolla (`Call #N | Confidence: XX%` + 🟢🟡🔴🃏) on voimassa,
  ks. `claude.md` §0.
- Työkieli suomi, domain-termit englanniksi (Elo, edge, Kelly, CLV, Brier).
