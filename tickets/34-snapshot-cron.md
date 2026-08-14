# Tiketti #34: Jalkapallosnapshotin ajastus

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** S
**Riippuvuudet:** 24, 25, 30

## Mitä käyttäjä voi tehdä
Ei tarvitse tehdä mitään. Liveversio päivittyy itsestään kaksi kertaa vuorokaudessa: kertoimet haetaan, analyysi lasketaan, data committoidaan ja Pages deployataan.

**Live:** https://samppafin.github.io/Toni1.0/demo.html

## Miksi tämä on koko arkkitehtuurin viimeinen palanen
GitHub Pages on staattinen hosting. Selain **ei voi** hakea kertoimia itse: API-avain paljastuisi sivun lähdekoodissa, CORS estäisi useimmat rajapinnat, ja 500 pyynnön kuukausikvootta paloisi muutamassa sadassa sivulatauksessa.

Snapshot-putki ratkaisi tämän, mutta siihen asti se oli ajettava käsin. Tämä workflow tekee siitä automaattisen.

## Kaksi ajoa vuorokaudessa — ja miksi juuri kaksi

| Aika (UTC) | Rooli |
|---|---|
| 08:00 | avauslinja |
| 14:00 | lähellä iltapäivän aloituksia |

Molemmat tallentuvat **erikseen** `public/data/history/`-kansioon. Se antaa CLV-mittarille (tiketti 33) avaus- ja sulkeutumiskertoimen vertailtavaksi — CLV on ainoa mittari joka kertoo lyötiinkö markkinaa vai käytiinkö tuurilla.

### Korjaus jonka tämä tiketti paljasti
`writeSnapshot()` nimesi historiatiedoston pelkällä päivämäärällä: `history/2026-08-14.json`. Kahdella ajolla vuorokaudessa **toinen ajo olisi ylikirjoittanut ensimmäisen**, ja avauslinja olisi kadonnut. Menetettyä linjaa ei voi hakea jälkikäteen mistään.

Nimi sisältää nyt kellonajan: `history/2026-08-14T0800Z.json`. Nimet järjestyvät aakkosellisesti aikajärjestykseen, mikä on kätevää kun historiaa luetaan.

Vika ei olisi näkynyt mitenkään ennen kuin CLV-mittaria olisi alettu rakentaa — ja silloin data olisi ollut jo puoliksi hukassa.

## Kvootta
Yksi pyyntö per sarja per ajo (`markets=h2h`, `regions=eu`):

```
2 sarjaa × 2 ajoa/vrk = 4 krediittiä/vrk ≈ 120/kk
Ilmaistason raja: 500/kk
```

`ODDS_DAILY_CREDIT_BUDGET: 8` on kova katto joka pysäyttää putken ennen kvootan loppumista ja lokittaa mitä jäi hakematta.

## Suunnitteluratkaisut

**Testit ajetaan ennen datan hakua.** Rikkinäinen malli ei saa tuottaa snapshottia joka näyttää oikealta mutta laskee väärin. 238 yksikkötestiä on portti datan eteen.

**Salaisuudet tarkistetaan eksplisiittisesti.** Puuttuva `ODDS_API_KEY` kaataa ajon selkeällä `::error::`-viestillä sen sijaan että putki tuottaisi hiljaa tyhjän snapshotin. Puuttuva `FOOTBALL_DATA_TOKEN` on vain `::warning::` — Veikkausliiga toimii ilman sitä.

**`concurrency`-ryhmä.** Kaksi rinnakkaista ajoa committoisi samaan haaraan ja toinen hukkaisi datansa.

**`fetch-depth: 0`.** Commit-vaihe tekee `git pull --rebase`, joka tarvitsee historian. Oletuksen matala klooni kaataisi sen.

**`npm ci --ignore-scripts`.** Ohittaa playwrightin selainlatauksen (~130 MB). Putki ei käytä selainta — kertoimet ja tilastot tulevat `fetch`illä. Playwright on riippuvuuslistalla vain E2E-testejä varten.

**`CACHE_DISABLED: 1`.** CI:ssä ei ole edellisen ajon välimuistia, ja tuore data on tässä koko pointti.

**Commit vain jos data muuttui.** `git diff --cached --quiet` estää tyhjät committit silloin kun kertoimet eivät ole liikkuneet.

**`[skip ci]` commit-viestissä.** Ei silmukkariskiä (workflow ei kuuntele pushia), mutta tekee lokista luettavan.

## Ajon yhteenveto
Jokainen ajo tulostaa lokiin mitä löytyi:

```
Otteluita: 5 | sarjat: Veikkausliiga
Lähteet: The Odds API + Wikipedia (sarjataulukko)
Mallitilat: {"poisson+sharp-blend":5}
Value-kohteita: 1
  [kandidaatti] HJK Helsinki vs Jaro — away @ 9.30 (Nordic Bet) edge 4.7%
```

Näin value-kohteet näkyvät Actions-lokista ilman että sivua tarvitsee avata.

## Hyväksymiskriteerit
- [x] Uusi workflow, `workflow_dispatch` tuottaa validin `today.json`:n
- [x] Committoi `public/data/` ja deployaa Pagesiin
- [x] Cron päällä: 08:00 ja 14:00 UTC
- [x] Lokitus: kvoottakäyttö, mallitilat, value-kohteet, jokaisen vaiheen onnistuminen
- [x] Historiatiedosto ei ylikirjoitu päivän toisella ajolla (CLV-data säilyy)
- [x] Testit porttina datan eteen
- [x] Kvoottakatto estää ilmaistason ylittämisen

## Salaisuudet
Asetettu repoon (Settings → Secrets and variables → Actions):
`ODDS_API_KEY`, `FOOTBALL_DATA_TOKEN`, `API_FOOTBALL_KEY`

`API_FOOTBALL_KEY` ei ole vielä käytössä — API-Footballin ilmaistaso kattaa vain kaudet 2022–2024. Se on paikallaan siltä varalta että tilaus päivitetään.

## Tiedostot
- `.github/workflows/football-snapshot.yml`
- `src/publish/snapshot.ts` — historiatiedoston nimeäminen kellonajalla
- `src/__tests__/snapshot.test.ts` — 4 testiä nimeämiselle
