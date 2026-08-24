// Telegram-halytykset jalkapallosta (tiketti #73)
//
// Painopiste on siina MITA EI SAA HALYTTAA: sama kohde kahdesti, alkanut
// ottelu, keksitty data. Vaarin lahetetty halytys on pahempi kuin lahettamatta
// jaanyt, koska se opettaa kayttajan hiljentamaan botin.

import { describe, it, expect } from 'vitest';
import { alertKey, pendingAlerts, pruneSent, ALERT_FLAG } from './football-alerts.js';
import type { Snapshot, MatchCard, EdgeRow } from '../types-football.js';
import { join } from 'node:path';

const NOW = new Date('2026-08-24T12:00:00.000Z');
const LATER = '2026-08-24T18:00:00.000Z';
const PAST = '2026-08-24T09:00:00.000Z';

function edge(over: Partial<EdgeRow> = {}): EdgeRow {
  return { side: 'home', odds: 2.5, odds_effective: 2.5, book: 'Pinnacle', model_prob: 0.5,
    implied_prob: 0.4, edge: 0.06, flag: 'strong', kelly_fraction: 0.02, stake_suggestion: 2, ...over } as EdgeRow;
}
function match(id: string, kickoff: string, edges: EdgeRow[]): MatchCard {
  return { id, kickoff, home: { name: 'Arsenal' }, away: { name: 'Chelsea' },
    analysis: { edges, news_window: false, bankroll_basis: 100 } } as unknown as MatchCard;
}
function snap(matches: MatchCard[], source = 'live'): Snapshot {
  return { source, matches } as unknown as Snapshot;
}

describe('pendingAlerts', () => {
  it('vahva lippu halyttaa', () => {
    const p = pendingAlerts(snap([match('m1', LATER, [edge()])]), {}, NOW);
    expect(p).toHaveLength(1);
    expect(p[0].edge.flag).toBe(ALERT_FLAG);
  });

  it('kandidaatti (3 %) EI halyta', () => {
    expect(pendingAlerts(snap([match('m1', LATER, [edge({ flag: 'candidate' })])]), {}, NOW)).toHaveLength(0);
  });

  it('liputtamaton EI halyta', () => {
    expect(pendingAlerts(snap([match('m1', LATER, [edge({ flag: 'none' })])]), {}, NOW)).toHaveLength(0);
  });

  it('jo alkanut ottelu EI halyta', () => {
    expect(pendingAlerts(snap([match('m1', PAST, [edge()])]), {}, NOW)).toHaveLength(0);
  });

  it('jo lahetetty EI halyta uudelleen', () => {
    const m = match('m1', LATER, [edge()]);
    const key = alertKey(m, m.analysis.edges[0]);
    expect(pendingAlerts(snap([m]), { [key]: NOW.toISOString() }, NOW)).toHaveLength(0);
  });

  it('sama kohde PAREMMALLA hinnalla on uusi tilaisuus', () => {
    const first = match('m1', LATER, [edge({ odds: 2.5 })]);
    const state = { [alertKey(first, first.analysis.edges[0])]: NOW.toISOString() };
    const better = match('m1', LATER, [edge({ odds: 2.9 })]);
    expect(pendingAlerts(snap([better]), state, NOW)).toHaveLength(1);
  });

  it('mikroliike samassa hinnassa EI halyta uudelleen', () => {
    const first = match('m1', LATER, [edge({ odds: 2.501 })]);
    const state = { [alertKey(first, first.analysis.edges[0])]: NOW.toISOString() };
    const same = match('m1', LATER, [edge({ odds: 2.504 })]);
    expect(pendingAlerts(snap([same]), state, NOW)).toHaveLength(0);
  });

  it('eri kohde samassa ottelussa halyttaa erikseen', () => {
    const m = match('m1', LATER, [edge({ side: 'home' }), edge({ side: 'away' })]);
    expect(pendingAlerts(snap([m]), {}, NOW)).toHaveLength(2);
  });

  it('puuttuva analyysi ei kaada', () => {
    const broken = { id: 'm1', kickoff: LATER, home: { name: 'A' }, away: { name: 'B' } } as unknown as MatchCard;
    expect(pendingAlerts(snap([broken]), {}, NOW)).toHaveLength(0);
  });
});

describe('pruneSent', () => {
  it('alkaneen ottelun avain poistuu', () => {
    const kept = pruneSent({ 'm1|home|2.50': NOW.toISOString() }, [match('m1', PAST, [])], NOW);
    expect(Object.keys(kept)).toHaveLength(0);
  });

  it('tulevan ottelun avain sailyy', () => {
    const kept = pruneSent({ 'm1|home|2.50': NOW.toISOString() }, [match('m1', LATER, [])], NOW);
    expect(Object.keys(kept)).toHaveLength(1);
  });

  it('kadonneen ottelun avain poistuu', () => {
    expect(Object.keys(pruneSent({ 'm9|home|2.50': NOW.toISOString() }, [], NOW))).toHaveLength(0);
  });
});

describe('alertKey', () => {
  it('erottaa kohteen, puolen ja hinnan', () => {
    const m = match('m1', LATER, [edge()]);
    expect(alertKey(m, m.analysis.edges[0])).toBe('m1|home|2.50');
  });
});

// runAlerts koskee levya, joten se testataan vaikeampaa reittia. Nama kaksi
// tapausta ovat silti tarkeimmat: kumpikaan ei saa lahettaa mitaan.
describe('runAlerts — vaitilanteet', () => {
  it('puuttuva today.json ei kaada eika laheta', async () => {
    const { runAlerts } = await import('./football-alerts.js');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'bt-alerts-'));
    expect(await runAlerts(dir, NOW)).toBe(0);
  });

  it('source=mock EI laheta vaikka vahvoja lippuja olisi', async () => {
    const { runAlerts } = await import('./football-alerts.js');
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const dir = mkdtempSync(join(tmpdir(), 'bt-alerts-'));
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(
      join(dir, 'data', 'today.json'),
      JSON.stringify(snap([match('m1', LATER, [edge()])], 'mock'))
    );
    expect(await runAlerts(dir, NOW)).toBe(0);
  });
});
