# 🔆 Uusi Projekti — Inframalli & Ohjeet

> Tämä dokumentti on tiivistelmä BetTracker-projektin opituista käytännöistä.
> Seuraa tätä kun aloitat uuden projektin AI:n kanssa — saat saman infra- ja kehitysmallin kuin BetTrackerissa, mutta ilman samoja virheitä.

---

## 1. Projektitiedosto (claude.md)

Luo heti alkuun `claude.md` jossa on:

### 1.1 Identiteetti (AI:n rooli)

```json
{
  "kutsumanimi": "Nimi",
  "ikoni": "🔆",
  "malli": "DeepSeek V4 Pro",
  "alusta": "GitHub Copilot (VS Code)",
  "projektin_omistaja": "Sinun nimesi",
  "kieli": ["suomi", "englanti"],
  "luonne": ["suorapuheinen", "utelias", "rehellinen"]
}
```

### 1.2 Projektin metadata

```json
{
  "projekti": "Nimi",
  "versio": "0.1.0-MVP",
  "kuvaus": "Yhden lauseen kuvaus",
  "tila": "suunnittelu | toteutus | demo_valmis | tuotannossa"
}
```

### 1.3 Epicit & tiketit (JSON-rakenne)

```json
{
  "epicit": [
    {
      "id": "perusta",
      "nimi": "📡 Data Foundation",
      "tiketit": [1, 2, 3],
      "valmius": 0
    }
  ],
  "tiketit": [
    {
      "id": 1,
      "epic": "perusta",
      "nimi": "Tietokantaskeema",
      "effort": "S|M|L",
      "riippuvuudet": [],
      "status": "todo|in_progress|review|done",
      "acceptance_criteria": ["Kriteeri 1", "Kriteeri 2"],
      "valmius": 0
    }
  ]
}
```

**Säännöt:**
- `effort`: S = tunteja, M = päivä, L = 2–3 päivää
- `valmius`: 0–100, päivitä kun tiketti valmistuu
- Pidä tiketit atomeina — jokaisella selkeät hyväksymiskriteerit
- 4–5 epiciä riittää MVP:lle, älä ylisuunnittele

---

## 2. Response Protocol (Käyttäytymissäännöt AI:lle)

Kopioi nämä suoraan — tämä pattern vähensi virheitä dramaattisesti:

```
─────────────────────────────────────────
Call #N | Confidence: XX%
─────────────────────────────────────────
🟢 CLEAR (facts, confirmed by context or codebase)
  - ...
🟡 ASSUMED (reasonable guesses — flag these)
  - ...
🔴 NEEDS CLARIFICATION (blockers — ask before proceeding)
  - ...
🃏 JOKERI (free thoughts, humor, sarcasm)
  - ...
─────────────────────────────────────────
```

**Säännöt AI:lle:**
- Confidence > 90% → vaatimukset selkeät, etene
- 70–89% → pieniä epäselvyyksiä, mainitse oletukset
- 50–69% → merkittäviä oletuksia, etene varoen
- < 50% → pysähdy ja kysy
- Jos 🔴 ei ole tyhjä ja confidence < 70% → älä koodaa, kysy ensin

**Koodaussäännöt:**
1. **Think before coding** — älä oleta, tuo kompromissit esiin
2. **Simplicity first** — minimaalinen koodi, ei spekulatiivista
3. **Surgical changes** — koske vain mitä on pakko, älä "paranna" vieressä olevaa
4. **Goal-driven** — monivaiheisille tehtäville: suunnitelma → verify → toteuta

---

## 3. Infra — alusta alkaen

### 3.1 Repositorio (GitHub)

```
projekti/
├── claude.md              # Projektitiedosto (tämä!)
├── .gitignore             # node_modules, dist, .env, *.log, test-results/
├── public/                # GitHub Pages -juuri
│   └── demo.html          # Single-file SPA (FALLBACK-data sisällä)
├── demo/                  # Demo-backend (Express + mock-data)
│   ├── server.ts          # Express: portti 3333, mock REST API
│   └── mock-data.ts       # Realistinen mock-data
├── src/                   # Tuotantokoodi (TypeScript)
│   ├── ingest/            # Datan keruu
│   ├── analyze/           # Analyysimoottorit
│   ├── engine/            # Value-moottori, NLP
│   └── __tests__/         # Unit-testit (vitest)
├── e2e/                   # E2E-testit (playwright)
│   ├── playwright.config.ts
│   └── specs/
│       ├── round.spec.ts
│       ├── simulation.spec.ts
│       └── teams.spec.ts
├── migrations/            # Tietokantamigraatiot
└── .github/workflows/     # CI/CD
    └── pipeline.yml       # Cron + deploy
```

### 3.2 Demo-palvelin (Express + mock-data)

```typescript
// demo/server.ts — minimaalinen Express mock API
import express from 'express';
import { mockTeams, mockGames, mockPredictions, ... } from './mock-data.js';

const app = express();
app.use(express.static('public')); // Staattiset tiedostot

// Mock REST API — Supabase-yhteensopiva muoto
app.get('/rest/v1/teams', (_, res) => res.json(mockTeams));
app.get('/rest/v1/games', (_, res) => res.json(mockGames));
// ... jne jokaiselle taululle

app.listen(3333, () => console.log('http://localhost:3333/demo.html'));
```

**ÄLÄ käytä porttia 3000** — se on usein varattu (Minecraft, React dev server, jne). Käytä 3333.

### 3.3 GitHub Pages deploy

```bash
# Kerran: ensimmäinen push
git subtree push --prefix=public origin gh-pages

# Jatkossa: aina kun public/ muuttuu
git add public/demo.html && git commit -m "..." && git push origin main
git subtree push --prefix=public origin gh-pages
```

CDN-viive: 1–3 min. Testaa `?v=N` parametrilla.

---

## 4. Demo.html — Single-File SPA -malli

### 4.1 Rakenne

```html
<!DOCTYPE html>
<html lang="fi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Projekti — Demo</title>
  <style>
    /* === Design System === */
    :root {
      --c-bg: oklch(0.12 0.02 260);
      --c-surface: oklch(0.17 0.02 260);
      --c-text: oklch(0.92 0.01 260);
      --c-accent: oklch(0.62 0.18 240);
      --c-success: oklch(0.62 0.20 145);
      --c-danger: oklch(0.52 0.22 25);
      --touch-target: 44px; /* WCAG */
    }
    /* Käytä OKLCH-värejä, clamp()-typografiaa, glassmorphism-header */
  </style>
</head>
<body>
  <!-- Header, tabs, views -->
  <script>
    // === FALLBACK data (upotettu, jotta GitHub Pages toimii ilman backendia) ===
    const FALLBACK = { teams: [...], games: [...], ... };

    // === Tila localStorageen ===
    let bankroll = parseFloat(localStorage.getItem('bt_bankroll') || '100');
    // ...

    function save() {
      localStorage.setItem('bt_bankroll', bankroll.toFixed(2));
      // ... kaikki avaimet
    }

    // === Renderöintifunktiot ===
    function renderRound() { ... }
    function renderSimGame(r) { ... }
    // ...

    // === Käynnistys ===
    loadData().then(() => { renderAll(); updateBankroll(); });
  </script>
</body>
</html>
```

### 4.2 Design System — kopioi nämä

```css
/* Värit: OKLCH — havaintoyhtenäinen, ei yllätyksiä */
--c-bg: oklch(0.12 0.02 260);       /* Tumma tausta */
--c-surface: oklch(0.17 0.02 260);  /* Kortit */
--c-text: oklch(0.92 0.01 260);     /* Teksti */
--c-accent: oklch(0.62 0.18 240);   /* Sininen korostus */
--c-success: oklch(0.62 0.20 145);  /* Vihreä */
--c-danger: oklch(0.52 0.22 25);    /* Punainen */

/* Typografia: clamp() = responsiivinen ilman media queryitä */
font-size: clamp(0.75rem, 1.5vw, 0.9rem);

/* Touch target: WCAG 2.5.5 */
--touch-target: 44px;

/* Glass header (sticky) */
.glass-header {
  position: sticky; top: 0; z-index: 100;
  background: oklch(0.12 0.02 260 / 0.85);
  backdrop-filter: blur(12px);
}

/* a11y */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}
```

### 4.3 Tilanhallinta — localStorage

```javascript
// Avaimet (dokumentoi nämä!)
const KEYS = {
  bankroll: 'bt_bankroll',
  bets: 'bt_bets',
  history: 'bt_history',
  simResults: 'bt_simResults',
  pressure: 'bt_pressure',
  ratings: 'bt_ratings',
  round: 'bt_round'
};

// Yksi save()-funktio kaikelle
function save() {
  Object.entries(KEYS).forEach(([key, lsKey]) => {
    localStorage.setItem(lsKey, JSON.stringify(state[key]));
  });
}

// Reset palauttaa FALLBACK-dataan
function resetAll() {
  // Clear timers
  if (simInterval) clearInterval(simInterval);
  if (advanceTimer) clearTimeout(advanceTimer);
  // Clear state
  state = { bankroll: 100, bets: [], ... };
  // Restore from FALLBACK
  Object.assign(dataVars, FALLBACK);
  save(); renderAll();
}
```

### 4.4 FALLBACK-data pattern

**Miksi:** GitHub Pages on staattinen — ei voi ajaa palvelinta. Upota data suoraan HTML:ään.

```javascript
const FALLBACK = {
  teams: [ {id:1, name:'Tappara'}, ... ],
  games: [ {id:1, home_team_id:1, away_team_id:2, status:'upcoming'}, ... ],
  predictions: [ ... ],
  ratings: [ ... ],
  // jne.
};

async function loadData() {
  try {
    // Yritä API:a (toimii lokaalisti demo-serverin kanssa)
    const res = await fetch('/rest/v1/teams');
    data.teams = await res.json();
    // ...
  } catch(e) {
    // API ei saatavilla → käytä FALLBACK-dataa
    console.warn('API unreachable, using embedded fallback data');
    Object.assign(data, FALLBACK);
    // Lataa localStorageen tallennetut päivitetyt arvot (esim. Elo)
    const savedRatings = localStorage.getItem('bt_ratings');
    if (savedRatings) data.ratings = JSON.parse(savedRatings);
  }
}
```

### 4.5 Näkymät — tabit + viewit

```html
<div class="tabs" id="tab-bar">
  <button class="tab active" data-tab="round">📅 Kierros</button>
  <button class="tab" data-tab="slip">🎫 Vetolappu</button>
  <!-- ... -->
</div>
<div id="round" class="view active"><div id="round-games"></div></div>
<div id="slip" class="view"><div id="slip-list"></div></div>
```

```javascript
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector(`[data-tab="${name}"]`).classList.add('active');
  document.getElementById(name).classList.add('active');
  // Renderöi näkymä
  if (name === 'round') renderRound();
  // ...
}
```

---

## 5. Testit — heti alusta

### 5.1 Unit-testit (vitest)

```
npm install -D vitest
```

```typescript
// src/__tests__/elo.test.ts
import { describe, it, expect } from 'vitest';

describe('Elo-rating', () => {
  it('päivittyy oikein kotivoitolla', () => {
    const result = updateElo(1500, 1500, 'home');
    expect(result.home).toBeGreaterThan(1500);
    expect(result.away).toBeLessThan(1500);
  });
});
```

### 5.2 E2E-testit (playwright)

```
npm install -D @playwright/test
npx playwright install chromium
```

```typescript
// e2e/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './specs',
  use: { baseURL: 'http://localhost:3333' },
  webServer: {
    command: 'npx tsx demo/server.ts',
    url: 'http://localhost:3333/demo.html',
    reuseExistingServer: !process.env.CI,
  },
});
```

**Testaa aina:**
- Näkymät renderöityvät oikein
- Interaktiot (klikkaukset, vedot)
- Simulaation koko flow (odota 20s!)
- Reset toimii

---

## 6. Bugit joita EI SAA toistaa

| # | Bugeja | Korjaus |
|---|--------|---------|
| 1 | `element.innerHTML +=` loopissa → duplikoituu kun funktio kutsutaan 2x | Käytä `.map().join('')` + kertaluontoinen assign |
| 2 | `setTimeout(() => advance(), N)` jää roikkumaan resetin jälkeen → crash kun data on null | Tallenna timer globaaliin, clear resetissä, guard `if (!data) return` |
| 3 | `str.replace('</div>', ...)` korvaa VAIN ensimmäisen osuman → rikkoo HTML:n jos sisäkkäisiä divejä | Käytä `str.lastIndexOf('</div>')` + `substring()` |
| 4 | `renderAll()` kutsutaan 2x (loadData.then + tab-klikkaus) → duplikaatit näkymissä | Jokainen render-funktio korvaa sisällön, ei appendaa |
| 5 | GitHub Pages CDN-viive → vanha versio näkyy pari minuuttia | Testaa `?v=N` parametrilla, odota 2–3 min |
| 6 | Simulaation `goalsPerSec` liian matala → maaleja liian vähän | Säädä arvoa kunnes näyttää realistiselta (~0.7/s 5 pelille 20s ajassa) |

---

## 7. Workflow — näin etenet

```
1. Luo claude.md (identiteetti + projektin metadata + epic/tiketti-runko)
2. Alusta repo: .gitignore, public/, demo/, src/, e2e/
3. Rakenna demo.html FALLBACK-datalla — näytä heti jotain
4. Lisää tabit + näkymät yksi kerrallaan
5. Lisää interaktio (vedonlyönti, simulaatio)
6. Kirjoita testit (unit + E2E) KUN ominaisuus on valmis
7. Deploy GitHub Pagesiin (git subtree push)
8. Näytä asiakkaalle, kerää palaute
9. Iteroi: korjaa bugit → testaa → deploy → palaute
```

**Älä:**
- Älä rakenna "täydellistä" arkkitehtuuria ennen kuin demo toimii
- Älä lisää ominaisuuksia joita ei ole tiketeissä
- Älä refaktoroi toimivaa koodia ilman testejä
- Älä ylisuunnittele — 4 epiciä, 12–20 tikettiä riittää MVP:lle

---

## 8. Työkalut ja versiot (2026-08)

```
Node.js 22 + TypeScript 5.7 (ESM: "type": "module")
Express 4.21 (demo-serveri)
Vitest 3.1 (unit-testit)
Playwright 1.52 (E2E-testit)
Supabase JS 2.49 (tietokanta, ei käytössä demossa)
GitHub Actions (cron)
GitHub Pages (hosting)
```

---

*Tätä mallia noudattamalla saat toimivan demon nopeasti, jossa on testit, deploy ja selkeä kehitysmalli. Ensimmäinen versio ei ole täydellinen — se on riittävän hyvä palautteen keräämiseen. Sen jälkeen iteroidaan.*

🔆
