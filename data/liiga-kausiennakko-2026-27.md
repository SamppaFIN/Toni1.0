# Liiga 2026–27 — kausiennakko (mallin LÄHDE)

**Tämä tiedosto on lähde, ei kopio.** `src/analyze/liiga-preview.ts` jäsentää alla olevan
taulukon, ja putki lukee siitä sijaluvun, **lähtö-Elon sellaisenaan** sekä kortilla
näytettävät vahvuudet ja haitat. Ennakon päivitys on siis tämän taulukon muokkaus — ei
koodimuutos.

Ristikaksi.com on poistanut RSS-syötteensä käytöstä, joten kausiennakkoa ei scrapata.
Tämä on käsin koottu yhteenveto ennakon **johtopäätöksestä** (ennustettu sijoitus +
lyhyet vahvuudet/haitat) — artikkelin tekstiä ei kopioida.

**Lähde:** Ristikaksi — Liiga-kausiennakko 2026-27
<https://www.ristikaksi.com/urheilusarjat/liiga-kausiennakko-2026-27> (luettu 2026-09-01)

**Muokkausohje.** Taulukon muoto on osa sopimusta: ensimmäinen sarake on sijaluku,
toinen joukkueen nimi, kolmas lähtö-Elo, neljäs vahvuudet ja viides haitat. Vahvuudet ja
haitat pilkotaan **pilkuista, mutta ei sulkeiden sisältä** — "terävä kärki (Blichfeld,
Rautiainen)" pysyy siis yhtenä kohtana. Jos taulukko hajoaa (alle 10 riviä jäsentyy),
putki varoittaa ja putoaa `liiga-priors.ts`:n `TEAM_PRIORS`-varalukuihin: puolikas
taulukko antaisi osalle joukkueista lähtö-Elon ja osalle ei, ja ero näkyisi kortilla
mielivaltaisena.

## Ennustettu sarjataulukko

| Sija | Joukkue | Lähtö-Elo | Vahvuudet | Haitat / riskit |
|---|---|---|---|---|
| 1 | Tappara | 1620 | Huipputason valmennus (Kari Jalonen), voittamisen kulttuuri, jatkuvuus, terävä kärki (Blichfeld, Rautiainen), eliittimaalivahti Heljanko, korkea perustaso | Keskikaistan laatu epävarma (Mattila, Räsänen) |
| 2 | Ilves | 1605 | Kivenkova hyökkäys, korkea perustekemisen taso, hyvä yhteishenki, terve kilpailu pelipaikoista | Maalivahtien riittävyys (Armalis/Rifalk), suoritustason lasku pudotuspeleissä, erikoistilanteet |
| 3 | JYP | 1590 | Hyökkäyksen tulivoima (Ojantakanen, Tukiainen, Lassila), vahva ylivoima, Matikaisen korkea vaatimustaso, materiaaliltaan kärkeä | Maalivahdit (Salminen/Setänen), viisikkopuolustuksen pitävyys, kovuus kevään peleissä |
| 4 | KooKoo | 1575 | Vastahyökkäyksissä vaarallisin, jatkuvuus, ykkösmaalivahti Randelin (eliittiä), fiksu seurajohtaminen, pelitapaan soveltuva materiaali | Puolustuksesta lähtenyt kiekollista osaamista (Suomi, Loponen), CHL:n tuoma lisäkuorma |
| 5 | Kärpät | 1560 | Hyökkäyspelaaminen, ylivoima, eliittimaalivahti Rubin, joukkuetta rakennettu Karjalaisen näköiseksi | Puolustuksen pitävyys, suoritustason ailahtelu, valtavat odotukset |
| 6 | KalPa | 1545 | Terävä kärki (Mäenpää, Rissanen, Hartikainen), selkeä peli-identiteetti, vahva kotijoukkue | Hyökkäyspäässä kovia menetyksiä (Curry, Söderlund Leger, Korhonen), tuloksenteko saattaa keskittyä liikaa kärkeen |
| 7 | Lukko | 1530 | Terävä kärki, korkea perustekemisen taso, laaja hyökkäysmateriaali, resurssit vahvistaa kesken kauden | Maalivahtiosasto (Raanta/Salonen), valmennus (Lämsä), kapeahko puolustus, nälän puute kevään peleissä |
| 8 | Jokerit | 1515 | Hyökkäysosasto (Curry, Nikkanen, Fortier, Kalapudas, Turunen), Liiga-paluun tuoma buusti (erityisesti kotiottelut) | Maalivahtiosasto (Eriksson Ek/Vehviläinen), valmennuksen riittävyys, puolustuksessa kahden kerroksen väkeä |
| 9 | HIFK | 1500 | Hyvin roolitettu laituriosasto, tasapainoinen puolustus, Jokisen kyky kehittää nuoria | Maalivahdit, loukkaantumisherkkyys, keskikaistan kapeus (Lehterä + nuoret) |
| 10 | SaiPa | 1485 | Valmennus (Helminen) – kyky repiä potentiaali irti, pelitapaan soveltuva materiaali, laadukas ykkösmaalivahti Piiroinen, kotihurmos | Hyökkäyspään jättimäiset menetykset (Kivenmäki, Fortier, Nikkanen, Kalapudas, Kuusla), CHL:n lisärasitus, ei kestä loukkaantumisia |
| 11 | Ässät | 1470 | Selkeä peli-identiteetti, huippumaalivahti Bednar, viisikkopuolustus, kotipelaaminen, erikoistilanteet, inhottava vastustaja | Puolustuksen kiekollinen osaaminen rajallista, materiaali ei kärkitasoa, loukkaantumisriski, hyökkäystehokkuuden jatkuminen epävarmaa |
| 12 | HPK | 1455 | Huippumaalivahti Saarinen, valmennus Manner, tasapainoinen puolustus | Ulkomaalaishankintojen floppaaminen, hyökkäyspään tehottomuus, ratkaisuvoiman puute |
| 13 | Pelicans | 1440 | Tiivis viisikkopuolustus, vaikeasti murrettava, vahva alivoima, laadukas ykkösmaalivahti Bartosak | Tehottomuus hyökkäyspäässä, tasapaksu materiaali, ratkaisijoiden puute |
| 14 | TPS | 1425 | Keskikaista (Haudum, Paajanen, Määttä), terävä kärki (Wernblom, Ikonen, Bryggman), lupaavia hankintoja | Ei huippumaalivahtia, hyökkäyksen laajuus (laiturit) heikko, pelillinen ailahtelu, valmennuksen otteen säilyminen epävarmaa |
| 15 | Kiekko-Espoo | 1410 | Ykkösmaalivahti Rimpinen (eliittiä), useita "omia poikia" – tuo sydäntä ja ryhtiä | Kapeahko rosteri (etenkin hyökkäys), kliinisten viimeistelijöiden puute, ei varaa loukkaantumisille |
| 16 | Sport | 1395 | Ennakkoluulottomuus, altavastaajan rooli, vastustajien mahdollinen aliarviointi | Liigan heikoimpia materiaaleja, paljon "palkkasotureita", maalivahtiosasto epävarma (Ortio/Härkönen) |
| 17 | Jukurit | 1380 | Altavastaajan mentaliteetti, pääsee pelaamaan ilman paineita | Materiaali Liigan heikoin, kapea rosteri, putoamisuhka vakava |

**Lähtö-Elo** on yllä olevan taulukon oma sarake, ja putki käyttää sitä sellaisenaan.
Nykyiset luvut on tuotettu kaavalla `1500 + ((9 − sija) / 8) × 120` (askel 15 pistettä
per sija), mutta kaava ei sido: sarakkeen luvun voi asettaa käsin, ja juuri se päätyy
kortille. Jos sarake puuttuu tai on kelvoton (haitarin 1000–2000 ulkopuolella), Elo
johdetaan sijasta kuten ennen (`eloFromRank`).

Luku korvautuu oikeilla otteluilla heti kun niitä on (`season-elo.ts`); tämä on vain
lähtöpiste, ja kortti merkitsee sen *lähtötasoksi* eikä mittaukseksi.
