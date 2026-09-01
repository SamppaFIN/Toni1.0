// Vetojen ratkaisu oikeista tuloksista (tiketti #91)
//
// Rahaa liikkuu, joten painopiste on siina MITA EI SAA RATKAISTA. Vaarin
// ratkaistu veto siirtaa rahaa; auki jaanyt veto on pelkastaan rehellinen.

import { describe, it, expect, vi } from 'vitest';
// @ts-expect-error — selainmoduuli ilman tyyppejä
import { findResult, hasStarted, settleOpenBets } from '../../public/app/football-settle.js';

const ID = 'icehockey_liiga:2026-09-15:TAP-ILV';
const MENNYT = '2026-09-15T16:00:00.000Z';
const TULEVA = '2099-01-01T16:00:00.000Z';

const bet = (over: Record<string, unknown> = {}) => ({
  id: 1, game_id: ID, side: 'home', odds: 2.5, stake: 10,
  home: 'Tappara', away: 'Ilves', kickoff: MENNYT, ...over,
});

describe('findResult — lahdejarjestys', () => {
  const arkisto = [{ match_id: ID, result: { outcome: 'home', home_score: 3, away_score: 1 } }];
  const kalenteri = [{ match_id: ID, status: 'finished', home_score: 2, away_score: 2 }];
  const tulokset = [{ match_id: ID, outcome: 'away', home_score: 0, away_score: 4 }];

  it('arkisto voittaa muut — se on jo tulkittu 1X2:ksi', () => {
    const r = findResult(ID, { serverArchive: arkisto, calendar: kalenteri, results: tulokset });
    expect(r).toMatchObject({ outcome: 'home', label: '3–1', source: 'arkisto' });
  });

  it('ilman arkistoa kaytetaan kalenteria', () => {
    const r = findResult(ID, { calendar: kalenteri, results: tulokset });
    expect(r).toMatchObject({ outcome: 'draw', source: 'otteluohjelma' });
  });

  it('viimeisena results.json', () => {
    expect(findResult(ID, { results: tulokset })).toMatchObject({ outcome: 'away', source: 'tulospalvelu' });
  });

  it('tuntematon ottelu -> null', () => {
    expect(findResult('ei-tata', { serverArchive: arkisto })).toBeNull();
  });

  it('tyhjat lahteet -> null eika kaadu', () => {
    expect(findResult(ID, {})).toBeNull();
    expect(findResult(ID)).toBeNull();
  });

  it('KESKENERAINEN ottelu kalenterissa ei kelpaa tulokseksi', () => {
    const kesken = [{ match_id: ID, status: 'live', home_score: 1, away_score: 0 }];
    expect(findResult(ID, { calendar: kesken })).toBeNull();
  });

  it('tasapeli tunnistetaan omaksi tulokseksi', () => {
    expect(findResult(ID, { calendar: kalenteri })!.outcome).toBe('draw');
  });
});

describe('hasStarted', () => {
  it('mennyt aloitus on alkanut', () => {
    expect(hasStarted(bet(), Date.parse('2026-09-16T00:00:00Z'))).toBe(true);
  });

  it('tuleva aloitus EI ole alkanut', () => {
    expect(hasStarted(bet({ kickoff: TULEVA }), Date.now())).toBe(false);
  });

  it('puuttuva aloitusaika sallii ratkaisun — tulos on ainoa signaali', () => {
    expect(hasStarted(bet({ kickoff: undefined }), Date.now())).toBe(true);
  });
});

describe('settleOpenBets', () => {
  const arkisto = [{ match_id: ID, result: { outcome: 'home', home_score: 3, away_score: 1 } }];

  const bridge = (bets: unknown[]) => {
    const settle = vi.fn();
    return { bt: { getBets: () => bets, settleFootballBet: settle }, settle };
  };

  it('osunut veto ratkaistaan voitoksi', () => {
    const { bt, settle } = bridge([bet({ side: 'home' })]);
    const out = settleOpenBets({ serverArchive: arkisto }, { bt, now: Date.parse('2026-09-16') });
    expect(out.settled).toHaveLength(1);
    expect(settle).toHaveBeenCalledWith(1, true, '3–1', { simulated: false });
  });

  it('vaarin mennyt veto ratkaistaan havioksi', () => {
    const { bt, settle } = bridge([bet({ side: 'away' })]);
    settleOpenBets({ serverArchive: arkisto }, { bt, now: Date.parse('2026-09-16') });
    expect(settle).toHaveBeenCalledWith(1, false, '3–1', { simulated: false });
  });

  it('SIMULOIDUKSI EI MERKITA — tama on oikea tulos', () => {
    const { bt, settle } = bridge([bet()]);
    settleOpenBets({ serverArchive: arkisto }, { bt, now: Date.parse('2026-09-16') });
    expect(settle.mock.calls[0][3]).toEqual({ simulated: false });
  });

  it('ALKAMATONTA otteluta ei ratkaista vaikka tulos loytyisi', () => {
    // Tama olisi datavirhe, ja sen seuraus olisi rahan siirtyminen vaarin
    const { bt, settle } = bridge([bet({ kickoff: TULEVA })]);
    const out = settleOpenBets({ serverArchive: arkisto }, { bt, now: Date.now() });
    expect(settle).not.toHaveBeenCalled();
    expect(out.pending[0].why).toBe('ei ole alkanut');
  });

  it('ilman tulosta veto JAA AUKI ja syy kerrotaan', () => {
    const { bt, settle } = bridge([bet()]);
    const out = settleOpenBets({}, { bt, now: Date.parse('2026-09-16') });
    expect(settle).not.toHaveBeenCalled();
    expect(out.pending[0].why).toBe('tulosta ei ole viela julkaistu');
  });

  it('manuaalisesti ratkaistavat harjoituskohteet ohitetaan', () => {
    const { bt, settle } = bridge([bet({ manual: true })]);
    const out = settleOpenBets({ serverArchive: arkisto }, { bt, now: Date.parse('2026-09-16') });
    expect(settle).not.toHaveBeenCalled();
    expect(out.settled).toHaveLength(0);
    expect(out.pending).toHaveLength(0);
  });

  it('usea veto samasta ottelusta ratkeaa kaikki', () => {
    const { bt, settle } = bridge([bet({ id: 1, side: 'home' }), bet({ id: 2, side: 'away' })]);
    const out = settleOpenBets({ serverArchive: arkisto }, { bt, now: Date.parse('2026-09-16') });
    expect(out.settled).toHaveLength(2);
    expect(settle).toHaveBeenCalledTimes(2);
  });

  it('puuttuva silta ei kaada', () => {
    const out = settleOpenBets({}, { bt: null });
    expect(out.settled).toEqual([]);
    expect(out.reason).toBeTruthy();
  });

  it('tyhja vetolappu -> ei mitaan ratkaistavaa', () => {
    const { bt } = bridge([]);
    expect(settleOpenBets({ serverArchive: arkisto }, { bt }).settled).toEqual([]);
  });
});
