/** Tipos compartidos entre el motor del servidor y el panel del navegador. */
import type { PaperAccount } from "@/lib/trading/engine";
import type { Analysis, BotConfig, LogEntry, NewsItem } from "@/lib/trading/types";

export interface XtbPositionView {
  orderId: number;
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  openPrice: number;
  stopLoss: number;
  takeProfit: number;
  profit: number;
  openTime: number;
}

export interface XtbView {
  configured: boolean;
  source: "env" | "db" | null;
  login: string | null;
  account: "real" | "demo";
  connected: boolean;
  balance: number;
  equity: number;
  freeMargin: number;
  currency: string;
  positions: XtbPositionView[];
  error: string | null;
  lastOkAt: number | null;
}

export interface EngineStatus {
  running: boolean;
  scanning: boolean;
  liveArmed: boolean;
  engineId: string;
  pid: number;
  startedAt: number | null;
  uptimeMs: number;
  lastScanAt: number | null;
  nextScanAt: number | null;
  lastError: string | null;
  storage: "sqlite" | "memory";
  storageLocation: string;
  serverTime: number;
  isLeader: boolean;
}

export interface BotSnapshot {
  status: EngineStatus;
  config: BotConfig;
  account: PaperAccount;
  analyses: Record<string, Analysis>;
  prices: Record<string, number>;
  news: NewsItem[];
  logs: LogEntry[];
  xtb: XtbView;
}
