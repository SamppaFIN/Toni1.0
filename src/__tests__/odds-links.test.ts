// Tiketti #54: Syvälinkit toimiston kupongille
//
// The Odds APIn `includeLinks` palauttaa linkin kolmella tasolla. Testit
// lukitsevat kaksi asiaa:
//   1. tarkin taso voittaa — käyttäjä viedään lähimmäs vetoa
//   2. vain https kelpaa — kertoimet tulevat ulkoisesta rajapinnasta, ja
//      javascript:-URL kortilla olisi XSS-vektori

import { describe, it, expect } from 'vitest';
import { bestLink } from '../ingest/odds-football.js';

const EVENT = { link: 'https://book.example/event/123' };
const BOOK = { link: 'https://book.example/' };
const MARKET = { link: 'https://book.example/event/123/1x2' };

describe('bestLink', () => {
  it('markkinataso voittaa tapahtuma- ja toimistotason', () => {
    expect(bestLink(EVENT, BOOK, MARKET)).toBe(MARKET.link);
  });

  it('ilman markkinalinkkiä käytetään tapahtumalinkkiä', () => {
    expect(bestLink(EVENT, BOOK, {})).toBe(EVENT.link);
  });

  it('viimeisenä keinona toimiston oma linkki', () => {
    expect(bestLink({}, BOOK, {})).toBe(BOOK.link);
  });

  it('ilman mitään linkkiä palautetaan null — kortti putoaa karttaan', () => {
    expect(bestLink({}, {}, {})).toBeNull();
    expect(bestLink(null, null, null)).toBeNull();
    expect(bestLink(undefined, undefined, undefined)).toBeNull();
  });

  it('hylkää muun kuin https-protokollan', () => {
    for (const bad of ['javascript:alert(1)', 'http://insecure.example', 'data:text/html,x', '//protokollaton']) {
      expect(bestLink({ link: bad }, {}, {})).toBeNull();
    }
  });

  it('hylkää epämuotoisen arvon kaatumatta', () => {
    for (const bad of [123, {}, [], true, '']) {
      expect(bestLink({ link: bad }, {}, {})).toBeNull();
    }
  });

  it('turvallinen linkki menee läpi vaikka muut tasot olisivat roskaa', () => {
    expect(bestLink({ link: 'javascript:x' }, { link: null }, { link: MARKET.link })).toBe(MARKET.link);
  });
});
