/**
 * Motor de trading de AlphaDesk. Ejecuta el bucle de análisis y ejecución
 * en el servidor (Raspberry Pi), independiente del navegador.
 * Instancia única por proceso + bloqueo con heartbeat en la base de datos.
 * Server-only.
 */
import { INSTRUMENTS, INSTRUMENT_MAP } from "@/lib/trading/instruments";
import {
  closePosition,
  createAccount,
  markToMarket,
  openPosition,
  recentWinRate,
  computeStats,
  type PaperAccount,
} from "@/lib/trading/engine";
import { adaptiveRiskFactor, analyze, buildTradePlan, riskProfile } from "@/lib/trading/strategy";
import type { Analysis, BotConfig, Candle, LogEntry, NewsItem } from "@/lib/trading/types";
import type { BotSnapshot, EngineStatus, XtbView } from "@/lib/bot-types";
import { fetchMarketData, fetchNews } from "./market.data";
import { getStore } from "./db";
import { publish } from "./bus";
import {
  appendLog,
  getAccount,
  getConfig,
  getCredentials,
  getLogs,
  getState,
  maskLogin,
  patchState,
  setAccount,
  setConfig,
} from "./state";
import { xtbCloseTrade, xtbFetchState, xtbOpenTrade } from "./xtb";

const LOCK_STALE_MS = 60_000;
const HEARTBEAT_MS = 10_000;

interface Market {
  analyses: Record<string, Analysis>;
  prices: Record<string, number>;
  news: NewsItem[];
}

const EMPTY_XTB: XtbView = {
  configured: false,
  source: null,
  login: null,
  account: "real",
  connected: false,
  balance: 0,
  equity: 0,
  freeMargin: 0,
  currency: "EUR",
  positions: [],
  error: null,
  lastOkAt: null,
};

class TradingEngine {
  readonly engineId = `eng-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
  readonly pid = typeof process !== "undefined" && process.pid ? process.pid : 0;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;
  private booted = false;
  private isLeader = false;
  private nextScanAt: number | null = null;
  private market: Market = { analyses: {}, prices: {}, news: [] };
  private xtb: XtbView = { ...EMPTY_XTB };

  async boot(): Promise<void> {
    if (this.booted) return;
    this.booted = true;

    const store = await getStore();
    this.isLeader = store.acquireLock(this.engineId, this.pid, LOCK_STALE_MS);
    if (!this.isLeader) {
      await this.log("warn", "Otro proceso ya tiene el mando del motor: este proceso solo servirá el panel.");
      return;
    }
    this.heartbeatTimer = setInterval(() => {
      void getStore().then((s) => s.heartbeat(this.engineId));
    }, HEARTBEAT_MS);

    await this.refreshXtbView();
    const state = await getState();
    await this.log("info", `Motor iniciado (${this.engineId}, pid ${this.pid}) · almacenamiento ${store.kind}.`);
    if (state.running) {
      await this.log("info", "Estado persistente: el bot estaba activo, se reanuda automáticamente.");
      this.schedule(1000);
    } else {
      // Un primer escaneo deja el panel con datos aunque el bot esté en pausa.
      this.schedule(2000);
    }
  }

  private schedule(delayMs: number) {
    // Solo el proceso con el mando ejecuta el bucle: evita bots duplicados.
    if (!this.isLeader) return;
    if (this.timer) clearTimeout(this.timer);
    this.nextScanAt = Date.now() + delayMs;
    this.timer = setTimeout(() => {
      void this.runCycle();
    }, delayMs);
  }

  private async runCycle() {
    const cfg = await getConfig();
    try {
      await this.scan();
    } catch (e) {
      await this.setError((e as Error).message);
    }
    const state = await getState();
    // El bucle sigue vivo mientras el proceso lo esté: si el bot está en pausa
    // seguimos analizando (sin operar) para que el panel muestre mercado real.
    const interval = Math.max(15, cfg.scanIntervalSec) * 1000;
    this.schedule(state.running ? interval : Math.max(interval, 60_000));
  }

  private async log(level: LogEntry["level"], msg: string) {
    await appendLog(level, msg);
    publish({ type: "logs", at: Date.now() });
  }

  private async setError(msg: string | null) {
    await patchState({ lastError: msg });
    if (msg) await this.log("error", msg);
  }

  // ---------------------------------------------------------------- escaneo

  async scan(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    publish({ type: "state", at: Date.now() });

    try {
      const cfg = await getConfig();
      const state = await getState();
      const instruments = cfg.symbols.map((s) => INSTRUMENT_MAP[s]).filter(Boolean);
      if (!instruments.length) {
        await this.log("warn", "No hay instrumentos seleccionados.");
        return;
      }

      const market = await fetchMarketData(
        instruments.map((i) => i.yahoo),
        cfg.timeframe,
      );

      let newsItems: NewsItem[] = this.market.news;
      if (cfg.useNewsFilter) {
        try {
          const res = await fetchNews(
            instruments.filter((i) => i.assetClass !== "forex").slice(0, 6).map((i) => i.yahoo),
          );
          const yahooToId = new Map(INSTRUMENTS.map((i) => [i.yahoo, i.id]));
          newsItems = res.items.map((n) => ({
            title: n.title,
            source: n.source,
            time: n.time,
            link: n.link,
            sentiment: n.sentiment,
            symbols: n.tickers.map((t) => yahooToId.get(t) ?? t),
          }));
        } catch {
          /* noticias opcionales */
        }
      } else {
        newsItems = [];
      }

      const nextPrices: Record<string, number> = {};
      const nextAnalyses: Record<string, Analysis> = {};
      const errors: string[] = [];

      for (const inst of instruments) {
        const entry = market.data[inst.yahoo];
        if (!entry || entry.error || entry.candles.length < 60) {
          if (entry?.error) errors.push(`${inst.id}: ${entry.error}`);
          continue;
        }
        const cs = entry.candles as Candle[];
        nextPrices[inst.id] = cs[cs.length - 1].c;
        const a = analyze(inst.id, cs, newsItems);
        if (a) nextAnalyses[inst.id] = a;
      }

      this.market = { analyses: nextAnalyses, prices: nextPrices, news: newsItems };
      await patchState({ lastScanAt: Date.now() });
      if (errors.length) await this.log("warn", `Sin datos para: ${errors.join(" | ")}`);

      // --- Gestión de la cartera simulada -----------------------------------
      const stored = await getAccount();
      const working: PaperAccount = {
        ...stored,
        positions: stored.positions.map((p) => ({ ...p })),
        history: [...stored.history],
        equityCurve: [...stored.equityCurve],
      };

      const tick = markToMarket(working, nextPrices, cfg);
      for (const c of tick.closed) {
        await this.log(
          "trade",
          `${c.exit === "TP" ? "Objetivo alcanzado" : "Stop ejecutado"} · ${c.symbol} ${c.side} · ${c.pnl >= 0 ? "+" : ""}${c.pnl.toFixed(2)} €`,
        );
      }
      for (const u of tick.trailingUpdates) await this.log("info", u);

      const s = computeStats(working, cfg.startingBalance);
      const dailyLossHit = s.dailyPnlPct <= -cfg.maxDailyLossPct;
      const dailyProfitHit = s.dailyPnlPct >= cfg.maxDailyProfitPct;

      if ((dailyLossHit || dailyProfitHit) && working.positions.length) {
        for (const p of [...working.positions]) {
          const c = closePosition(working, p.id, nextPrices[p.symbol] ?? p.openPrice, "CORTE_DIARIO");
          if (c) await this.log("warn", `Cierre por límite diario · ${c.symbol} ${c.pnl >= 0 ? "+" : ""}${c.pnl.toFixed(2)} €`);
        }
      }

      const canTrade = state.running && !cfg.analysisOnly && !dailyLossHit && !dailyProfitHit;

      if (canTrade) {
        await this.executeSignals(working, cfg, nextAnalyses, s.drawdownPct, state.liveArmed);
      }

      markToMarket(working, nextPrices, cfg);
      await setAccount(working);

      if (cfg.mode === "real") await this.refreshXtbView();
      await patchState({ lastError: null });
    } finally {
      this.scanning = false;
      publish({ type: "snapshot", at: Date.now() });
    }
  }

  private async executeSignals(
    working: PaperAccount,
    cfg: BotConfig,
    analyses: Record<string, Analysis>,
    drawdownPct: number,
    liveArmed: boolean,
  ) {
    const prof = riskProfile(cfg.aggressiveness);
    const maxPos = cfg.maxConcurrentPositions + prof.maxPositionsBoost;
    const tradableCapital = working.equity * (cfg.capitalAllocationPct / 100);
    const rf = adaptiveRiskFactor(
      Object.values(analyses).reduce((m, a) => Math.max(m, a.volatilityPct), 0),
      recentWinRate(working),
      drawdownPct,
    );

    const ranked = Object.values(analyses).sort((a, b) => b.confidence - a.confidence);

    for (const a of ranked) {
      if (working.positions.length >= maxPos) break;
      if (working.positions.some((p) => p.symbol === a.symbol)) continue;

      const plan = buildTradePlan(a, cfg, tradableCapital, INSTRUMENT_MAP[a.symbol].contractSize, rf);
      if (!plan) continue;

      const notional = plan.entry * plan.volume * INSTRUMENT_MAP[a.symbol].contractSize;
      const usedNotional = working.positions.reduce(
        (sum, p) => sum + p.openPrice * p.volume * INSTRUMENT_MAP[p.symbol].contractSize,
        0,
      );
      // Apalancamiento máximo implícito de 10x sobre el capital asignado
      if (usedNotional + notional > tradableCapital * 10) continue;

      if (cfg.mode === "real") {
        const { creds } = await getCredentials();
        if (!liveArmed || !creds) continue;
        try {
          const res = await xtbOpenTrade(creds, {
            symbol: INSTRUMENT_MAP[a.symbol].xtb,
            side: plan.side,
            volume: plan.volume,
            stopLoss: Number(plan.stopLoss.toFixed(INSTRUMENT_MAP[a.symbol].digits)),
            takeProfit: Number(plan.takeProfit.toFixed(INSTRUMENT_MAP[a.symbol].digits)),
            comment: "AlphaDesk",
          });
          await this.log(
            "trade",
            `ORDEN REAL enviada a XTB · ${plan.side} ${res.volume} ${a.symbol} @ ${res.price} · SL ${plan.stopLoss.toFixed(4)} / TP ${plan.takeProfit.toFixed(4)}`,
          );
          await this.refreshXtbView();
        } catch (e) {
          await this.log("error", `XTB rechazó la orden en ${a.symbol}: ${(e as Error).message}`);
        }
      } else {
        openPosition(working, {
          symbol: a.symbol,
          side: plan.side,
          volume: plan.volume,
          price: plan.entry,
          stopLoss: plan.stopLoss,
          takeProfit: plan.takeProfit,
          reason: plan.reason,
          confidence: plan.confidence,
        });
        await this.log(
          "trade",
          `Apertura simulada · ${plan.side} ${plan.volume} ${a.symbol} @ ${plan.entry.toFixed(4)} · confianza ${plan.confidence}% · riesgo ${plan.riskAmount.toFixed(2)} €`,
        );
      }
    }
  }

  // ------------------------------------------------------------------- XTB

  async refreshXtbView(): Promise<XtbView> {
    const { creds, source } = await getCredentials();
    if (!creds) {
      this.xtb = { ...EMPTY_XTB };
      return this.xtb;
    }
    const base: XtbView = {
      ...this.xtb,
      configured: true,
      source,
      login: maskLogin(creds.userId),
      account: creds.account,
    };
    try {
      const res = await xtbFetchState(creds);
      this.xtb = {
        ...base,
        connected: true,
        balance: res.balance,
        equity: res.equity,
        freeMargin: res.freeMargin,
        currency: res.currency || "EUR",
        positions: res.positions,
        error: null,
        lastOkAt: Date.now(),
      };
      await patchState({ lastXtbOkAt: Date.now() });
    } catch (e) {
      this.xtb = { ...base, connected: false, positions: [], error: (e as Error).message };
    }
    publish({ type: "snapshot", at: Date.now() });
    return this.xtb;
  }

  async closeXtbPosition(orderId: number, symbol: string, volume: number, side: "BUY" | "SELL") {
    const { creds } = await getCredentials();
    if (!creds) throw new Error("No hay credenciales de XTB configuradas en el servidor.");
    await xtbCloseTrade(creds, { orderId, symbol, volume, side });
    await this.log("trade", `Posición real cerrada en XTB · ${symbol} #${orderId}`);
    await this.refreshXtbView();
  }

  // -------------------------------------------------------------- comandos

  async start(): Promise<void> {
    const state = await getState();
    if (state.running) {
      // Idempotente: no se crea un segundo bucle.
      return;
    }
    await patchState({ running: true, startedAt: state.startedAt ?? Date.now() });
    await this.log("info", "Bot ACTIVADO en el servidor: ejecutará operaciones automáticamente.");
    this.schedule(500);
    publish({ type: "snapshot", at: Date.now() });
  }

  async stop(): Promise<void> {
    await patchState({ running: false });
    await this.log("info", "Bot en pausa: el servidor sigue analizando, pero no abre operaciones.");
    publish({ type: "snapshot", at: Date.now() });
  }

  async setLiveArmed(armed: boolean): Promise<void> {
    await patchState({ liveArmed: armed });
    await this.log("warn", armed ? "Ejecución real ARMADA." : "Ejecución real desarmada.");
    publish({ type: "snapshot", at: Date.now() });
  }

  async updateConfig(patch: Partial<BotConfig>): Promise<BotConfig> {
    const cfg = await setConfig(patch);
    await this.log("info", "Configuración actualizada desde el panel.");
    publish({ type: "snapshot", at: Date.now() });
    // Reprograma el próximo escaneo con el nuevo intervalo.
    this.schedule(Math.min(5000, Math.max(15, cfg.scanIntervalSec) * 1000));
    return cfg;
  }

  async closeSimulatedPosition(positionId: string) {
    const account = await getAccount();
    const working: PaperAccount = {
      ...account,
      positions: account.positions.map((p) => ({ ...p })),
      history: [...account.history],
      equityCurve: [...account.equityCurve],
    };
    const pos = working.positions.find((p) => p.id === positionId);
    if (!pos) throw new Error("La posición ya no existe.");
    const price = this.market.prices[pos.symbol] ?? pos.currentPrice ?? pos.openPrice;
    const closed = closePosition(working, positionId, price, "MANUAL");
    await setAccount(working);
    if (closed) await this.log("trade", `Cierre manual ${closed.symbol} · ${closed.pnl >= 0 ? "+" : ""}${closed.pnl.toFixed(2)} €`);
    publish({ type: "snapshot", at: Date.now() });
  }

  async resetSimulation(balance: number) {
    await setConfig({ startingBalance: balance });
    await setAccount(createAccount(balance));
    await this.log("info", `Cuenta de simulación reiniciada con ${balance.toLocaleString("es-ES")} €.`);
    publish({ type: "snapshot", at: Date.now() });
  }

  async scanNow() {
    await this.scan();
  }

  // --------------------------------------------------------------- lectura

  async status(): Promise<EngineStatus> {
    const state = await getState();
    const store = await getStore();
    return {
      running: state.running,
      scanning: this.scanning,
      liveArmed: state.liveArmed,
      engineId: this.engineId,
      pid: this.pid,
      startedAt: state.startedAt,
      uptimeMs: state.startedAt && state.running ? Date.now() - state.startedAt : 0,
      lastScanAt: state.lastScanAt,
      nextScanAt: this.nextScanAt,
      lastError: state.lastError,
      storage: store.kind,
      storageLocation: store.location,
      serverTime: Date.now(),
      isLeader: this.isLeader,
    };
  }

  async snapshot(): Promise<BotSnapshot> {
    const [status, config, account, logs] = await Promise.all([
      this.status(),
      getConfig(),
      getAccount(),
      getLogs(250),
    ]);
    const { creds, source } = await getCredentials();
    const xtb: XtbView = creds
      ? { ...this.xtb, configured: true, source, login: maskLogin(creds.userId), account: creds.account }
      : { ...EMPTY_XTB };
    return {
      status,
      config,
      account,
      analyses: this.market.analyses,
      prices: this.market.prices,
      news: this.market.news,
      logs,
      xtb,
    };
  }
}

const g = globalThis as unknown as { __alphadeskEngine?: TradingEngine };

/** Devuelve SIEMPRE la misma instancia dentro del proceso. */
export async function getEngine(): Promise<TradingEngine> {
  if (!g.__alphadeskEngine) g.__alphadeskEngine = new TradingEngine();
  const engine = g.__alphadeskEngine;
  await engine.boot();
  return engine;
}

export type { TradingEngine };
