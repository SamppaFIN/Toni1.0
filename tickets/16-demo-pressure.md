# Tiketti #16: Demo UI — paine-mekaniikka

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Käyttäjä voi valita joukkueen joka "painaa päälle" — tämä muuttaa simulaation todennäköisyyksiä kyseisen joukkueen eduksi (+80 Elo-pistettä kotiedun lisäksi). Simuloi tilannetta jossa käyttäjällä on insider-tietoa joukkueen vireestä.

## Miten toteutettu
- `togglePressure(teamId)` — vaihtaa paineen päälle/pois
- Elo-kaavaan lisätään painekerroin (+80 kotijoukkueelle, -80 vierasjoukkueelle)
- Oranssi korostus aktiiviselle painevalinnalle
- localStorage-pohjainen pysyvyys

## Hyväksymiskriteerit
- [ ] Käyttäjä voi valita joukkueen joka 'painaa päälle'
- [ ] Valinta muuttaa simulaation todennäköisyyksiä
- [ ] Painevalinta näkyy visuaalisesti (oranssi korostus)
- [ ] Paineen voi poistaa klikkaamalla uudelleen

## Tiedostot
- `public/demo.html`
