// Tiketti #9: Telegram-hälytykset
// Lähettää viestin kun value_flag syntyy (vain edge > 0.05).

import { config } from '../config.js';
import { ValueCheck } from '../engine/value.js';

/**
 * HTML-erikoismerkit. Telegramin HTML-tila vaatii naista vain kolme, kun
 * MarkdownV2 vaatii kahdeksantoista (. - ( ) ! _ * [ ] ~ ` > # + = | { }).
 * Kertoimen piste "2.50" riitti kaatamaan MarkdownV2-viestin 400:aan --
 * eli JOKAISEN viestin. HTML on tassa pienempi virhepinta.
 */
function html(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export interface AlertPayload {
  game: string;
  market: string;
  side: string;
  edge: number;
  odds: number;
  newsUrl?: string;
}

export async function sendTelegramAlert(payload: AlertPayload): Promise<boolean> {
  if (!config.telegram.botToken || !config.telegram.chatId) {
    console.warn('[Telegram] Not configured — skipping alert');
    return false;
  }

  const edgePct = (payload.edge * 100).toFixed(1);
  const message =
    `🔔 <b>Ylikerroin</b>\n${html(payload.game)}\n` +
    `<b>${html(payload.side.toUpperCase())}</b> @ ${payload.odds.toFixed(2)} · edge <b>${edgePct} %</b>` +
    (payload.newsUrl ? `\n<a href="${html(payload.newsUrl)}">Uutinen</a>` : '');
  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
      }),
    });

    const ok = res.ok;
    if (!ok) {
      const err = await res.text();
      console.error('[Telegram] Send failed:', err);
    }
    return ok;
  } catch (err) {
    console.error('[Telegram] Error:', err);
    return false;
  }
}

/** Lähettää hälytyksiä vain vahvoille value-flageille (edge > 0.05) */
export async function alertStrongValues(
  checks: ValueCheck[],
  gameLabel: string,
  newsUrl?: string
): Promise<number> {
  let sent = 0;
  for (const check of checks) {
    if (check.is_strong) {
      const ok = await sendTelegramAlert({
        game: gameLabel,
        market: '1X2',
        side: check.side,
        edge: check.edge,
        odds: check.odds,
        newsUrl,
      });
      if (ok) sent++;
    }
  }
  return sent;
}
