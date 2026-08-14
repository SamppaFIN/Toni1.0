// Tiketti #24: Vastausten kätkentä levylle
//
// Sarjataulukko muuttuu vain ottelupäivinä ja football-data.orgin ilmaistaso
// sallii 10 pyyntöä minuutissa. Kätkentä pitää kehityssyklin nopeana ja
// suojaa pyyntörajalta kun putkea ajetaan toistuvasti.
//
// Kätkö on .cache/-hakemistossa joka on gitignoressa: se on paikallista
// välimuistia, ei projektin dataa. public/data/ on se joka committoidaan.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const DEFAULT_TTL_MS = Number(process.env.CACHE_TTL_MINUTES || 720) * 60_000; // 12 h

interface CacheEntry<T> {
  cached_at: string;
  data: T;
}

/** Ohita kätkö kokonaan: CACHE_DISABLED=1 */
function cacheDisabled(): boolean {
  return process.env.CACHE_DISABLED === '1';
}

function cachePath(key: string): string {
  // Avaimesta tiedostonimi — vain turvalliset merkit
  return path.join(CACHE_DIR, `${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

export function readCache<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  if (cacheDisabled()) return null;

  const file = cachePath(key);
  if (!existsSync(file)) return null;

  try {
    const entry = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry<T>;
    const age = Date.now() - Date.parse(entry.cached_at);
    if (!Number.isFinite(age) || age > ttlMs) return null;
    return entry.data;
  } catch {
    // Rikkinäinen kätkötiedosto ei ole virhe — haetaan vain uudelleen
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  if (cacheDisabled()) return;
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const entry: CacheEntry<T> = { cached_at: new Date().toISOString(), data };
  writeFileSync(cachePath(key), JSON.stringify(entry), 'utf8');
}

/** Hae kätköstä tai suorita fetch ja kätke tulos */
export async function cached<T>(key: string, fetcher: () => Promise<T>, ttlMs = DEFAULT_TTL_MS): Promise<T> {
  const hit = readCache<T>(key, ttlMs);
  if (hit !== null) {
    console.log(`[Cache] ${key} — osuma`);
    return hit;
  }
  const data = await fetcher();
  writeCache(key, data);
  return data;
}
