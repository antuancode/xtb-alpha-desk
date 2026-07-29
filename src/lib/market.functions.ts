import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const candlesInput = z.object({
  symbols: z.array(z.string()).min(1).max(24),
  interval: z.enum(["5m", "15m", "1h", "1d"]).default("15m"),
});

const YAHOO_INTERVAL: Record<string, { interval: string; range: string }> = {
  "5m": { interval: "5m", range: "5d" },
  "15m": { interval: "15m", range: "1mo" },
  "1h": { interval: "60m", range: "3mo" },
  "1d": { interval: "1d", range: "2y" },
};

export interface RawCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

async function fetchOne(yahooSymbol: string, interval: string, range: string): Promise<RawCandle[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=${interval}&range=${range}&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Yahoo ${yahooSymbol} -> ${res.status}`);
  const json = (await res.json()) as {
    chart?: {
      result?: Array<{
        timestamp?: number[];
        indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
      }>;
      error?: { description?: string };
    };
  };
  const result = json.chart?.result?.[0];
  if (!result?.timestamp) throw new Error(json.chart?.error?.description ?? `Sin datos para ${yahooSymbol}`);
  const q = result.indicators?.quote?.[0] ?? {};
  const out: RawCandle[] = [];
  for (let i = 0; i < result.timestamp.length; i++) {
    const o = q.open?.[i];
    const h = q.high?.[i];
    const l = q.low?.[i];
    const c = q.close?.[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ t: result.timestamp[i] * 1000, o, h, l, c, v: q.volume?.[i] ?? 0 });
  }
  return out;
}

export const fetchMarketData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => candlesInput.parse(data))
  .handler(async ({ data }) => {
    const cfg = YAHOO_INTERVAL[data.interval];
    const entries = await Promise.all(
      data.symbols.map(async (yahooSymbol) => {
        try {
          const candles = await fetchOne(yahooSymbol, cfg.interval, cfg.range);
          return [yahooSymbol, { candles, error: null as string | null }] as const;
        } catch (e) {
          return [yahooSymbol, { candles: [] as RawCandle[], error: (e as Error).message }] as const;
        }
      }),
    );
    return { fetchedAt: Date.now(), data: Object.fromEntries(entries) };
  });
