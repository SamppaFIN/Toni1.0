// Tiketti #62: Pyyntojen tahdistus
//
// Tama estaa HILJAISEN vian: ilman tahdistusta 8 sarjaa tuottaa 16 pyyntoa
// football-data.orgin 10/min rajaa vastaan, ja ylimenevat sarjat putoavat
// market-only-tilaan ilman etta kukaan huomaa syyta.

import { describe, it, expect, vi } from 'vitest';
import { Throttle, withRetry, isRateLimit, sleep } from '../ingest/throttle.js';

describe('Throttle', () => {
  it('pitaa minimivalin pyyntojen valilla', async () => {
    const t = new Throttle(50, 'testi');
    const times: number[] = [];
    const start = Date.now();

    await Promise.all([1, 2, 3].map(() => t.run(async () => { times.push(Date.now() - start); })));

    expect(times).toHaveLength(3);
    // Toinen ja kolmas eivat saa lahtea heti
    expect(times[1]).toBeGreaterThanOrEqual(45);
    expect(times[2]).toBeGreaterThanOrEqual(95);
  });

  it('REGRESSIO: rinnakkaiset kutsut eivat ohita rajaa', async () => {
    // Ilman jonoa kaksi yhtaikaista kutsua nakisi saman last-arvon ja
    // lahtisi molemmat heti -- juuri se ylittaisi pyyntorajan
    const t = new Throttle(40, 'testi');
    const start = Date.now();
    await Promise.all([t.run(async () => 1), t.run(async () => 2)]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(35);
  });

  it('palauttaa funktion arvon', async () => {
    const t = new Throttle(1, 'testi');
    await expect(t.run(async () => 'tulos')).resolves.toBe('tulos');
  });

  it('virhe ei jumita jonoa', async () => {
    const t = new Throttle(1, 'testi');
    await expect(t.run(async () => { throw new Error('hajosi'); })).rejects.toThrow('hajosi');
    // Seuraava kutsu menee silti lapi
    await expect(t.run(async () => 'ok')).resolves.toBe('ok');
  });
});

describe('isRateLimit', () => {
  it('tunnistaa pyyntorajan', () => {
    expect(isRateLimit(new Error('football-data.org PL: 429 pyyntoraja ylittyi'))).toBe(true);
    expect(isRateLimit(new Error('pyyntöraja ylittyi'))).toBe(true);
  });

  it('EI tunnista muita virheita — 404 ei parane odottamalla', () => {
    expect(isRateLimit(new Error('404 Not Found'))).toBe(false);
    expect(isRateLimit(new Error('FOOTBALL_DATA_TOKEN puuttuu'))).toBe(false);
    expect(isRateLimit('ei virhe')).toBe(false);
    expect(isRateLimit(null)).toBe(false);
  });
});

describe('withRetry', () => {
  it('palauttaa heti onnistuessaan', async () => {
    const fn = vi.fn(async () => 'ok');
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('yrittaa uudelleen kun shouldRetry sallii', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw new Error('429 pyyntoraja');
      return 'vihdoin';
    });
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, shouldRetry: isRateLimit })).resolves.toBe('vihdoin');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('EI yrita uudelleen kun virhe ei ole pyyntorajasta', async () => {
    const fn = vi.fn(async () => { throw new Error('404 Not Found'); });
    await expect(withRetry(fn, { attempts: 3, baseDelayMs: 1, shouldRetry: isRateLimit })).rejects.toThrow('404');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('luovuttaa yritysten jalkeen ja heittaa viimeisen virheen', async () => {
    const fn = vi.fn(async () => { throw new Error('429 pyyntoraja'); });
    await expect(withRetry(fn, { attempts: 2, baseDelayMs: 1, shouldRetry: isRateLimit })).rejects.toThrow('429');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('sleep', () => {
  it('odottaa suunnilleen pyydetyn ajan', async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
});
