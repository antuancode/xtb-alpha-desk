import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credsSchema = z.object({
  userId: z.string().min(1),
  password: z.string().min(1),
  account: z.enum(["real", "demo"]).default("real"),
});

const tradeSchema = credsSchema.extend({
  symbol: z.string().min(1),
  side: z.enum(["BUY", "SELL"]),
  volume: z.number().positive().max(100),
  stopLoss: z.number().nonnegative(),
  takeProfit: z.number().nonnegative(),
  comment: z.string().max(60).default("AlphaDesk"),
});

const closeSchema = credsSchema.extend({
  orderId: z.number(),
  symbol: z.string().min(1),
  volume: z.number().positive(),
  side: z.enum(["BUY", "SELL"]),
});

export const xtbConnect = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => credsSchema.parse(d))
  .handler(async ({ data }) => {
    const { withXtb, expectData } = await import("./xtb.server");
    return withXtb(data, async (s) => {
      const margin = expectData<{
        balance: number;
        equity: number;
        margin_free: number;
        currency: string;
      }>(await s.command("getMarginLevel"), "getMarginLevel");
      const user = expectData<{ currency: string; companyUnit?: number; login?: number }>(
        await s.command("getCurrentUserData"),
        "getCurrentUserData",
      );
      return {
        ok: true as const,
        balance: margin.balance,
        equity: margin.equity,
        freeMargin: margin.margin_free,
        currency: margin.currency ?? user.currency,
        login: user.login ?? Number(data.userId),
      };
    });
  });

export const xtbAccountState = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => credsSchema.parse(d))
  .handler(async ({ data }) => {
    const { withXtb, expectData } = await import("./xtb.server");
    return withXtb(data, async (s) => {
      const margin = expectData<{ balance: number; equity: number; margin_free: number; currency: string }>(
        await s.command("getMarginLevel"),
        "getMarginLevel",
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
        currency: margin.currency,
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
  });

export const xtbOpenTrade = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tradeSchema.parse(d))
  .handler(async ({ data }) => {
    const { withXtb, expectData } = await import("./xtb.server");
    return withXtb(data, async (s) => {
      const symbolInfo = expectData<{ ask: number; bid: number; lotMin: number; lotStep: number }>(
        await s.command("getSymbol", { symbol: data.symbol }),
        "getSymbol",
      );
      const price = data.side === "BUY" ? symbolInfo.ask : symbolInfo.bid;
      const step = symbolInfo.lotStep || 0.01;
      const volume = Math.max(symbolInfo.lotMin || step, Math.round(data.volume / step) * step);

      const res = expectData<{ order: number }>(
        await s.command("tradeTransaction", {
          tradeTransInfo: {
            cmd: data.side === "BUY" ? 0 : 1,
            type: 0,
            symbol: data.symbol,
            volume: Number(volume.toFixed(2)),
            price,
            sl: data.stopLoss || 0,
            tp: data.takeProfit || 0,
            offset: 0,
            order: 0,
            expiration: Date.now() + 60_000,
            customComment: data.comment,
          },
        }),
        "tradeTransaction",
      );

      const status = expectData<{ requestStatus: number; message?: string; order?: number }>(
        await s.command("tradeTransactionStatus", { order: res.order }),
        "tradeTransactionStatus",
      );
      if (status.requestStatus === 4) throw new Error(status.message ?? "XTB rechazó la orden");

      return { orderId: res.order, price, volume: Number(volume.toFixed(2)) };
    });
  });

export const xtbCloseTrade = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => closeSchema.parse(d))
  .handler(async ({ data }) => {
    const { withXtb, expectData } = await import("./xtb.server");
    return withXtb(data, async (s) => {
      const symbolInfo = expectData<{ ask: number; bid: number }>(
        await s.command("getSymbol", { symbol: data.symbol }),
        "getSymbol",
      );
      const price = data.side === "BUY" ? symbolInfo.bid : symbolInfo.ask;
      const res = expectData<{ order: number }>(
        await s.command("tradeTransaction", {
          tradeTransInfo: {
            cmd: data.side === "BUY" ? 0 : 1,
            type: 2,
            symbol: data.symbol,
            volume: data.volume,
            price,
            order: data.orderId,
            sl: 0,
            tp: 0,
            offset: 0,
            expiration: Date.now() + 60_000,
            customComment: "AlphaDesk close",
          },
        }),
        "tradeTransaction",
      );
      return { orderId: res.order, price };
    });
  });
