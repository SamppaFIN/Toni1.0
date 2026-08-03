# Tiketti #13: Demo UI — interaktiivinen vetolappu

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Käyttäjä voi selata tulevia otteluita ja lyödä vetoa 1X2-markkinalle suoraan demo-käyttöliittymässä. Panos vähennetään virtuaalikassasta.

## Miten toteutettu
- Odds-napit jokaiselle ottelulle (1/X/2)
- `prompt()` panoksen syöttöön (demo-yksinkertaisuus)
- `localStorage`-pohjainen pysyvä tila
- Vetolappu-välilehti näyttää avoimet vedot

## Hyväksymiskriteerit
- [ ] Käyttäjä voi valita ottelun ja lyödä vetoa (1X2)
- [ ] Panoksen syöttö ja validointi (ei yli kassan)
- [ ] Vetolappu näyttää avoimet vedot ja mahdollisen voiton
- [ ] Vedot tallentuvat localStorageen

## Tiedostot
- `public/demo.html`
