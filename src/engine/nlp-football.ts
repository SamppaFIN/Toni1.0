// Tiketti #29: Jalkapallouutisten erittely
//
// Kaksi tasoa, koska LLM-avain ei ole aina käytettävissä:
//
//   1. LLM (DeepSeek/OpenAI-yhteensopiva) kun LLM_API_KEY on asetettu.
//      Ymmärtää kontekstin: kuka on loukkaantunut, kuinka pitkäksi, kuka korvaa.
//
//   2. Avainsanaluokittelu kun avainta ei ole. Karkea mutta läpinäkyvä:
//      se ei ymmärrä mitään, se tunnistaa sanoja. Siksi confidence on
//      matalampi eikä ylitä λ-korjauksen kynnystä (0.7) koskaan.
//
// Tämä ero on olennainen: avainsanaluokittelu EI saa säätää mallia. Se antaa
// käyttäjälle konteksin luettavaksi, ei mallille syötettä.

import { extractEvents, ExtractedEvent } from './nlp.js';
import { config } from '../config.js';

export const FOOTBALL_SYSTEM_PROMPT = `Olet urheiludata-analysaattori. Erottele seuraavasta jalkapallouutisesta
joukkueisiin ja pelaajiin liittyvät tapahtumat JSON-muodossa.

Säännöt:
- Vain jalkapalloon liittyvät tapahtumat
- confidence: 0.0-1.0, kuinka varma olet että tapahtuma on todellinen JA vaikuttaa tulevaan otteluun
- Vahvistettu loukkaantuminen tai pelikielto: confidence 0.8-0.95
- Huhu, spekulaatio tai "saattaa puuttua": confidence alle 0.5
- Menneen ottelun kuvaus ilman vaikutusta tulevaan: confidence alle 0.3
- Jos et löydä tapahtumia, palauta tyhjä lista
- Älä keksi tapahtumia — vain tekstistä löytyvät

Palauta VAIN JSON (ei markdown-koodilohkoa):

[{
  "event_type": "injury | suspension | lineup_change | transfer | hot_streak | manager_change | other",
  "team": "Joukkueen nimi",
  "player": "Pelaajan nimi tai null",
  "confidence": 0.85,
  "impact": "lyhyt kuvaus vaikutuksesta tulevaan otteluun",
  "game_ref": null
}]`;

/**
 * Avainsanat tapahtumatyypeittäin.
 *
 * SANANVARTALOITA eikä kokonaisia sanoja, koska suomi taivuttaa: teksti sanoo
 * "pelikiellon" ja "punaisen kortin", ei "pelikielto" ja "punainen kortti".
 * Kokonaisten sanojen lista ei tunnistanut kumpaakaan — testi paljasti sen.
 *
 * Lyhyitä epämääräisiä vartaloita vältetään: "ban" osuisi sanaan "banaani".
 */
const KEYWORDS: Array<{ type: string; words: string[]; confidence: number }> = [
  {
    type: 'injury',
    words: [
      'loukkaant', 'loukkaam', 'vamma', 'revähd', 'revahd', 'murtu', 'nyrjäh', 'nyrjah',
      'sivussa', 'kentän laidal', 'ontu', 'lihaspulm',
      'injur', 'sidelined', 'ruled out', 'strain', 'knock', 'fitness doubt', 'hamstring',
    ],
    // Selvästi alle 0.7: avainsanaosuma ei riitä mallin säätämiseen
    confidence: 0.45,
  },
  {
    type: 'suspension',
    words: ['pelikiel', 'punaise', 'kortin', 'kortti', 'ulosaj', 'suspend', 'red card', 'banned', 'sent off'],
    confidence: 0.5,
  },
  {
    type: 'manager_change',
    words: ['valmentaj', 'erotet', 'eronn', 'nimitet', 'manager', 'head coach', 'sacked', 'appointed'],
    confidence: 0.4,
  },
  {
    type: 'transfer',
    words: ['siirty', 'siirto', 'kaupat', 'sopimu', 'transfer', 'signs', 'signing', 'joins', 'on loan'],
    confidence: 0.4,
  },
  {
    type: 'lineup_change',
    words: ['kokoonpano', 'kokoonpanoon', 'avausviisikko', 'lineup', 'starting xi', 'rotation'],
    confidence: 0.4,
  },
];

/**
 * Avainsanaluokittelu. Palauttaa korkeintaan yhden tapahtuman: sen tyypin
 * jonka avainsanoja löytyi eniten. Confidence on tarkoituksella matala.
 */
export function classifyByKeywords(text: string, team: string): ExtractedEvent | null {
  const lower = text.toLowerCase();

  let best: { type: string; hits: number; confidence: number } | null = null;
  for (const rule of KEYWORDS) {
    const hits = rule.words.filter((w) => lower.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { type: rule.type, hits, confidence: rule.confidence };
  }

  if (!best) return null;

  return {
    event_type: best.type,
    team,
    player: '',
    confidence: best.confidence,
    impact: 'Tunnistettu avainsanoista — ei LLM-erittelyä, ei vaikuta malliin',
    game_ref: null,
  };
}

export interface ExtractionResult {
  events: ExtractedEvent[];
  method: 'llm' | 'keywords';
}

/**
 * Erittele uutinen. Käyttää LLM:ää jos avain on, muuten avainsanoja.
 * LLM-virhe ei kaada putkea: pudotaan avainsanoihin.
 */
export async function extractFootballEvents(text: string, team: string): Promise<ExtractionResult> {
  if (config.llm.apiKey) {
    try {
      const events = await extractEvents(text, FOOTBALL_SYSTEM_PROMPT);
      if (events.length) return { events, method: 'llm' };
      // LLM ei löytänyt tapahtumia — se on validi tulos, ei virhe
      return { events: [], method: 'llm' };
    } catch (err) {
      console.warn(`[NLP] LLM-erittely epäonnistui, käytetään avainsanoja: ${(err as Error).message}`);
    }
  }

  const event = classifyByKeywords(text, team);
  return { events: event ? [event] : [], method: 'keywords' };
}

/**
 * Kynnys jonka ylittävä tapahtuma säätää mallin maaliodotusta.
 * Avainsanaluokittelu ei tuota tämän ylittäviä arvoja — vain LLM voi.
 */
export const MODEL_IMPACT_THRESHOLD = 0.7;

/** λ-korjauksen koko tapahtumatyypin mukaan (suhteellinen) */
export const LAMBDA_DELTA: Record<string, number> = {
  injury: -0.09,
  suspension: -0.07,
  manager_change: -0.04,
  lineup_change: -0.03,
};

/** Vaikuttaako tapahtuma malliin? */
export function affectsModel(event: ExtractedEvent): boolean {
  return event.confidence >= MODEL_IMPACT_THRESHOLD && event.event_type in LAMBDA_DELTA;
}
