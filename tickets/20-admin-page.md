# Tiketti #20: Admin-sivu — API-konfiguraatio

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Admin-välilehdellä käyttäjä (tai ylläpitäjä) voi syöttää API-avaimet ja konfiguraatioasetukset: Supabase URL + anon key, Odds API key. Demo-tilassa arvot tallentuvat localStorageen. Tuotannossa arvot tulevat ympäristömuuttujista.

## Miten toteutettu
- Admin-välilehti demo.html:ssä (piilotettu normaalilta käyttäjältä? Vai avoin demossa)
- Lomakekentät: Supabase URL, Supabase anon key, Odds API key
- localStorage-tallennus
- "Testaa yhteys" -nappi (pingaa Supabasea)
- "Palauta oletusarvot" -nappi

## Hyväksymiskriteerit
- [ ] Admin-välilehti näyttää nykyiset API-asetukset
- [ ] Mahdollisuus syöttää Supabase URL + anon key
- [ ] Mahdollisuus syöttää Odds API key
- [ ] Asetukset tallentuvat localStorageen (demo-tilassa)

## Tiedostot
- `public/demo.html`
