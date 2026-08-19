/** Operaciones contra XTB usando las credenciales guardadas en el servidor. Server-only. */
import { withXtb, expectData } from "@/lib/xtb.server";
import type { XtbCredentials } from "./state";
import type { XtbPositionView } from "@/lib/bot-types";

export interface XtbAccountState {
  balance: number;
  equity: number;
  freeMargin: number;
  currency: string;
  login: number | null;
  positions: XtbPositionView[];
}

export async function xtbFetchState(creds: XtbCredentials): Promise<XtbAccountState> {
  return withXtb(creds, async (s) => {
    const margin = expectData<{ balance: number; equity: number; margin_free: number; currency: string }>(
      await s.command("getMarginLevel"),
      "getMarginLevel",
    );
    const user = expectData<{ currency: string; login?: number }>(
      await s.command("getCurrentUserData"),
      "getCurrentUserData",
    );
    const trades = expectData<
      Array<{
        order2: number;
        order: number;
        symbol: string;
        cmd: number;
        volume: number;
        open_price: number;
        sl: number;
        tp: number;
        profit: number;
        open_time: number;
      }>
    >(await s.command("getTrades", { openedOnly: true }), "getTrades");

    return {
      balance: margin.balance,
      equity: margin.equity,
      freeMargin: margin.margin_free,
      currency: margin.currency ?? user.currency,
      login: user.login ?? Number(creds.userId) || null,
      positions: trades.map((t) => ({
        orderId: t.order2 ?? t.order,
        symbol: t.symbol,
        side: t.cmd === 0 ? ("BUY" as const) : ("SELL" as const),
        volume: t.volume,
        openPrice: t.open_price,
        stopLoss: t.sl,
        takeProfit: t.tp,
        profit: t.profit,
        openTime: t.open_time,
      })),
    };
  });
}

export interface OpenTradeArgs {
  symbol: string;
  side: "BUY" | "SELL";
  volume: number;
  stopLoss: number;
  takeProfit: number;
  comment?: string;
}

export async function xtbOpenTrade(creds: XtbCredentials, args: OpenTradeArgs) {
  return withXtb(creds, async (s) => {
    const symbolInfo = expectData<{ ask: number; bid: number; lotMin: number; lotStep: number }>(
      await s.command("getSymbol", { symbol: args.symbol }),
      "getSymbol",
    );
    const price = args.side === "BUY" ? symbolInfo.ask : symbolInfo.bid;
    const step = symbolInfo.lotStep || 0.01;
    const volume = Math.max(symbolInfo.lotMin || step, Math.round(args.volume / step) * step);

    const res = expectData<{ order: number }>(
      await s.command("tradeTransaction", {
        tradeTransInfo: {
          cmd: args.side === "BUY" ? 0 : 1,
          type: 0,
          symbol: args.symbol,
          volume: Number(volume.toFixed(2)),
          price,
          sl: args.stopLoss || 0,
          tp: args.takeProfit || 0,
          offset: 0,
          order: 0,
          expiration: Date.now() + 60_000,
          customComment: args.comment ?? "AlphaDesk",
        },
      }),
      "tradeTransaction",
    );

    const status = expectData<{ requestStatus: number; message?: string; order?: number }>(
      await s.command("tradeTransactionStatus", { order: res.order }),
      "tradeTransactionStatus",
    );
    if (status.requestStatus === 4) throw new Error(status.message ?? "XTB rechazó la orden");

    return { order: status.order ?? res.order, price, volume: Number(volume.toFixed(2)) };
  });
}

export async function xtbCloseTrade(
  creds: XtbCredentials,
  args: { orderId: number; symbol: string; volume: number; side: "BUY" | "SELL" },
) {
  return withXtb(creds, async (s) => {
    const symbolInfo = expectData<{ ask: number; bid: number }>(
      await s.command("getSymbol", { symbol: args.symbol }),
      "getSymbol",
    );
    const price = args.side === "BUY" ? symbolInfo.bid : symbolInfo.ask;
    const res = expectData<{ order: number }>(
      await s.command("tradeTransaction", {
        tradeTransInfo: {
          cmd: args.side === "BUY" ? 0 : 1,
          type: 2,
          symbol: args.symbol,
          volume: args.volume,
          price,
          order: args.orderId,
          sl: 0,
          tp: 0,
          offset: 0,
          expiration: Date.now() + 60_000,
          customComment: "AlphaDesk close",
        },
      }),
      "tradeTransaction",
    );
    return { order: res.order };
  });
}
