// Tiketti #33: Mittarinäkymä
//
// Kaksi periaatetta ohjaa tätä näkymää:
//
//   1. Yksikään luku ei esiinny ilman vertailukohtaa. "Brier 0.58" on
//      tulkitsematon; "malli 0.58, markkina 0.61, arvaus 0.67" kertoo jotain.
//
//   2. Kun otos on liian pieni, se sanotaan ISOLLA eikä pienellä alaviitteellä.
//      Kolmen ottelun tarkkuusluku näyttää mittarilta muttei ole mittari, ja
//      siihen luottaminen on pahempaa kuin ei mittaria lainkaan.
//
// Simuloidut tulokset esitetään erikseen ja aina merkittynä. Ne eivät koskaan
// summaudu oikeiden tulosten kanssa.

import { esc, pct, num, relativeAge } from './snapshot.js';

const SIM_RESULTS_KEY = 'bt_sim_results';

let metrics = null;
let loadError = null;

export async function load(url = 'data/metrics.json') {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      loadError = `Mittaritiedostoa ei löytynyt (HTTP ${res.status}). Aja \`npm run metrics\`.`;
      return null;
    }
    metrics = await res.json();
    loadError = null;
    return metrics;
  } catch (err) {
    loadError = `Mittarien lataus epäonnistui: ${err.message}`;
    return null;
  }
}

/** Vertailurivi: malli, markkina ja vertailuarvo rinnakkain */
function comparisonRow(label, model, market, reference, options = {}) {
  const { lowerIsBetter = false, format = (v) => num(v, 3), referenceLabel = 'arvaus' } = options;

  const verdict = () => {
    if (model === null || market === null) return '';
    const modelBetter = lowerIsBetter ? model < market : model > market;
    return modelBetter
      ? '<span style="color:var(--c-success);font-weight:700">malli edellä</span>'
      : '<span style="color:var(--c-text-muted)">markkina edellä</span>';
  };

  return `<div style="padding:5px 0;border-bottom:1px dashed oklch(1 1 0/0.08)">
    <div class="row" style="font-size:.68rem">
      <span>${esc(label)}</span>
      <span>${verdict()}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;font-size:.65rem;margin-top:3px;text-align:center">
      <div><div style="color:var(--c-text-muted);font-size:.58rem">malli</div><b>${model === null ? '—' : format(model)}</b></div>
      <div><div style="color:var(--c-text-muted);font-size:.58rem">markkina</div><b>${market === null ? '—' : format(market)}</b></div>
      <div><div style="color:var(--c-text-muted);font-size:.58rem">${esc(referenceLabel)}</div><span style="color:var(--c-text-muted)">${reference === null ? '—' : format(reference)}</span></div>
    </div>
  </div>`;
}

function sampleWarning(sample) {
  if (sample.sufficient) {
    return `<div style="font-size:.62rem;color:var(--c-success);margin-top:4px">✓ ${sample.matched} ratkennutta ottelua — otos riittää suuntaa antavaan tulkintaan.</div>`;
  }
  return `<div style="margin-top:6px;padding:7px;border-radius:6px;background:oklch(0.72 0.16 85 / 0.16);font-size:.65rem;line-height:1.55">
    <b>⚠️ Otos on liian pieni: ${sample.matched} / ${sample.minimum} ottelua.</b><br>
    Alla olevat luvut ovat kohinaa. Ne täyttyvät itsestään kun cron kerää dataa
    kahdesti vuorokaudessa ja otteluita ratkeaa. Älä tee päätöksiä näiden perusteella.
  </div>`;
}

function clvSection(clv) {
  if (!clv.summary.count) {
    return `<div style="font-size:.65rem;color:var(--c-text-muted);padding:7px;background:oklch(1 1 0/0.04);border-radius:6px;line-height:1.55">
      CLV:tä ei ole vielä laskettavissa. Se vaatii että sama ottelu on havaittu vähintään
      kahdesti (avaus- ja sulkeutumislinja) <b>ja</b> että malli oli liputtanut siitä kohteen.
      Tällä hetkellä value-lippuja ei ole syntynyt — markkina on ollut tiukka.
      <br><br>
      <b>Tämä on tärkein yksittäinen mittari, kun se alkaa täyttyä.</b> CLV vertaa saatua hintaa
      markkinan lopulliseen reiluun hintaan, eikä se tarvitse ottelutuloksia lainkaan: kymmenen
      ottelun tulokset ovat kohinaa, mutta kymmenen ottelun CLV kertoo jo osuuko malli
      hinnoitteluvirheisiin. Systemaattisesti positiivinen CLV → tuotto seuraa perässä.
      Negatiivinen → voitollinen jakso oli tuuria.
    </div>`;
  }

  const avg = clv.summary.average;
  const color = avg > 0 ? 'var(--c-success)' : 'var(--c-danger)';

  return `<div style="padding:7px;background:oklch(1 1 0/0.04);border-radius:6px">
    <div class="row" style="font-size:.7rem">
      <span>Keskimääräinen CLV</span>
      <b style="color:${color}">${avg >= 0 ? '+' : ''}${(avg * 100).toFixed(2)} %</b>
    </div>
    <div class="row" style="font-size:.66rem;color:var(--c-text-muted);margin-top:2px">
      <span>Voitti sulkeutumislinjan</span><span>${pct(clv.summary.beatRate, 0)} (${clv.summary.count} valintaa)</span>
    </div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:5px;line-height:1.55">
      CLV vertaa saatua hintaa markkinan lopulliseen reiluun hintaan. <b>Tämä on tärkein
      yksittäinen mittari</b>, koska se ei tarvitse ottelutuloksia: kymmenen ottelun tulokset
      ovat kohinaa, mutta kymmenen ottelun CLV kertoo jo osuuko malli hinnoitteluvirheisiin.
      Systemaattisesti positiivinen CLV → tuotto seuraa perässä. Negatiivinen → voitollinen
      jakso oli tuuria.
    </div>
  </div>`;
}

function calibrationSection(buckets) {
  const withData = buckets.filter((b) => b.count > 0);
  if (!withData.length) {
    return `<div style="font-size:.65rem;color:var(--c-text-muted)">Ei vielä havaintoja.</div>`;
  }

  return `<div>
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-bottom:4px">
      Kun malli sanoo 70 %, tapahtuuko se oikeasti 70 % ajasta?
    </div>
    ${withData
      .map((b) => {
        const gap = b.observed - b.predicted;
        const width = Math.round(b.predicted * 100);
        const obsWidth = Math.round(b.observed * 100);
        return `<div style="margin:4px 0">
          <div class="row" style="font-size:.6rem;color:var(--c-text-muted)">
            <span>${(b.from * 100).toFixed(0)}–${(b.to * 100).toFixed(0)} %</span>
            <span>ennustettu ${pct(b.predicted, 0)} · toteutui ${pct(b.observed, 0)} <span style="color:${Math.abs(gap) < 0.1 ? 'var(--c-success)' : 'var(--c-warning)'}">${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(0)} pp</span> · n=${b.count}</span>
          </div>
          <div style="display:flex;gap:2px;height:5px;margin-top:2px">
            <div style="width:${width}%;background:var(--c-accent);border-radius:2px" title="ennustettu"></div>
          </div>
          <div style="display:flex;gap:2px;height:5px;margin-top:1px">
            <div style="width:${obsWidth}%;background:var(--c-success);border-radius:2px" title="toteutui"></div>
          </div>
        </div>`;
      })
      .join('')}
  </div>`;
}

function blendSection(cal, current) {
  if (!cal.best) {
    return `<div style="font-size:.65rem;color:var(--c-text-muted)">
      Blend-painon kalibrointi vaatii ratkenneita otteluita. Käytössä oleva paino: <b>${current}</b>.
    </div>`;
  }

  const differs = Math.abs(cal.best.weight - current) > 0.05;

  return `<div>
    <div class="row" style="font-size:.68rem">
      <span>Käytössä</span><b>${current}</b>
    </div>
    <div class="row" style="font-size:.68rem">
      <span>Data ehdottaa</span><b style="color:${differs ? 'var(--c-warning)' : 'var(--c-success)'}">${cal.best.weight}</b>
    </div>
    <div class="row" style="font-size:.64rem;color:var(--c-text-muted)">
      <span>Brier ehdotetulla</span><span>${num(cal.best.brier, 3)}</span>
    </div>
    ${
      cal.sufficientSample
        ? differs
          ? `<div style="font-size:.62rem;color:var(--c-warning);margin-top:4px">Ero on merkittävä. Painon voi säätää ympäristömuuttujalla <code>MODEL_BLEND_WEIGHT</code>.</div>`
          : `<div style="font-size:.62rem;color:var(--c-success);margin-top:4px">Käytössä oleva paino on lähellä optimia.</div>`
        : `<div style="font-size:.62rem;color:var(--c-danger);margin-top:4px">
            <b>Älä muuta painoa tämän perusteella.</b> Otos on liian pieni, ja pienellä otoksella
            viritetty paino on ylisovitettu — se selittää menneen eikä ennusta tulevaa.
          </div>`
    }
    <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:5px">
      Paino kertoo kuinka paljon oma maalimalli painaa markkinaa vasten. 0 = seuraa markkinaa,
      1 = luota pelkkään omaan malliin.
    </div>
  </div>`;
}

/** Simuloidut tulokset — omana osionaan, aina merkittynä */
function simulatedSection() {
  const sims = JSON.parse(localStorage.getItem(SIM_RESULTS_KEY) || '[]');
  const bets = JSON.parse(localStorage.getItem('bt_history') || '[]').filter((b) => b.simulated);

  if (!sims.length && !bets.length) {
    return `<div style="font-size:.65rem;color:var(--c-text-muted)">
      Et ole vielä ajanut simulaatiota. Käynnistä se yllä olevalla napilla.
    </div>`;
  }

  const hits = sims.filter((s) => s.outcome === s.predicted).length;
  const staked = bets.reduce((s, b) => s + b.stake, 0);
  const returned = bets.reduce((s, b) => s + (b.won ? b.stake * b.odds : 0), 0);
  const roi = staked > 0 ? (returned - staked) / staked : 0;

  return `<div>
    <div class="row" style="font-size:.68rem"><span>Simuloituja otteluita</span><b>${sims.length}</b></div>
    ${sims.length ? `<div class="row" style="font-size:.68rem"><span>Malli osui</span><b>${hits} / ${sims.length} (${pct(hits / sims.length, 0)})</b></div>` : ''}
    ${
      bets.length
        ? `<div class="row" style="font-size:.68rem"><span>Simuloituja vetoja</span><b>${bets.length}</b></div>
           <div class="row" style="font-size:.68rem"><span>Simuloitu ROI</span><b style="color:${roi >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${roi >= 0 ? '+' : ''}${(roi * 100).toFixed(1)} %</b></div>`
        : ''
    }
    <div style="margin-top:6px;padding:6px;border-radius:6px;background:oklch(0.72 0.16 85 / 0.14);font-size:.62rem;line-height:1.5">
      <b>Nämä luvut eivät kerro mallin laadusta mitään.</b> Simulaatio arpoo tulokset mallin
      omista todennäköisyyksistä, joten se on määritelmällisesti "oikeassa" mallin kanssa.
      Vain oikeat lopputulokset yllä mittaavat mallia.
    </div>
  </div>`;
}

function section(title, body) {
  return `<div class="card"><div style="font-size:.78rem;font-weight:700;margin-bottom:6px">${title}</div>${body}</div>`;
}

export function render(containerId = 'metrics-content') {
  const el = document.getElementById(containerId);
  if (!el) return;

  if (loadError || !metrics) {
    el.innerHTML = `${section(
      '📊 Mallin tarkkuus',
      `<div style="font-size:.68rem;color:var(--c-text-muted)">${esc(loadError ?? 'Mittareita ei ole vielä laskettu.')}</div>
       <div style="font-size:.65rem;color:var(--c-text-muted);margin-top:6px">
         Mittarit lasketaan komennolla <code style="color:var(--c-accent)">npm run metrics</code>,
         ja cron päivittää ne kahdesti vuorokaudessa.
       </div>`
    )}${section('🎲 Simuloitu (ei mittaa mallia)', simulatedSection())}`;
    return;
  }

  const m = metrics;
  const age = relativeAge(m.generated_at);

  el.innerHTML =
    section(
      '📊 Mallin tarkkuus oikeissa otteluissa',
      `<div style="font-size:.62rem;color:var(--c-text-muted)">Laskettu ${age} · ${m.sample.predictions} ottelua seurannassa, ${m.sample.results} tulosta kirjattu</div>
       ${sampleWarning(m.sample)}
       <div style="margin-top:8px">
         ${comparisonRow('Osumatarkkuus', m.accuracy.model.rate || null, m.accuracy.market.rate || null, 1 / 3, {
           format: (v) => pct(v, 1),
           referenceLabel: 'arvaus',
         })}
         ${comparisonRow('Brier score (pienempi parempi)', m.brier.model, m.brier.market, m.brier.uniform, {
           lowerIsBetter: true,
           referenceLabel: 'tasajako',
         })}
         ${comparisonRow('Log loss (pienempi parempi)', m.logLoss.model, m.logLoss.market, null, {
           lowerIsBetter: true,
           referenceLabel: '—',
         })}
       </div>
       <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:6px;line-height:1.55">
         Ennuste luetaan <b>avaushavainnosta</b>, ei sulkeutumislinjasta. Sulkeutumislinjaa vasten
         mittaaminen olisi itsepetosta: malli hyötyisi tiedosta joka syntyi vasta ennusteen jälkeen.
       </div>`
    ) +
    section('📈 Kalibrointi', calibrationSection(m.calibration)) +
    section('🎯 CLV — voitettiinko sulkeutumislinja', clvSection(m.clv)) +
    section(
      '💰 Paperitulos liputetuista kohteista',
      m.paperRoi.bets
        ? `<div class="row" style="font-size:.68rem"><span>Vetoja</span><b>${m.paperRoi.bets}</b></div>
           <div class="row" style="font-size:.68rem"><span>Osumia</span><b>${m.paperRoi.wins} (${pct(m.paperRoi.hitRate, 0)})</b></div>
           <div class="row" style="font-size:.68rem"><span>ROI</span><b style="color:${m.paperRoi.roi >= 0 ? 'var(--c-success)' : 'var(--c-danger)'}">${m.paperRoi.roi >= 0 ? '+' : ''}${(m.paperRoi.roi * 100).toFixed(1)} %</b></div>
           <div style="font-size:.6rem;color:var(--c-text-muted);margin-top:5px">1 yksikkö jokaiseen liputettuun kohteeseen avaushinnalla. Ei oikeaa rahaa.</div>`
        : `<div style="font-size:.65rem;color:var(--c-text-muted)">Liputettuja kohteita ei ole vielä ratkennut.</div>`
    ) +
    section('⚖️ Blend-painon kalibrointi', blendSection(m.blendCalibration, m.currentBlendWeight)) +
    section('🎲 Simuloitu (ei mittaa mallia)', simulatedSection());
}

window.BTM = { load, render };
