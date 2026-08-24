// Sulkeutumislinjan kynnys (tiketti #72)
//
// Ennen: kaksi havaintoa = CLV. Kaksi perakkaista workflow_dispatchia parin
// minuutin valein tuotti "sulkeutumislinjan" joka oli sama linja kahdesti.

import { describe, it, expect } from 'vitest';
import { buildTimelines, MIN_LINE_GAP_MINUTES } from './metrics.js';
import type { Snapshot, MatchCard } from '../types-football.js';

function card(id: string, kickoff: string): MatchCard {
  return { id, kickoff, home: { name: 'A' }, away: { name: 'B' } } as unknown as MatchCard;
}
function snap(generatedAt: string, matches: MatchCard[]) {
  return { file: generatedAt, snapshot: { generated_at: generatedAt, matches } as unknown as Snapshot };
}

const KICKOFF = '2026-08-24T18:00:00.000Z';

describe('buildTimelines — sulkeutumislinja', () => {
  it('yksi havainto ei ole sulkeutumislinja', () => {
    const tl = buildTimelines([snap('2026-08-24T08:00:00.000Z', [card('m1', KICKOFF)])]).get('m1')!;
    expect(tl.hasClosingLine).toBe(false);
    expect(tl.observations).toBe(1);
  });

  it('kaksi havaintoa 2 min valein EI ole sulkeutumislinja', () => {
    const tl = buildTimelines([
      snap('2026-08-24T08:00:00.000Z', [card('m1', KICKOFF)]),
      snap('2026-08-24T08:02:00.000Z', [card('m1', KICKOFF)]),
    ]).get('m1')!;
    expect(tl.observations).toBe(2);
    expect(tl.spanMinutes).toBe(2);
    expect(tl.hasClosingLine).toBe(false);
  });

  it('kuuden tunnin valein ON sulkeutumislinja', () => {
    const tl = buildTimelines([
      snap('2026-08-24T08:00:00.000Z', [card('m1', KICKOFF)]),
      snap('2026-08-24T14:00:00.000Z', [card('m1', KICKOFF)]),
    ]).get('m1')!;
    expect(tl.spanMinutes).toBe(360);
    expect(tl.hasClosingLine).toBe(true);
    expect(tl.closingLeadMinutes).toBe(240);
  });

  it('tasan kynnyksella kelpaa', () => {
    const tl = buildTimelines([
      snap('2026-08-24T08:00:00.000Z', [card('m1', KICKOFF)]),
      snap('2026-08-24T09:00:00.000Z', [card('m1', KICKOFF)]),
    ]).get('m1')!;
    expect(tl.spanMinutes).toBe(MIN_LINE_GAP_MINUTES);
    expect(tl.hasClosingLine).toBe(true);
  });

  it('vioittunut aikaleima ei tuota sulkeutumislinjaa', () => {
    const tl = buildTimelines([
      snap('ei-aikaleima', [card('m1', KICKOFF)]),
      snap('2026-08-24T14:00:00.000Z', [card('m1', KICKOFF)]),
    ]).get('m1')!;
    expect(tl.hasClosingLine).toBe(false);
  });

  it('kelvoton aloitusaika -> lead null, mutta linja voi silti olla', () => {
    const tl = buildTimelines([
      snap('2026-08-24T08:00:00.000Z', [card('m1', 'rikki')]),
      snap('2026-08-24T14:00:00.000Z', [card('m1', 'rikki')]),
    ]).get('m1')!;
    expect(tl.closingLeadMinutes).toBeNull();
    expect(tl.hasClosingLine).toBe(true);
  });

  it('span mitataan AVAUKSESTA eika edellisesta havainnosta', () => {
    const tl = buildTimelines([
      snap('2026-08-24T08:00:00.000Z', [card('m1', KICKOFF)]),
      snap('2026-08-24T08:02:00.000Z', [card('m1', KICKOFF)]),
      snap('2026-08-24T14:00:00.000Z', [card('m1', KICKOFF)]),
    ]).get('m1')!;
    expect(tl.spanMinutes).toBe(360);
    expect(tl.observations).toBe(3);
  });
});
