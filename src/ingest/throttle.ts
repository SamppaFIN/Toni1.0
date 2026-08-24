// Tiketti #62: Pyyntöjen tahdistus ulkoisille rajapinnoille
//
// MIKSI TÄMÄ ON OLEMASSA:
// football-data.orgin ilmaistaso sallii 10 pyyntöä minuutissa. Kahdella
// sarjalla se ei ollut ongelma (4 pyyntöä: 2 sarjaa × nykyinen + edellinen
// kausi), mutta kahdeksalla sarjalla pyyntöjä on 16 — selvästi yli rajan.
//
// Ilman tahdistusta seuraus olisi HILJAINEN: `fetchStatsFor` nappaa virheen ja
// pudottaa sarjan market-only-tilaan lokiviestillä. Putki ei kaatuisi, mutta
// puolet sarjoista menettäisi mallinsa eikä kukaan huomaisi syytä. Juuri sitä
// vikaluokkaa tämä projekti on toistuvasti joutunut jäljittämään.
//
// Ratkaisu on tarkoituksella yksinkertainen: minimietäisyys pyyntöjen välillä
// plus uudelleenyritys 429:llä. Liukuva ikkuna sallisi purskeet ja olisi
// tehokkaampi, mutta se on myös vaikeampi todentaa oikeaksi — ja tässä
// ajetaan cronia jolla on aikaa.

/** Yhden rajapinnan tahdistin. Jaettu kaikkien kutsujen kesken. */
export class Throttle {
  private last = 0;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly label: string
  ) {}

  /**
   * Aja funktio tahdistettuna. Kutsut sarjallistetaan, joten rinnakkaiset
   * kutsujat eivät voi ohittaa rajaa — ilman jonoa kaksi yhtaikaista kutsua
   * näkisi saman `last`-arvon ja lähtisi molemmat heti.
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(async () => {
      const wait = this.minIntervalMs - (Date.now() - this.last);
      if (wait > 0) await sleep(wait);
      this.last = Date.now();
      return fn();
    });
    // Jono jatkuu myös virheen jälkeen — yksi epäonnistunut pyyntö ei saa
    // jumittaa loppuja
    this.queue = result.catch(() => undefined);
    return result;
  }

  get name(): string {
    return this.label;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Aja pyyntö uudelleen 429:n jälkeen.
 *
 * `shouldRetry` erottaa pyyntörajan muista virheistä: 404 ei parane
 * odottamalla, eikä sitä pidä yrittää uudelleen.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; shouldRetry?: (err: unknown) => boolean; label?: string } = {}
): Promise<T> {
  const { attempts = 3, baseDelayMs = 20_000, shouldRetry = () => true, label = 'pyyntö' } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts || !shouldRetry(err)) break;
      // Lineaarinen kasvu riittää: pyyntöraja nollautuu minuutin ikkunassa,
      // joten eksponentiaalinen odotus vain pidentäisi ajoa turhaan.
      const delay = baseDelayMs * attempt;
      console.warn(`[Throttle] ${label}: yritys ${attempt}/${attempts} epäonnistui, odotetaan ${Math.round(delay / 1000)} s`);
      await sleep(delay);
    }
  }
  throw lastError;
}

/** Onko virhe pyyntörajasta johtuva */
export function isRateLimit(err: unknown): boolean {
  return err instanceof Error && /429|pyyntöraja/i.test(err.message);
}
