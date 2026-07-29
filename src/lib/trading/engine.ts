import type { BotConfig, Candle, ClosedTrade, Position, Side } from "./types";
import { INSTRUMENT_MAP } from "./instruments";

export interface PaperAccount {
  balance: number;
  equity: number;
  positions: Position[];
  history: ClosedTrade[];
  equityCurve: { t: number; equity: number }[];
  dayStartEquity: number;
  dayKey: string;
  peakEquity: number;
}

export function createAccount(startingBalance: number): PaperAccount {
  const now = Date.now();
  return {
    balance: startingBalance,
    equity: startingBalance,
    positions: [],
    history: [],
    equityCurve: [{ t: now, equity: startingBalance }],
    dayStartEquity: startingBalance,
    dayKey: new Date(now).toISOString().slice(0, 10),
    peakEquity: startingBalance,
  };
}

export function positionPnl(p: Position, price: number): number {
  const cs = INSTRUMENT_MAP[p.symbol]?.contractSize ?? 1;
  const dir = p.side === "BUY" ? 1 : -1;
  return (price - p.openPrice) * dir * p.volume * cs;
}

export function openPosition(
  account: PaperAccount,
  args: {
    symbol: string;
    side: Side;
    volume: number;
    price: number;
    stopLoss: number;
    takeProfit: number;
    reason: string;
    confidence: number;
    real?: boolean;
    xtbOrderId?: number;
  },
): Position {
  const pos: Position = {
    id: `${args.symbol}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: args.symbol,
    side: args.side,
    volume: args.volume,
    openPrice: args.price,
    openTime: Date.now(),
    stopLoss: args.stopLoss,
    takeProfit: args.takeProfit,
    reason: args.reason,
    confidence: args.confidence,
    trailingPeak: args.price,
    currentPrice: args.price,
    pnl: 0,
    real: args.real,
    xtbOrderId: args.xtbOrderId,
  };
  account.positions = [...account.positions, pos];
  return pos;
}

export function closePosition(
  account: PaperAccount,
  positionId: string,
  price: number,
  exit: ClosedTrade["exit"],
): ClosedTrade | null {
  const pos = account.positions.find((p) => p.id === positionId);
  if (!pos) return null;
  const pnl = positionPnl(pos, price);
  const closed: ClosedTrade = {
    ...pos,
    closePrice: price,
    closeTime: Date.now(),
    pnl,
    exit,
  };
  account.positions = account.positions.filter((p) => p.id !== positionId);
  account.history = [closed, ...account.history].slice(0, 500);
  account.balance += pnl;
  return closed;
}

export interface TickResult {
  closed: ClosedTrade[];
  trailingUpdates: string[];
}

/** Aplica precios actuales: recalcula P/L, dispara SL/TP y trailing stop */
export function markToMarket(
  account: PaperAccount,
  prices: Record<string, number>,
  config: BotConfig,
): TickResult {
  const closed: ClosedTrade[] = [];
  const trailingUpdates: string[] = [];

  for (const pos of [...account.positions]) {
    const price = prices[pos.symbol];
    if (!price) continue;

    if (config.useTrailingStop) {
      const better = pos.side === "BUY" ? price > pos.trailingPeak : price < pos.trailingPeak;
      if (better) {
        const moved = Math.abs(price - pos.openPrice);
        const initialRisk = Math.abs(pos.openPrice - pos.stopLoss);
        pos.trailingPeak = price;
        // A partir de 1R de beneficio, el stop persigue al precio manteniendo 0.6R
        if (initialRisk > 0 && moved > initialRisk) {
          const newStop = pos.side === "BUY" ? price - initialRisk * 0.6 : price + initialRisk * 0.6;
          const improves = pos.side === "BUY" ? newStop > pos.stopLoss : newStop < pos.stopLoss;
          if (improves) {
            pos.stopLoss = newStop;
            trailingUpdates.push(`${pos.symbol}: stop movido a ${newStop.toFixed(5)} (beneficio asegurado)`);
          }
        }
      }
    }

    const hitSL = pos.side === "BUY" ? price <= pos.stopLoss : price >= pos.stopLoss;
    const hitTP = pos.side === "BUY" ? price >= pos.takeProfit : price <= pos.takeProfit;

    if (hitSL || hitTP) {
      const c = closePosition(account, pos.id, hitTP ? pos.takeProfit : pos.stopLoss, hitTP ? "TP" : "SL");
      if (c) closed.push(c);
      continue;
    }

    pos.currentPrice = price;
    pos.pnl = positionPnl(pos, price);
  }

  const floating = account.positions.reduce((s, p) => s + p.pnl, 0);
  account.equity = account.balance + floating;
  account.peakEquity = Math.max(account.peakEquity, account.equity);

  const todayKey = new Date().toISOString().slice(0, 10);
  if (todayKey !== account.dayKey) {
    account.dayKey = todayKey;
    account.dayStartEquity = account.equity;
  }

  const lastPoint = account.equityCurve[account.equityCurve.length - 1];
  if (!lastPoint || Date.now() - lastPoint.t > 20_000) {
    account.equityCurve = [...account.equityCurve, { t: Date.now(), equity: account.equity }].slice(-500);
  }

  return { closed, trailingUpdates };
}

export interface AccountStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  netPnl: number;
  netPnlPct: number;
  drawdownPct: number;
  dailyPnl: number;
  dailyPnlPct: number;
  bestTrade: number;
  worstTrade: number;
  avgWin: number;
  avgLoss: number;
  exposure: number;
}

export function computeStats(account: PaperAccount, startingBalance: number): AccountStats {
  const wins = account.history.filter((t) => t.pnl > 0);
  const losses = account.history.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl = account.equity - startingBalance;
  const exposure = account.positions.reduce((s, p) => {
    const cs = INSTRUMENT_MAP[p.symbol]?.contractSize ?? 1;
    return s + Math.abs(p.openPrice * p.volume * cs);
  }, 0);

  return {
    totalTrades: account.history.length,
    wins: wins.length,
    losses: losses.length,
    winRate: account.history.length ? wins.length / account.history.length : 0,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
    netPnl,
    netPnlPct: startingBalance ? (netPnl / startingBalance) * 100 : 0,
    drawdownPct: account.peakEquity ? ((account.peakEquity - account.equity) / account.peakEquity) * 100 : 0,
    dailyPnl: account.equity - account.dayStartEquity,
    dailyPnlPct: account.dayStartEquity ? ((account.equity - account.dayStartEquity) / account.dayStartEquity) * 100 : 0,
    bestTrade: account.history.length ? Math.max(...account.history.map((t) => t.pnl)) : 0,
    worstTrade: account.history.length ? Math.min(...account.history.map((t) => t.pnl)) : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    exposure,
  };
}

export function recentWinRate(account: PaperAccount, n = 10): number {
  const slice = account.history.slice(0, n);
  if (!slice.length) return 0.5;
  return slice.filter((t) => t.pnl > 0).length / slice.length;
}

export function lastPrice(candles: Candle[]): number {
  return candles.length ? candles[candles.length - 1].c : 0;
}
