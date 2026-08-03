# Tiketti #11: Web UI — GitHub Pages + Supabase JS

**Epic:** 📱 Delivery — Toimitus
**Status:** ✅ done

## Mitä käyttäjä voi tehdä
Käyttäjä voi selata BetTrackerin dashboardia mobiilioptimoidulla verkkosivulla. Kolme näkymää:
1. **💎 Value-flagit** — aktiiviset ylikertoimet, edge-prosentit ja markkinavertailu
2. **🎯 Ennusteet** — mallin otteluennusteet, osumatarkkuus ja todennäköisyydet
3. **📊 Joukkueet** — Elo-luvut ja PDO:t joukkueittain

Sivusto toimii GitHub Pagesissa ja lataa datan Supabasesta pelkällä luku-oikeudella.

## Miten toteutettu
- `public/index.html` — yksi staattinen tiedosto (SPA)
- Supabase JS client CDN:stä (`esm.sh`)
- CSS Grid / Flexbox, tumma teema, viewport meta → mobiili ensin
- Tab-navigaatio: value-flagit, ennusteet, joukkueet
- GitHub Pages deploy: `peaceiris/actions-gh-pages@v4` workflow'n lopussa

## Hyväksymiskriteerit
- [x] Staattinen SPA: index.html + app.js + Supabase CDN
- [x] Mobiilioptimoitu (viewport meta, CSS Grid/Flexbox)
- [x] Kolme näkymää: Value-flagit, Ennusteet + onnistumis-%, Joukkueet/pelaajat
- [x] Deploy GitHub Pagesiin (peaceiris/actions-gh-pages)

## Tiedostot
- `public/index.html`
