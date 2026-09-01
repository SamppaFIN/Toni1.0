// Tiketti #103: kausiennakko luetaan DOKUMENTISTA eikä koodista
//
// Tärkein lukittava asia: dokumentti ja kortti näyttävät SAMAN LUVUN. Jos
// nämä eriytyvät, käyttäjä lukee ennakosta 1620 ja kortilta jotain muuta —
// ja juuri se oli se vika joka tässä korjattiin.

import { describe, it, expect } from 'vitest';
import {
  parsePreview,
  parsePreviewSource,
  parsePreviewTable,
  splitNotes,
  loadLiigaPreview,
  MIN_PREVIEW_TEAMS,
} from '../analyze/liiga-preview.js';
import { priorEloMap, priorFor, previewFor, previewSource, normalizeLiigaName } from '../analyze/liiga-priors.js';

const TAULUKKO = `
**Lähde:** Testiennakko — Liiga 2026-27
<https://example.test/ennakko> (luettu 2026-09-01)

| Sija | Joukkue | Lähtö-Elo | Vahvuudet | Haitat / riskit |
|---|---|---|---|---|
| 1 | Tappara | 1620 | Valmennus, terävä kärki (Blichfeld, Rautiainen) | Keskikaista epävarma |
| 2 | Ilves | 1605 | Hyökkäys, yhteishenki | Maalivahdit (Armalis/Rifalk), erikoistilanteet |
| 3 | JYP | 1590 | Tulivoima | Puolustus |
`;

describe('splitNotes — sulkeiden sisällä oleva pilkku ei ole erotin', () => {
  it('säilyttää sulkeissa olevan luettelon yhtenä kohtana', () => {
    expect(splitNotes('terävä kärki (Blichfeld, Rautiainen), vahva ylivoima')).toEqual([
      'terävä kärki (Blichfeld, Rautiainen)',
      'vahva ylivoima',
    ]);
  });

  it('viiva tarkoittaa "ei mainintaa" eikä kohtaa', () => {
    expect(splitNotes('—')).toEqual([]);
    expect(splitNotes('')).toEqual([]);
  });

  it('pilkkoo myös puolipisteellä', () => {
    expect(splitNotes('a; b')).toEqual(['a', 'b']);
  });
});

describe('parsePreviewTable', () => {
  const teams = parsePreviewTable(TAULUKKO);

  it('lukee kaikki rivit sijajärjestyksessä', () => {
    expect(teams.map((t) => t.team)).toEqual(['Tappara', 'Ilves', 'JYP']);
  });

  it('LÄHTÖ-ELO LUETAAN TAULUKOSTA, ei johdeta sijasta', () => {
    expect(teams.map((t) => t.elo)).toEqual([1620, 1605, 1590]);
  });

  it('plussat ja miinukset erikseen listana', () => {
    expect(teams[1].strengths).toEqual(['Hyökkäys', 'yhteishenki']);
    expect(teams[1].weaknesses).toEqual(['Maalivahdit (Armalis/Rifalk)', 'erikoistilanteet']);
  });

  it('otsikko- ja erotinrivi eivät päädy dataksi', () => {
    expect(teams.every((t) => Number.isInteger(t.rank))).toBe(true);
    expect(teams.some((t) => t.team === 'Joukkue')).toBe(false);
  });

  it('kelvoton Elo -> null eikä roskaluku malliin', () => {
    const [t] = parsePreviewTable('| 1 | X | 16200 | a | b |');
    expect(t.elo).toBeNull();
  });

  it('sama sija kahdesti ei tuota kahta riviä', () => {
    const rows = parsePreviewTable('| 1 | A | 1500 | a | b |\n| 1 | B | 1400 | c | d |');
    expect(rows).toHaveLength(1);
  });

  it('taulukon ulkopuolinen teksti ohitetaan', () => {
    expect(parsePreviewTable('Pelkkää tekstiä ilman taulukkoa')).toEqual([]);
  });
});

describe('parsePreviewSource', () => {
  it('poimii nimen, osoitteen ja lukupäivän', () => {
    expect(parsePreviewSource(TAULUKKO)).toEqual({
      name: 'Testiennakko — Liiga 2026-27',
      url: 'https://example.test/ennakko',
      readAt: '2026-09-01',
    });
  });

  it('puuttuva lähde ei kaada — tuntematon on rehellisempi kuin keksitty', () => {
    const s = parsePreviewSource('| 1 | A | 1500 | a | b |');
    expect(s.url).toBeNull();
    expect(s.readAt).toBeNull();
  });
});

describe('oikea ennakkodokumentti (data/liiga-kausiennakko-2026-27.md)', () => {
  const preview = loadLiigaPreview();

  it('on luettavissa ja kattaa koko sarjan', () => {
    expect(preview).not.toBeNull();
    expect(preview!.teams.length).toBeGreaterThanOrEqual(MIN_PREVIEW_TEAMS);
    expect(preview!.teams).toHaveLength(17);
  });

  it('jokaisella joukkueella on lähtö-Elo, plussia ja miinuksia', () => {
    for (const t of preview!.teams) {
      expect(t.elo, `${t.team}: lähtö-Elo puuttuu`).not.toBeNull();
      expect(t.strengths.length, `${t.team}: ei vahvuuksia`).toBeGreaterThan(0);
      expect(t.weaknesses.length, `${t.team}: ei heikkouksia`).toBeGreaterThan(0);
    }
  });

  it('sijaluvut ovat täydellinen permutaatio 1–17', () => {
    expect(preview!.teams.map((t) => t.rank)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  });
});

describe('dokumentti ohjaa Elo-karttaa', () => {
  const elo = priorEloMap();
  const preview = loadLiigaPreview()!;

  it('KARTAN LUKU ON DOKUMENTIN LUKU — ei johdettu', () => {
    for (const t of preview.teams) {
      expect(elo.get(normalizeLiigaName(t.team))?.elo, t.team).toBe(t.elo);
    }
  });

  it('sija tulee ennakosta, muutos on nolla koska kausi ei ole alkanut', () => {
    expect(elo.get('tappara')).toEqual({ elo: 1620, change: 0, rank: 1 });
    expect(elo.get('jukurit')).toEqual({ elo: 1380, change: 0, rank: 17 });
  });

  it('kartta kattaa kaikki 17 joukkuetta', () => {
    expect(elo.size).toBe(17);
  });
});

describe('priorFor lukee ennakon dokumentista', () => {
  it('antaa lähtö-Elon ja nostot listana', () => {
    const k = priorFor('Kärpät')!;
    expect(k.elo).toBe(1560);
    expect(k.rank).toBe(5);
    expect(k.strengths).toContain('eliittimaalivahti Rubin');
    expect(k.weaknesses).toContain('valtavat odotukset');
  });

  it('teksti on dokumentin muodossa — ei koodin ääkkösettömänä', () => {
    // Koodin varaluvut kirjoitettiin ilman ääkkösiä; dokumentti ei ole.
    // Jos tämä hajoaa, priori on pudonnut takaisin koodiin.
    expect(priorFor('Tappara')!.strengths.join(' ')).toMatch(/ä/);
  });

  it('Veikkauksen "K-Espoo" osuu ennakon "Kiekko-Espooseen"', () => {
    expect(priorFor('K-Espoo')?.team).toBe('Kiekko-Espoo');
    expect(previewFor('K-Espoo')?.rank).toBe(15);
  });

  it('tuntematon joukkue -> null', () => {
    expect(priorFor('Frölunda')).toBeNull();
  });
});

describe('lähdeviite', () => {
  it('tulee dokumentista', () => {
    const s = previewSource();
    expect(s.name).toContain('Ristikaksi');
    expect(s.url).toContain('ristikaksi.com');
    expect(s.readAt).toBe('2026-09-01');
  });
});

describe('rikkinäinen dokumentti', () => {
  it('liian harva rivi hylätään kokonaan — puolikas taulukko on vaarallisin', () => {
    // Osittain jäsentynyt taulukko antaisi osalle joukkueista lähtö-Elon ja
    // osalle ei, ja ero näkyisi kortilla mielivaltaisena.
    expect(parsePreview('| 1 | A | 1500 | a | b |').teams.length).toBeLessThan(MIN_PREVIEW_TEAMS);
  });

  it('olematon tiedosto -> null eikä poikkeus', () => {
    expect(loadLiigaPreview('ei-ole-olemassa-12345.md')).toBeNull();
  });
});
