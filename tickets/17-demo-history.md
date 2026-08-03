# Tiketti #17: Demo UI — historia-sivu ja ROI-seuranta

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Historia-välilehdellä käyttäjä näkee kaikki ratkenneet vedot (✅ voitot, ❌ häviöt). Näkyvissä on ROI-prosentti, kokonaistulos euroina, osumaprosentti ja panoshistoria.

## Miten toteutettu
- `betHistory`-array localStorageen
- Historia-metrics: vetoja yhteensä, osumia, tulos (€), ROI %
- Käänteinen aikajärjestys (uusin ensin)
- Jokaisesta vedosta: kohde, tulos, panos, kerroin, voitto/tappio

## Hyväksymiskriteerit
- [ ] Historia-välilehti näyttää kaikki ratkenneet vedot
- [ ] Voitetut/hävityt vedot merkattu ✅/❌
- [ ] ROI-% laskettu (tuotto/panokset × 100)
- [ ] Kokonaistulos euroina näkyvissä

## Tiedostot
- `public/demo.html`
