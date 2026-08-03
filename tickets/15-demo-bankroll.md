# Tiketti #15: Demo UI — vedonlyöntikassa ja hallinta

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Käyttäjä hallinnoi virtuaalista vedonlyöntikassaansa (alku 100 €). Voi tallettaa ja nostaa varoja modaalin kautta. Vedonlyönti vähentää kassasta, voitot lisäävät.

## Miten toteutettu
- Yläpalkin kassanäyttö (vihreä/punainen värjäys)
- Talletus-/nostomodali
- localStorage-pohjainen pysyvyys
- Automaattinen päivitys vetojen ratkettua

## Hyväksymiskriteerit
- [ ] Kassa näkyy yläpalkissa (alkusaldo 100 €)
- [ ] Talletus- ja nostomodaali (+/- napit)
- [ ] Vedonlyönti vähentää kassasta, voitot lisäävät
- [ ] Kassan tila säilyy localStoragessa

## Tiedostot
- `public/demo.html`
