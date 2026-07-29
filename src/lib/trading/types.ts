export type AssetClass = "forex" | "index" | "stock" | "commodity" | "crypto";

export interface Instrument {
  /** Internal id, also used as XTB symbol when mapped */
  id: string;
  name: string;
  assetClass: AssetClass;
  /** Yahoo Finance ticker used for real market data */
  yahoo: string;
  /** XTB xStation symbol */
  xtb: string;
  /** Contract size used for P/L computation in the paper engine */
  contractSize: number;
  /** Decimal places for display */
  digits: number;
  /** 24/7 market */
  alwaysOpen?: boolean;
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export type Side = "BUY" | "SELL";

export interface Analysis {
  symbol: string;
  price: number;
  trend: "alcista" | "bajista" | "lateral";
  score: number; // -100..100
  confidence: number; // 0..100
  atr: number;
  rsi: number;
  emaFast: number;
  emaSlow: number;
  macdHist: number;
  volatilityPct: number;
  reasons: string[];
  suggestion: Side | "ESPERAR";
}

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  volume: number;
  openPrice: number;
  openTime: number;
  stopLoss: number;
  takeProfit: number;
  reason: string;
  confidence: number;
  trailingPeak: number;
  currentPrice: number;
  pnl: number;
  real?: boolean;
  xtbOrderId?: number;
}

export interface ClosedTrade extends Omit<Position, "pnl" | "currentPrice"> {
  closePrice: number;
  closeTime: number;
  pnl: number;
  exit: "TP" | "SL" | "SEÑAL" | "MANUAL" | "TRAILING" | "CORTE_DIARIO";
}

export type BotMode = "simulacion" | "real";

export interface BotConfig {
  mode: BotMode;
  analysisOnly: boolean;
  aggressiveness: number; // 1..10
  capitalAllocationPct: number; // % de la cartera que el bot puede usar
  riskPerTradePct: number; // % del capital asignado arriesgado por operación
  maxConcurrentPositions: number;
  maxDailyLossPct: number;
  maxDailyProfitPct: number;
  useTrailingStop: boolean;
  useNewsFilter: boolean;
  scanIntervalSec: number;
  timeframe: "5m" | "15m" | "1h" | "1d";
  symbols: string[];
  startingBalance: number;
}

export interface LogEntry {
  id: string;
  t: number;
  level: "info" | "trade" | "warn" | "error" | "analysis";
  msg: string;
}

export interface NewsItem {
  title: string;
  source: string;
  time: number;
  link: string;
  sentiment: number; // -1..1
  symbols: string[];
}
