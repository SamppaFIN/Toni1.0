# Tiketti #19: Info-sivu — käyttöohje uudelle käyttäjälle

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Info-välilehti selittää järjestelmän peruskäytön uudelle käyttäjälle: mitä value-flagit tarkoittavat, miten Elo/PDO/z-score toimii, miten demoa käytetään. Toimii sekä ensikertalaisen oppaana että myyntimateriaalina asiakkaalle.

## Miten toteutettu
- Info-välilehti demo.html:ssä
- Kansantajuinen selitys: edge > 3 % = ylikerroin, PDO > 102 = ylisuorittaa
- Demo-ohje: "Valitse ottelu → lyö veto → käynnistä simulaatio → katso tulokset"
- Vinkit value-vedonlyönnin perusteisiin

## Hyväksymiskriteerit
- [ ] Info-välilehti kertoo järjestelmän peruskäytön
- [ ] Selittää value-flagien merkityksen (edge > 3% / > 5 %)
- [ ] Selittää Elo/PDO/z-score -mittarit kansantajuisesti
- [ ] Ohjeet demo-simulaation käyttöön

## Tiedostot
- `public/demo.html`
