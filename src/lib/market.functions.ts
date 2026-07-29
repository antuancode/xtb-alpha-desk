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
  const host = Math.random() < 0.5 ? "query1" : "query2";
  const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    yahooSymbol,
  )}?interval=${interval}&range=${range}&includePrePost=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36",
      Accept: "application/json,text/plain,*/*",
      "Accept-Language": "en-US,en;q=0.9",
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

/** Fuente alternativa para cripto (Binance, sin clave) */
const BINANCE_INTERVAL: Record<string, string> = { "5m": "5m", "15m": "15m", "1h": "1h", "1d": "1d" };
const BINANCE_PAIRS: Record<string, string> = {
  "BTC-USD": "BTCUSDT",
  "ETH-USD": "ETHUSDT",
  "SOL-USD": "SOLUSDT",
};

async function fetchBinance(yahooSymbol: string, interval: string): Promise<RawCandle[]> {
  const pair = BINANCE_PAIRS[yahooSymbol];
  if (!pair) throw new Error("Sin fuente alternativa");
  const res = await fetch(
    `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${BINANCE_INTERVAL[interval] ?? "15m"}&limit=500`,
  );
  if (!res.ok) throw new Error(`Binance ${pair} -> ${res.status}`);
  const rows = (await res.json()) as unknown[][];
  return rows.map((r) => ({
    t: Number(r[0]),
    o: Number(r[1]),
    h: Number(r[2]),
    l: Number(r[3]),
    c: Number(r[4]),
    v: Number(r[5]),
  }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const fetchMarketData = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => candlesInput.parse(data))
  .handler(async ({ data }) => {
    const cfg = YAHOO_INTERVAL[data.interval];
    const entries: Array<readonly [string, { candles: RawCandle[]; error: string | null }]> = [];

    // Secuencial con espaciado: las peticiones en paralelo disparan el 429 del proveedor.
    for (const yahooSymbol of data.symbols) {
      let candles: RawCandle[] = [];
      let error: string | null = null;
      for (let attempt = 0; attempt < 2 && !candles.length; attempt++) {
        try {
          candles = await fetchOne(yahooSymbol, cfg.interval, cfg.range);
          error = null;
        } catch (e) {
          error = (e as Error).message;
          await sleep(400);
        }
      }
      if (!candles.length && BINANCE_PAIRS[yahooSymbol]) {
        try {
          candles = await fetchBinance(yahooSymbol, data.interval);
          error = null;
        } catch (e) {
          error = (e as Error).message;
        }
      }
      entries.push([yahooSymbol, { candles, error }] as const);
      await sleep(150);
    }

    return { fetchedAt: Date.now(), data: Object.fromEntries(entries) };
  });

