// Tiketti #105: kasisyotetyn ottelukontekstin tarkistus
//
// MIKSI TAMA ON OMA AJONSA: kasisyotetty tekija joka ei tasmaa yhteenkaan
// otteluun nayttaa TASAN SAMALTA kuin "tekijoita ei ollut". Kortti on
// molemmissa tapauksissa pelkistetty, eika lokiin tule virhetta — joten
// kirjoitusvirhe joukkuenimessa voisi elaa kierroksesta toiseen ilman etta
// kukaan huomaa mitaan.
//
// Sama syy kuin `odds:manual`-vaiheella kertoimille (#103). Ajo on ilmainen
// ja idempotentti: se ei hae mitaan verkosta eika kirjoita mitaan, se vain
// vertaa kasisyottoa kalenteriin ja kertoo mika tasmaa.
//
// Ajo: npm run context:check

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadContextFile, unmatchedContext, totalContextDelta, MAX_SIDE_DELTA } from '../ingest/context-manual.js';
import { FixturesFile } from './fixtures.js';

/** Kuinka pitkalle eteenpain kalenteria luetaan */
const HORIZON_DAYS = Number(process.env.CONTEXT_CHECK_HORIZON_DAYS || 7);

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');

  const file = loadContextFile();
  if (!file) {
    console.log('ℹ️  Kasin syotettya ottelukontekstia ei ole (data/ottelukonteksti-manual.json puuttuu tai ei kelpaa).');
    process.exit(0);
  }

  const calendar = JSON.parse(readFileSync(path.join(publicDir, 'data', 'fixtures.json'), 'utf8')) as FixturesFile;

  const now = Date.now();
  const until = now + HORIZON_DAYS * 86_400_000;
  const upcoming = calendar.matches.filter((m) => {
    const t = Date.parse(m.kickoff);
    return Number.isFinite(t) && t > now && t <= until;
  });

  const targets = upcoming.map((m) => ({
    sportKey: m.sport_key,
    kickoff: m.kickoff,
    home: { name: m.home },
    away: { name: m.away },
  }));

  console.log(`Kasisyotto: ${file.events.length} ottelua, syotetty ${file.source.entered_at}`);
  console.log(`Kalenterissa ${upcoming.length} alkamatonta ottelua seuraavan ${HORIZON_DAYS} vrk aikana.\n`);

  let matched = 0;
  let factors = 0;
  let capped = 0;

  for (const ev of file.events) {
    const hit = targets.find(
      (t) => t.sportKey === ev.sportKey && t.kickoff.slice(0, 10) === ev.date && t.home.name === ev.home && t.away.name === ev.away
    );
    // Nimet voivat erota valimerkeissa, joten tarkka vertailu EI riita
    // paatokseen — `unmatchedContext` kayttaa samaa normalisointia kuin
    // tuotantopolku. Tama silmukka on vain tulostusta varten.
    const dh = totalContextDelta(ev.factors, 'home');
    const da = totalContextDelta(ev.factors, 'away');
    const rajattu = Math.abs(dh) >= MAX_SIDE_DELTA || Math.abs(da) >= MAX_SIDE_DELTA;
    if (rajattu) capped++;

    factors += ev.factors.length;
    if (hit) matched++;

    const merkki = hit ? '✓' : '·';
    console.log(
      `${merkki} ${ev.date} ${(ev.home + ' – ' + ev.away).padEnd(44)} ${String(ev.factors.length).padStart(2)} tekijaa` +
        `  λ ${dh >= 0 ? '+' : ''}${(dh * 100).toFixed(0)} % / ${da >= 0 ? '+' : ''}${(da * 100).toFixed(0)} %` +
        `${rajattu ? '  ⚠️ KATTO' : ''}`
    );
    for (const f of ev.factors) {
      const eff = [f.delta_home ? `koti ${f.delta_home > 0 ? '+' : ''}${(f.delta_home * 100).toFixed(0)} %` : '', f.delta_away ? `vieras ${f.delta_away > 0 ? '+' : ''}${(f.delta_away * 100).toFixed(0)} %` : '']
        .filter(Boolean)
        .join(', ');
      console.log(`     ${f.type.padEnd(14)} ${f.label.padEnd(44)} ${eff || 'ei λ-vaikutusta'}`);
    }
  }

  const missed = unmatchedContext(targets, file);

  console.log(`\n${matched}/${file.events.length} ottelua tasmasi kalenteriin, ${factors} tekijaa yhteensa.`);
  if (capped) console.log(`⚠️  ${capped} ottelussa yhteisvaikutus osui kattoon ±${MAX_SIDE_DELTA * 100} % — osa tekijoista ei vaikuta taysimaaraisesti.`);

  if (missed.length) {
    console.log(`\n${missed.length} rivia ei tasmannyt yhteenkaan tulevaan otteluun:`);
    for (const m of missed) console.log(`   ${m.date} ${m.home} vs ${m.away}`);
    console.log('\nMennyt kierros on odotettu. Tulevan kierroksen rivi joka ei tasmaa on');
    console.log('kirjoitusvirhe joukkuenimessa — nimet on kirjoitettava KALENTERIN (ESPN) asussa.');
  } else {
    console.log('Yksikaan rivi ei jaanyt tasmaamatta.');
  }
}
