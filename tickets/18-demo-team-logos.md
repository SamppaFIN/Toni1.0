# Tiketti #18: Demo UI — joukkueiden logot, nimet ja tunnusluvut

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Mitä käyttäjä voi tehdä
Kaikissa näkymissä joukkueet näkyvät nimillä (ei ID-numeroilla) ja CSS-pohjaisilla väriympyrälogoilla. Tulevan kierroksen sivu näyttää kaikki pelit kertoimineen, ennusteineen ja progress-palkkeineen.

## Miten toteutettu
- `teamColors`-objekti — jokaiselle Liiga-joukkueelle värikoodi
- `teamLogo()` — generoi CSS-ympyrän joukkueen alkukirjaimella
- `teamName(id)` — hakee nimen teams-taulusta
- Tulevan kierroksen näkymä: pelit + odds-napit + ennustepalkit

## Hyväksymiskriteerit
- [ ] Joukkueiden logot näkyvät värikoodattuina ympyröinä (CSS, ei kuvia)
- [ ] Joukkueiden nimet haetaan teams-taulusta (ei ID:t)
- [ ] Ennusteissa näkyy kertoimet ja mallin todennäköisyydet rinnakkain
- [ ] Tulevan kierroksen sivu näyttää kaikki pelit kertoimineen

## Tiedostot
- `public/demo.html`
