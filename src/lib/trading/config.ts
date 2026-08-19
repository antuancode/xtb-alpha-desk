import { DEFAULT_SYMBOLS } from "./instruments";
import type { BotConfig } from "./types";

export const DEFAULT_CONFIG: BotConfig = {
  mode: "simulacion",
  analysisOnly: false,
  aggressiveness: 5,
  capitalAllocationPct: 30,
  riskPerTradePct: 1,
  maxConcurrentPositions: 4,
  maxDailyLossPct: 5,
  maxDailyProfitPct: 10,
  useTrailingStop: true,
  useNewsFilter: true,
  scanIntervalSec: 30,
  timeframe: "15m",
  symbols: DEFAULT_SYMBOLS,
  startingBalance: 10000,
};

export function sanitizeConfig(patch: Partial<BotConfig>, base: BotConfig): BotConfig {
  const clamp = (v: number, min: number, max: number, fallback: number) =>
    Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;

  const next: BotConfig = { ...base, ...patch };
  return {
    mode: next.mode === "real" ? "real" : "simulacion",
    analysisOnly: Boolean(next.analysisOnly),
    aggressiveness: Math.round(clamp(Number(next.aggressiveness), 1, 10, base.aggressiveness)),
    capitalAllocationPct: clamp(Number(next.capitalAllocationPct), 1, 100, base.capitalAllocationPct),
    riskPerTradePct: clamp(Number(next.riskPerTradePct), 0.1, 10, base.riskPerTradePct),
    maxConcurrentPositions: Math.round(clamp(Number(next.maxConcurrentPositions), 1, 20, base.maxConcurrentPositions)),
    maxDailyLossPct: clamp(Number(next.maxDailyLossPct), 0.5, 50, base.maxDailyLossPct),
    maxDailyProfitPct: clamp(Number(next.maxDailyProfitPct), 0.5, 100, base.maxDailyProfitPct),
    useTrailingStop: Boolean(next.useTrailingStop),
    useNewsFilter: Boolean(next.useNewsFilter),
    scanIntervalSec: Math.round(clamp(Number(next.scanIntervalSec), 15, 3600, base.scanIntervalSec)),
    timeframe: (["5m", "15m", "1h", "1d"] as const).includes(next.timeframe) ? next.timeframe : base.timeframe,
    symbols: Array.isArray(next.symbols) && next.symbols.length ? next.symbols.slice(0, 16) : base.symbols,
    startingBalance: clamp(Number(next.startingBalance), 100, 10_000_000, base.startingBalance),
  };
}
