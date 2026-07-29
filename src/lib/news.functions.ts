import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const NEWS_KEYWORDS_POS = [
  "beats","surge","surges","rally","rallies","gain","gains","record","upgrade","upgraded","strong","growth","profit","bullish","soar","soars","jump","jumps","boost","optimism","expands","outperform","raises","tops",
];
const NEWS_KEYWORDS_NEG = [
  "miss","misses","plunge","plunges","fall","falls","drop","drops","downgrade","downgraded","weak","loss","losses","bearish","slump","slumps","fears","warning","warns","cuts","recession","selloff","sinks","tumbles","probe","lawsuit",
];

function scoreSentiment(text: string): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const w of NEWS_KEYWORDS_POS) if (t.includes(w)) s += 1;
  for (const w of NEWS_KEYWORDS_NEG) if (t.includes(w)) s -= 1;
  return Math.max(-1, Math.min(1, s / 3));
}

function parseRss(xml: string) {
  const items: { title: string; link: string; pubDate: number; source: string }[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const block of blocks.slice(0, 12)) {
    const pick = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m) return "";
      return m[1]
        .replace(/<!\[CDATA\[|\]\]>/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    };
    const title = pick("title");
    if (!title) continue;
    items.push({
      title,
      link: pick("link"),
      pubDate: Date.parse(pick("pubDate")) || Date.now(),
      source: pick("source") || "Yahoo Finance",
    });
  }
  return items;
}

export const fetchNews = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ tickers: z.array(z.string()).min(1).max(12) }).parse(data),
  )
  .handler(async ({ data }) => {
    const results = await Promise.all(
      data.tickers.map(async (ticker) => {
        try {
          const res = await fetch(
            `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&region=US&lang=en-US`,
            {
              headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36",
              },
            },
          );
          if (!res.ok) return [];
          const xml = await res.text();
          return parseRss(xml).map((n) => ({
            title: n.title,
            source: n.source,
            time: n.pubDate,
            link: n.link,
            sentiment: scoreSentiment(n.title),
            tickers: [ticker],
          }));
        } catch {
          return [];
        }
      }),
    );

    const flat = results.flat().sort((a, b) => b.time - a.time).slice(0, 40);
    return { fetchedAt: Date.now(), items: flat };
  });
