import { describe, it, expect } from 'vitest';
import { attachNews, Article, MatchNewsInput } from '../ingest/news-football.js';
import { classifyByKeywords, affectsModel, LAMBDA_DELTA, MODEL_IMPACT_THRESHOLD } from '../engine/nlp-football.js';
import { ExtractedEvent } from '../engine/nlp.js';

const NOW = new Date('2026-08-14T12:00:00.000Z');

function article(overrides: Partial<Article> & { title: string }): Article {
  return {
    url: `https://example.com/${encodeURIComponent(overrides.title)}`,
    source: 'Testilähde',
    publishedAt: '2026-08-14T10:00:00.000Z',
    text: overrides.text ?? overrides.title,
    sport: 'football' as const,
    ...overrides,
  };
}

const MATCHES: MatchNewsInput[] = [
  {
    matchId: 'm1',
    league: 'Veikkausliiga',
    home: { name: 'HJK Helsinki', short: 'HJK', color: '#000' },
    away: { name: 'FF Jaro', short: 'JAR', color: '#fff' },
  },
  {
    matchId: 'm2',
    league: 'Veikkausliiga',
    home: { name: 'FC Inter Turku', short: 'INT', color: '#000' },
    away: { name: 'AC Oulu', short: 'ACO', color: '#fff' },
  },
];

describe('Uutisten liittäminen otteluihin', () => {
  it('liittää uutisen oikealle ottelulle', async () => {
    const result = await attachNews(MATCHES, [article({ title: 'HJK voitti selvästi kotonaan' })], NOW);
    expect(result.get('m1')!.news).toHaveLength(1);
    expect(result.get('m2')!.news).toHaveLength(0);
  });

  it('merkitsee kumpaa joukkuetta uutinen koskee', async () => {
    const result = await attachNews(MATCHES, [article({ title: 'AC Oulu vahvisti kokoonpanoaan' })], NOW);
    expect(result.get('m2')!.news[0].team).toBe('AC Oulu');
  });

  it('sama uutinen voi liittyä useaan otteluun jos se mainitsee molemmat', async () => {
    const result = await attachNews(MATCHES, [article({ title: 'HJK ja AC Oulu kärkitaistossa' })], NOW);
    expect(result.get('m1')!.news).toHaveLength(1);
    expect(result.get('m2')!.news).toHaveLength(1);
  });

  it('ei liitä uutista jossa ei mainita kumpaakaan joukkuetta', async () => {
    const result = await attachNews(MATCHES, [article({ title: 'Arsenal voitti Chelsean' })], NOW);
    expect(result.get('m1')!.news).toHaveLength(0);
    expect(result.get('m2')!.news).toHaveLength(0);
  });

  it('hylkää yli 72 tuntia vanhat jutut', async () => {
    const old = article({ title: 'HJK voitti', publishedAt: '2026-08-10T10:00:00.000Z' });
    const result = await attachNews(MATCHES, [old], NOW);
    expect(result.get('m1')!.news).toHaveLength(0);
  });

  it('rajaa uutiset viiteen per ottelu', async () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      article({ title: `HJK uutinen ${i}`, publishedAt: `2026-08-14T0${i}:00:00.000Z` })
    );
    const result = await attachNews(MATCHES, many, NOW);
    expect(result.get('m1')!.news).toHaveLength(5);
  });

  it('järjestää uutiset uusin ensin', async () => {
    const items = [
      article({ title: 'HJK vanhempi', publishedAt: '2026-08-14T08:00:00.000Z' }),
      article({ title: 'HJK uudempi', publishedAt: '2026-08-14T11:00:00.000Z' }),
    ];
    const result = await attachNews(MATCHES, items, NOW);
    expect(result.get('m1')!.news[0].title).toBe('HJK uudempi');
  });

  it('vahva osuma ei jää heikon alle rajauksessa', async () => {
    // 5 heikkoa osumaa vanhemmalla aikaleimalla + 1 vahva uudempi.
    // Vahva pitää päästä mukaan vaikka heikkoja on rajan verran.
    const weak = Array.from({ length: 5 }, (_, i) =>
      article({
        title: `Inter jatkaa Veikkausliigassa ${i}`,
        publishedAt: `2026-08-14T0${i}:00:00.000Z`,
      })
    );
    const strong = article({ title: 'FC Inter Turku vahvisti hankinnan', publishedAt: '2026-08-13T23:00:00.000Z' });
    const result = await attachNews(MATCHES, [...weak, strong], NOW);
    const titles = result.get('m2')!.news.map((n) => n.title);
    expect(titles).toContain('FC Inter Turku vahvisti hankinnan');
  });

  it('jääkiekkojuttu kaikkien lajien syötteestä ei liity jalkapallo-otteluun', async () => {
    const hockey = article({
      title: 'HJK:n kiekkojoukkue voitti',
      text: 'HJK:n kiekkojoukkue voitti. SM-liigan ottelussa nähtiin ylivoimamaali.',
      sport: 'any' as const,
    });
    const result = await attachNews(MATCHES, [hockey], NOW);
    expect(result.get('m1')!.news).toHaveLength(0);
  });

  it('tyhjä juttulista ei kaadu', async () => {
    const result = await attachNews(MATCHES, [], NOW);
    expect(result.get('m1')!.news).toHaveLength(0);
    expect(result.get('m1')!.newsWindow).toBe(false);
  });

  it('jokaiselle ottelulle syntyy tulos vaikka uutisia ei löydy', async () => {
    const result = await attachNews(MATCHES, [], NOW);
    expect(result.size).toBe(2);
    expect(result.get('m1')).toBeDefined();
    expect(result.get('m2')).toBeDefined();
  });
});

describe('Avainsanaluokittelu', () => {
  it('tunnistaa loukkaantumisen suomesta ja englannista', () => {
    expect(classifyByKeywords('Avainpelaaja loukkaantui harjoituksissa', 'HJK')?.event_type).toBe('injury');
    expect(classifyByKeywords('Striker ruled out with a knock', 'HJK')?.event_type).toBe('injury');
  });

  it('tunnistaa pelikiellon ja valmentajavaihdon', () => {
    expect(classifyByKeywords('Pelaaja sai punaisen kortin ja pelikiellon', 'HJK')?.event_type).toBe('suspension');
    expect(classifyByKeywords('Päävalmentaja erotettiin', 'HJK')?.event_type).toBe('manager_change');
  });

  it('palauttaa null kun avainsanoja ei ole', () => {
    expect(classifyByKeywords('Ottelu päättyi tasapeliin', 'HJK')).toBeNull();
  });

  it('avainsanaluokittelun varmuus EI ylitä mallin kynnystä', () => {
    // Tämä on olennainen turvaraja: avainsanaosuma ei ymmärrä kontekstia,
    // joten se ei saa koskaan säätää maaliodotusta
    for (const text of [
      'Avainpelaaja loukkaantui pahasti ja on sivussa kuukausia',
      'Punainen kortti ja pelikielto',
      'Päävalmentaja erotettiin välittömästi',
      'Pelaaja siirtyy toiseen seuraan',
      'Kokoonpano muuttuu',
    ]) {
      const event = classifyByKeywords(text, 'HJK');
      expect(event, text).not.toBeNull();
      expect(event!.confidence).toBeLessThan(MODEL_IMPACT_THRESHOLD);
      expect(affectsModel(event!)).toBe(false);
    }
  });

  it('merkitsee selvästi ettei erittely ole LLM:n tekemä', () => {
    expect(classifyByKeywords('Pelaaja loukkaantui', 'HJK')!.impact).toContain('avainsanoista');
  });
});

describe('Mallivaikutuksen kynnys', () => {
  const event = (type: string, confidence: number): ExtractedEvent => ({
    event_type: type,
    team: 'HJK',
    player: '',
    confidence,
    impact: '',
    game_ref: null,
  });

  it('korkean varmuuden loukkaantuminen vaikuttaa malliin', () => {
    expect(affectsModel(event('injury', 0.85))).toBe(true);
  });

  it('matalan varmuuden tapahtuma ei vaikuta', () => {
    expect(affectsModel(event('injury', 0.6))).toBe(false);
  });

  it('kynnys on tasan mukaan lukien', () => {
    expect(affectsModel(event('injury', MODEL_IMPACT_THRESHOLD))).toBe(true);
  });

  it('tapahtumatyyppi jolla ei ole λ-korjausta ei vaikuta', () => {
    expect(affectsModel(event('hot_streak', 0.95))).toBe(false);
    expect(affectsModel(event('other', 0.95))).toBe(false);
  });

  it('kaikki λ-korjaukset ovat negatiivisia ja maltillisia', () => {
    // Uutinen voi kertoa puuttuvasta pelaajasta; se laskee maaliodotusta.
    // Yli 15 %:n korjaus yhdestä uutisesta olisi liikaa.
    for (const [type, delta] of Object.entries(LAMBDA_DELTA)) {
      expect(delta, type).toBeLessThan(0);
      expect(delta, type).toBeGreaterThan(-0.15);
    }
  });
});
