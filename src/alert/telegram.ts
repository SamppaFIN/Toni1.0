// Tiketti #9: Telegram-hälytykset
// Lähettää viestin kun value_flag syntyy (vain edge > 0.05).

import { config } from '../config.js';
import { ValueCheck } from '../engine/value.js';

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
    `🔔 *Value-flag!*\\n` +
    `📋 ${payload.game}\\n` +
    `🎯 ${payload.side.toUpperCase()} @ ${payload.odds.toFixed(2)} \\(edge ${edgePct}%\\)\\n` +
    `${payload.newsUrl ? `📰 [Uutinen](${payload.newsUrl})` : ''}`;

  try {
    const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: config.telegram.chatId,
        text: message,
        parse_mode: 'MarkdownV2',
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
