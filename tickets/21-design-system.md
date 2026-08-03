# Tiketti #21: UI/UX Design System — Moderni mobile-first käyttöliittymä

**Epic:** 🎮 Interactive Demo
**Status:** 🔜 todo

## Design-periaatteet (lähde: AI-Koulu ui/ux/01-hcd + 02-visual-trends)

### HCD — Ihmiskeskeinen suunnittelu
- **Persona:** Vedonlyöjä-Matti (32v), tarkistaa kertoimet kännykällä lounastauolla
- **Käyttäjäpolku:** Avaa sovellus → selaa tulevaa kierrosta → lyö veto → katso tulokset
- **Esteettömyys:** WCAG 2.2 AA-taso, prefers-reduced-motion, riittävät kontrastit
- **Perusperiaate:** "You are not your user" — testaa oikeilla käyttäjillä

### Värit — OKLCH-avaruus
```css
--color-bg: oklch(0.12 0.02 260);        /* Tumma tausta */
--color-surface: oklch(0.18 0.02 260);    /* Korttipinta */
--color-text: oklch(0.92 0.01 260);       /* Leipäteksti */
--color-accent: oklch(0.65 0.18 240);     /* Primäärikorostus (sininen) */
--color-success: oklch(0.65 0.22 145);    /* Vihreä (voitto) */
--color-danger: oklch(0.55 0.25 25);      /* Punainen (häviö) */
--color-warning: oklch(0.75 0.18 85);     /* Keltainen (varoitus) */
```

### Typografia — Fluid clamp()
- `h1: clamp(1.5rem, 5vw, 2.5rem)` — Sivun otsikko, weight 800
- `h2: clamp(1.1rem, 3vw, 1.5rem)` — Korttiotsikko, weight 700
- `body: clamp(0.875rem, 1.5vw, 1rem)` — Leipäteksti, weight 400
- `small: clamp(0.7rem, 1vw, 0.8rem)` — Apumetateksti, weight 400

### Liike ja animaatio
- **Mikrovuorovaikutukset:** Button hover `translateY(-2px)`, card hover nosto
- **Sivusiirtymät:** Tab-vaihto fade-in (200ms ease)
- **Toast-notifikaatiot:** Slide-up alhaalta (300ms ease-out)
- **Prefers-reduced-motion:** Kunnioita käyttöjärjestelmän asetusta

### Tilallinen suunnittelu
- **Elevaatio:** Kortit `box-shadow` 3 tasoa (default, hover, active)
- **Glassmorphism:** Headeriin `backdrop-filter: blur(12px)` (harkiten)
- **Z-index:** Sticky header (100), Modal (1000), Toast (9999)

### Komponenttikirjasto
| Komponentti | Ominaisuudet |
|---|---|
| `.card` | `border-radius: clamp(10px, 2vw, 16px)`, glass-border, hover-elevaatio |
| `.btn` | 3 varianttia (primary/success/danger), `min-height: 44px` (touch target) |
| `.tab` | Horisontaalinen scroll mobiililla, aktiivinen indikaattori |
| `.badge` | 4 väriä (vihreä/keltainen/punainen/harmaa), pyöristetty |
| `.modal` | Keskitetty, backdrop-blur, escape sulkee |
| `.toast` | Alareunaan, automaattinen poisto 2s |

### Responsiivisuus
- **Mobile-first:** Suunnittele 375px leveydelle ensin
- **Breakpointit:** `max-width: 500px` (phone), `500-768px` (tablet), `768px+` (desktop)
- **Touch-targetit:** Kaikki interaktiiviset elementit väh. `44×44px`

### Team logo -systeemi
- CSS-pohjaiset väriympyrät (ei kuvatiedostoja)
- Jokaiselle Liiga-joukkueelle oma brand-väri
- Alkukirjain + taustaväri = tunnistettava logo

## Hyväksymiskriteerit
- [ ] OKLCH-värit käytössä koko UI:ssa
- [ ] Fluid typografia clamp()-funktioilla
- [ ] Mikrovuorovaikutukset napeissa ja korteissa
- [ ] prefers-reduced-motion kunnioitettu
- [ ] Touch-targetit ≥ 44px mobiililla
- [ ] Glassmorphism-header
- [ ] WCAG AA -kontrastit (väh. 4.5:1 tekstille)

## Tiedostot
- `public/demo.html` (CSS-muuttujat + komponenttityylit)
- `tickets/21-design-system.md` (tämä tiedosto)
