// .env-tiedoston lataus ilman riippuvuuksia.
//
// Node 20:ssä ei ole automaattista .env-latausta, ja `--env-file` vaatii
// lipun jokaiseen ajokomentoon. dotenv olisi 1 riippuvuus lisää 20 rivin takia.
// GitHub Actionsissa .env ei ole olemassa — silloin tämä ei tee mitään ja
// oikeat ympäristömuuttujat tulevat suoraan secretseistä.
//
// Olemassa olevia ympäristömuuttujia EI ylikirjoiteta: oikea env voittaa
// aina .env-tiedoston, muuten CI-ajo voisi vahingossa käyttää kehityskonfiguraatiota.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export function loadEnv(file = '.env'): void {
  const filePath = path.resolve(process.cwd(), file);
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // Poista mahdolliset lainausmerkit arvon ympäriltä
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) process.env[key] = value;
  }
}
