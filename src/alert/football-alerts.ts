// Tiketti #73: Telegram-hälytykset jalkapallon snapshotista
//
// Tiketti #9 rakensi Telegram-lähettimen jääkiekon ValueCheck-tyypille, mutta
// sitä ei koskaan kytketty mihinkään: koodi oli olemassa eikä ajanut. Tämä
// moduuli lukee today.json:in ja hälyttää vahvoista ylikertoimista.
//
// KAKSI ASIAA JOTKA PITÄÄ TEHDÄ OIKEIN, TAI HÄLYTYS ON HAITTA EIKÄ HYÖTY:
//
//   1. DEDUPLIKOINTI. Cron ajaa 2×/vrk. Ilman muistia sama kohde hälyttäisi
//      joka ajolla, ja kolmen päivän jälkeen käyttäjä hiljentäisi botin.
//      Tila pidetään public/data/alerts-sent.json:issa, joka committoidaan
//      muun datan mukana — GitHub Actions ei säilytä mitään ajojen välillä.
//
//   2. VANHENTUNEET AVAIMET SIIVOTAAN. Muuten tiedosto kasvaa rajatta.
//      Kickoffin jälkeen kohde ei voi enää hälyttää, joten se voi poistua.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { Snapshot, MatchCard, EdgeRow } from '../types-football.js';
import { sendTelegramAlert } from './telegram.js';

/** Vain vahva signaali hälyttää — 3 %:n kandidaatteja tulisi liikaa */
export const ALERT_FLAG = 'strong';

interface SentState {
  /** avain -> ISO-aika jolloin hälytettiin */
  [key: string]: string;
}

/**
 * Hälytysavain.
 *
 * Sisältää KERTOIMEN, koska sama kohde paremmalla hinnalla on uusi tilaisuus.
 * Pyöristys 2 desimaaliin estää sen että 2.501 → 2.502 laukaisisi uuden
 * hälytyksen samasta hinnasta.
 */
export function alertKey(match: MatchCard, edge: EdgeRow): string {
  return `${match.id}|${edge.side}|${edge.odds.toFixed(2)}`;
}

/** Poista avaimet joiden ottelu on jo alkanut */
export function pruneSent(state: SentState, matches: MatchCard[], now: Date): SentState {
  const live = new Set(
    matches.filter((m) => Date.parse(m.kickoff) > now.getTime()).map((m) => m.id)
  );
  const kept: SentState = {};
  for (const [key, at] of Object.entries(state)) {
    if (live.has(key.split('|')[0])) kept[key] = at;
  }
  return kept;
}

/** Kohteet jotka ansaitsevat hälytyksen ja joita ei ole vielä lähetetty */
export function pendingAlerts(
  snapshot: Snapshot,
  state: SentState,
  now: Date
): Array<{ match: MatchCard; edge: EdgeRow; key: string }> {
  const out: Array<{ match: MatchCard; edge: EdgeRow; key: string }> = [];

  for (const match of snapshot.matches) {
    // Alkanut ottelu ei ole enää vedonlyöntikohde
    if (!(Date.parse(match.kickoff) > now.getTime())) continue;

    for (const edge of match.analysis?.edges ?? []) {
      if (edge.flag !== ALERT_FLAG) continue;
      const key = alertKey(match, edge);
      if (state[key]) continue;
      out.push({ match, edge, key });
    }
  }
  return out;
}

const SIDE_LABEL: Record<string, string> = { home: 'KOTI', draw: 'TASAPELI', away: 'VIERAS' };

function label(match: MatchCard, edge: EdgeRow): string {
  const side = SIDE_LABEL[edge.side] ?? edge.side;
  const book = edge.book ? ` (${edge.book})` : '';
  return `${match.home.name} – ${match.away.name}\n${side}${book}`;
}

export async function runAlerts(publicDir: string, now = new Date()): Promise<number> {
  const snapshotPath = path.join(publicDir, 'data', 'today.json');
  if (!existsSync(snapshotPath)) {
    console.log('[Alerts] today.json puuttuu — ei hälytyksiä');
    return 0;
  }

  const snapshot: Snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));

  // Mock-data ei saa hälyttää. Keksitty kerroin näyttää oikealta puhelimessa.
  if (snapshot.source === 'mock') {
    console.log('[Alerts] source=mock — ei hälytyksiä keksitystä datasta');
    return 0;
  }

  const statePath = path.join(publicDir, 'data', 'alerts-sent.json');
  let state: SentState = {};
  if (existsSync(statePath)) {
    try {
      state = JSON.parse(readFileSync(statePath, 'utf8'));
    } catch {
      console.warn('[Alerts] alerts-sent.json vioittunut — aloitetaan tyhjästä');
    }
  }

  const pending = pendingAlerts(snapshot, state, now);
  console.log(`[Alerts] ${pending.length} uutta vahvaa ylikerrointa`);

  let sent = 0;
  for (const { match, edge, key } of pending) {
    const ok = await sendTelegramAlert({
      game: label(match, edge),
      market: '1X2',
      side: SIDE_LABEL[edge.side] ?? edge.side,
      edge: edge.edge,
      odds: edge.odds,
    });
    // Merkitse lähetetyksi VAIN onnistuneet — epäonnistunut yritetään uudelleen
    if (ok) {
      state[key] = now.toISOString();
      sent++;
    }
  }

  writeFileSync(
    statePath,
    JSON.stringify(pruneSent(state, snapshot.matches, now), null, 2) + '\n',
    'utf8'
  );
  console.log(`[Alerts] lähetetty ${sent}/${pending.length}`);
  return sent;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
  runAlerts(publicDir).catch((err) => {
    console.error('[Alerts]', err);
    process.exit(1);
  });
}
