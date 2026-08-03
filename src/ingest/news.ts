// Tiketti #3: Uutis-RSS-scraper
// Hakee uutisartikkelit RSS-syötteistä ja tallentaa news_events-tauluun.

import Parser from 'rss-parser';
import { config } from '../config.js';
import { getSupabase } from '../db/supabase.js';

const parser = new Parser();

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  contentSnippet?: string;
  content?: string;
}

export async function fetchRssFeed(url: string): Promise<RssItem[]> {
  const feed = await parser.parseURL(url);
  return feed.items.map((item) => ({
    title: item.title || '',
    link: item.link || '',
    pubDate: item.pubDate || new Date().toISOString(),
    contentSnippet: item.contentSnippet,
    content: item.content,
  }));
}

export async function ingestNewsFromAllFeeds(): Promise<number> {
  const supabase = getSupabase();
  let inserted = 0;

  for (const feedUrl of config.news.rssFeeds) {
    console.log(`[News] Fetching ${feedUrl}...`);
    try {
      const items = await fetchRssFeed(feedUrl);

      for (const item of items) {
        const rawText = item.contentSnippet || item.content || item.title;

        // Duplikaattientunnistus: source_url = link
        const { data: existing } = await supabase
          .from('news_events')
          .select('id')
          .eq('source_url', item.link)
          .maybeSingle();

        if (existing) continue;

        const { error } = await supabase.from('news_events').insert({
          source_url: item.link,
          published_at: item.pubDate,
          raw_text: rawText,
        });

        if (!error) inserted++;
      }
    } catch (err) {
      console.error(`[News] Failed for ${feedUrl}:`, err);
    }
  }

  console.log(`[News] Inserted ${inserted} new articles`);
  return inserted;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestNewsFromAllFeeds()
    .then((n) => console.log(`Done: ${n} articles`))
    .catch(console.error);
}
