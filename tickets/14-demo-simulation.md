# Tiketti #14: Demo UI — pelipäiväsimulaatio

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Käyttäjä käynnistää "Start Simulation" -napilla koko pelipäivän simulaation. Kaikki upcoming-ottelut simuloidaan realistisilla tuloksilla (maalit, syöttäjät, jäähyt, ylivoimat).

## Miten toteutettu
- `simulateGame()` — Elo-pohjainen todennäköisyyssimulaatio
- Maalimäärät Liiga-keskiarvon mukaisia (~5.5/peli)
- Pelaajanimigeneraattori mock-datasta
- Jäähygeneraattori (koukkaaminen, kampitus jne.)
- PP/PK-tilastot per peli

## Hyväksymiskriteerit
- [ ] Start Simulation -nappi käynnistää kaikkien upcoming-pelien simuloinnin
- [ ] Simulaatio generoi realistiset maalimäärät
- [ ] Maalintekijät listataan pelaajanimillä
- [ ] Ylivoima/alivoima-tilastot näkyvät (PP/PK)
- [ ] Simulaation tulos ratkaisee avoimet vedot

## Tiedostot
- `public/demo.html`
