# Tiketti #25: Jalkapallokertoimien haku (The Odds API)

**Epic:** ⚽ Football Real Data
**Status:** ✅ done
**Effort:** S
**Riippuvuudet:** 23

## Mitä käyttäjä voi tehdä
Näkee päivän jalkapallo-ottelut **oikeilla kertoimilla oikeilta vedonlyöntitoimistoilta** — 9 toimistoa per ottelu, paras hinta per kohde merkittynä, ja edge parhaan hinnan ja reilun hinnan välillä.

Ajo: `npm run snapshot:live` → `public/data/today.json`

## Todennettu oikealla datalla
```
[Odds] Veikkausliiga: 6 ottelua — kvootta jäljellä 495, käytetty 5
✓ 5 ottelua kirjoitettu

🟡 HJK Helsinki vs Jaro — Veikkausliiga, 2026-08-16 13:00
   9 toimistoa | kate 3.75 % | ankkuri: Pinnacle
   reilu hinta  1 1.39  X 6.05  2 8.88
   paras hinta  1 1.32 (Unibet SE)  X 5.80 (Coolbet)  2 9.30 (Nordic Bet)
   🟡 away  edge 4.7 % → panos 0.14 €
```

## Kolme ongelmaa jotka tämä tiketti korjasi

### 1. Näyttönimi tuli väärästä kentästä (olisi pudottanut kaiken hiljaa)
API palauttaa jokaisesta toimistosta **sekä** `key` (`"betfair_ex_eu"`) **että** `title` (`"Betfair"`). Vanha `parseOddsResponse()` tallensi keyn näyttönimeksi. `demo.html:316` suodattaa kertoimet vertaamalla näyttönimiä tarkalla yhtäsuuruudella:

```js
oddsSnapshots = (o||[]).filter(x => bookmakers.some(b => b.name === x.bookmaker))
```

`"betfair_ex_eu" !== "Betfair"` → **nolla riviä, tyhjä kerroinlista, ei virheilmoitusta.** Nyt `title` kulkee näyttönimenä ja `key` säilyy tunnisteena.

### 2. Pörssin komissio puuttui → edge yliarvioitu juuri parhailta näyttävissä kohteissa
Ensimmäinen ajo löysi HJK–Jaro-ottelusta **8,1 %:n edgen** Betfairin kertoimella 9.60. Betfair on vedonvälityspörssi: komissio ~5 % veloitetaan voitosta, joten 9.60 on todellisuudessa `1 + 8.60 × 0.95 = 9.17`.

Korjaus: `BookmakerOdds.commission` + `effectiveOdds()`. Paras kerroin valitaan **komission jälkeen**, ja edge sekä Kelly lasketaan siitä. Käyttäjälle näytetään silti se hinta jonka hän sivulla näkee (`odds`), rinnalla todellinen (`odds_effective`).

Vaikutus: edge 8,1 % → **4,7 %**, lippu 💎 → 🟡, ja paras hinta vaihtui Betfairista NordicBetiin (9.30 > 9.17). Ilman tätä korjausta työkalu olisi systemaattisesti ohjannut pörssiin ja yliarvioinut tuoton.

### 3. Saman brändin variantit täyttivät kortin kopioilla
API tarjoaa Veikkausliigaan `unibet_se`, `unibet_nl` ja `unibet_fr` — identtisillä kertoimilla. Kaikki läpi päästettynä ottelukortti näyttäisi 18 riviä joista kolmasosa on kopioita, ja ⭐ "paras kerroin" menettäisi merkityksensä. `DEFAULT_FOOTBALL_BOOKMAKERS` sisältää yhden variantin per brändi.

## Miten toteutettu
`src/ingest/odds-football.ts` — erillinen tiedosto jääkiekon `odds.ts`:stä, jotta jääkiekkoputki ja sen testit toimivat ennallaan.

- `fetchFootballOdds(sportKey)` — hakee ja lukee kvoottatiedot vastausotsakkeista (`x-requests-remaining`, `x-requests-used`, `x-requests-last`)
- `parseEventOdds(event)` — 1X2 tapahtuman `home_team`/`away_team`-kenttien perusteella, **ei** listan järjestyksestä
- `filterByAllowlist()` — avaimen mukaan, kirjainkoosta riippumatta
- `commissionFor(key)` / `EXCHANGE_COMMISSION` — Betfair 5 %, Matchbook 1,5 %, Smarkets 2 %
- `teamRef(name)` — lyhenne ja väri; tunnetuille Veikkausliigan seuroille vakiintunut, muille deterministinen
- `leagueLabel(sportKey)` — luettava sarjan nimi
- `ingestFootballOdds()` — kaikki konfiguroidut sarjat, kunnioittaa vuorokausibudjettia

`src/publish/live-snapshot.ts` — kokoaa snapshotin, suodattaa aikaikkunaan (72 h), järjestää alkamisajan mukaan.

## Kvootta
Yhden pyynnön hinta = markkinat × alueet. Nykykonfiguraatiolla (`h2h` × `eu`) = **1 krediitti/sarja/ajo**. Kaksi sarjaa × 2 ajoa/vrk = 4 krediittiä/vrk ≈ 120/kk. Ilmaistaso on 500/kk, joten tilaa on. `ODDS_DAILY_CREDIT_BUDGET` katkaisee ajon ennen kvootan loppumista ja lokittaa mitä jäi hakematta.

## Hyväksymiskriteerit
- [x] `soccer_*` sport keyt konfiguroitavina (`ODDS_FOOTBALL_SPORTS`)
- [x] Bookmaker key → näyttönimi (`title`-kentästä) — testattu eksplisiittisesti
- [x] Kvoottalokitus otsakkeista + vuorokausibudjetin katto
- [x] Pörssien komissio huomioitu edgessä, Kellyssä, parhaassa kertoimessa ja katteessa
- [x] Yksi variantti per brändi oletusallowlistalla
- [x] 21 yksikkötestiä aidolla API-vastauksen muodolla
- [x] Todennettu oikealla datalla: 6 Veikkausliigan ottelua, 9 toimistoa, Pinnacle ankkurina

## Tiedostot
- `src/ingest/odds-football.ts`
- `src/publish/live-snapshot.ts`
- `src/__tests__/odds-football.test.ts`
