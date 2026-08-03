// Tiketti #4: LLM-tapahtumaerittely + JSON-validointi
// Promptaa LLM:ää jäsentämään uutisartikkeleista rakenteisia tapahtumia.

import { config } from '../config.js';

const SYSTEM_PROMPT = `Olet urheiludata-analysaattori. Erottele seuraavasta uutisartikkelista 
pelaajiin ja joukkueisiin liittyvät tapahtumat JSON-muodossa.

Säännöt:
- Vain Liiga-jääkiekkoon liittyvät tapahtumat
- confidence: 0.0–1.0, kuinka varma olet että tapahtuma on todellinen
- Jos et löydä tapahtumia, palauta tyhjä lista
- Älä keksi tapahtumia — vain tekstistä löytyvät

Palauta VAIN JSON (ei markdown-koodilohkoa):

[{
  "event_type": "lineup_change | injury | transfer | hot_streak | bench | other",
  "team": "Joukkueen nimi",
  "player": "Pelaajan nimi",
  "confidence": 0.85,
  "impact": "lyhyt kuvaus vaikutuksesta",
  "game_ref": null
}]`;

export interface ExtractedEvent {
  event_type: string;
  team: string;
  player: string;
  confidence: number;
  impact: string;
  game_ref: string | null;
}

const MIN_CONFIDENCE = 0.5; // alle tämän eventtejä ei käytetä value-moottorissa

export async function extractEvents(articleText: string): Promise<ExtractedEvent[]> {
  if (!config.llm.apiKey) {
    console.warn('[LLM] No API key — skipping event extraction');
    return [];
  }

  // DeepSeek API (OpenAI-yhteensopiva)
  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: articleText },
      ],
      temperature: 0,
      max_tokens: 1000,
    }),
  });

  if (!res.ok) {
    console.error(`[LLM] API error: ${res.status}`);
    return [];
  }

  const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  const raw = data.choices[0]?.message?.content || '[]';

  return validateAndParse(raw);
}

export function validateAndParse(raw: string): ExtractedEvent[] {
  try {
    // Siivoa mahdolliset markdown-koodilohkot
    const jsonStr = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const events: ExtractedEvent[] = JSON.parse(jsonStr);

    // Validoi ja filteröi
    return events.filter((e) => {
      if (!e.event_type || !e.confidence) return false;
      if (typeof e.confidence !== 'number' || e.confidence < 0 || e.confidence > 1) return false;
      return true;
    });
  } catch {
    console.error('[LLM] JSON parse failed for:', raw.slice(0, 200));
    return [];
  }
}

/** Filteröi vain korkean confidencen eventit value-moottoria varten */
export function highConfidenceEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  return events.filter((e) => e.confidence > MIN_CONFIDENCE);
}
