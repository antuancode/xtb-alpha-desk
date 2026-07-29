import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchMarketData } from "@/lib/market.functions";
import { fetchNews } from "@/lib/news.functions";
import { xtbAccountState, xtbCloseTrade, xtbConnect, xtbOpenTrade } from "@/lib/xtb.functions";
import { DEFAULT_SYMBOLS, INSTRUMENTS, INSTRUMENT_MAP } from "@/lib/trading/instruments";
import {
  closePosition,
  computeStats,
  createAccount,
  markToMarket,
  openPosition,
  recentWinRate,
  type PaperAccount,
} from "@/lib/trading/engine";
import { adaptiveRiskFactor, analyze, buildTradePlan, riskProfile } from "@/lib/trading/strategy";
import type { Analysis, BotConfig, Candle, LogEntry, NewsItem } from "@/lib/trading/types";

const CONFIG_KEY = "alphadesk.config.v1";
const ACCOUNT_KEY = "alphadesk.account.v1";
const CREDS_KEY = "alphadesk.xtb.v1";

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

export interface XtbCredsState {
  userId: string;
  password: string;
  account: "real" | "demo";
}

export interface XtbLive {
  connected: boolean;
  balance: number;
  equity: number;
  freeMargin: number;
  currency: string;
  positions: {
    orderId: number;
    symbol: string;
    side: "BUY" | "SELL";
    volume: number;
    openPrice: number;
    stopLoss: number;
    takeProfit: number;
    profit: number;
    openTime: number;
  }[];
  error: string | null;
}

const EMPTY_XTB: XtbLive = {
  connected: false,
  balance: 0,
  equity: 0,
  freeMargin: 0,
  currency: "EUR",
  positions: [],
  error: null,
};

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

export function useTradingBot() {
  const [hydrated, setHydrated] = useState(false);
  const [config, setConfig] = useState<BotConfig>(DEFAULT_CONFIG);
  const [account, setAccount] = useState<PaperAccount>(() => createAccount(DEFAULT_CONFIG.startingBalance));
  const [analyses, setAnalyses] = useState<Record<string, Analysis>>({});
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [candles, setCandles] = useState<Record<string, Candle[]>>({});
  const [news, setNews] = useState<NewsItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<number | null>(null);
  const [creds, setCreds] = useState<XtbCredsState>({ userId: "", password: "", account: "real" });
  const [xtb, setXtb] = useState<XtbLive>(EMPTY_XTB);
  const [liveArmed, setLiveArmed] = useState(false);

  const accountRef = useRef(account);
  const configRef = useRef(config);
  const credsRef = useRef(creds);
  const runningRef = useRef(running);
  const armedRef = useRef(liveArmed);
  const busyRef = useRef(false);
  accountRef.current = account;
  configRef.current = config;
  credsRef.current = creds;
  runningRef.current = running;
  armedRef.current = liveArmed;

  const log = useCallback((level: LogEntry["level"], msg: string) => {
    setLogs((prev) =>
      [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, t: Date.now(), level, msg }, ...prev].slice(0, 250),
    );
  }, []);

  // Hidratación desde almacenamiento local
  useEffect(() => {
    const c = load<BotConfig>(CONFIG_KEY, DEFAULT_CONFIG);
    setConfig(c);
    try {
      const rawAcc = window.localStorage.getItem(ACCOUNT_KEY);
      setAccount(rawAcc ? (JSON.parse(rawAcc) as PaperAccount) : createAccount(c.startingBalance));
      const rawCreds = window.sessionStorage.getItem(CREDS_KEY);
      if (rawCreds) setCreds(JSON.parse(rawCreds) as XtbCredsState);
    } catch {
      setAccount(createAccount(c.startingBalance));
    }
    setHydrated(true);
    log("info", "Panel iniciado. Motor de análisis listo.");
  }, [log]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  }, [account, hydrated]);

  const updateConfig = useCallback((patch: Partial<BotConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const saveCreds = useCallback((next: XtbCredsState) => {
    setCreds(next);
    try {
      window.sessionStorage.setItem(CREDS_KEY, JSON.stringify(next));
    } catch {
      /* noop */
    }
  }, []);

  const stats = useMemo(() => computeStats(account, config.startingBalance), [account, config.startingBalance]);
  const profile = useMemo(() => riskProfile(config.aggressiveness), [config.aggressiveness]);

  const resetSimulation = useCallback(
    (balance: number) => {
      setAccount(createAccount(balance));
      updateConfig({ startingBalance: balance });
      log("info", `Cuenta de simulación reiniciada con ${balance.toLocaleString("es-ES")} €.`);
    },
    [log, updateConfig],
  );

  const connectXtb = useCallback(async () => {
    const c = credsRef.current;
    if (!c.userId || !c.password) {
      setXtb((p) => ({ ...p, error: "Introduce tu número de cuenta y contraseña de XTB." }));
      return;
    }
    try {
      log("info", `Conectando con XTB (${c.account})…`);
      const res = await xtbConnect({ data: c });
      setXtb({
        connected: true,
        balance: res.balance,
        equity: res.equity,
        freeMargin: res.freeMargin,
        currency: res.currency,
        positions: [],
        error: null,
      });
      log("info", `Conectado a XTB · cuenta ${res.login} · saldo ${res.balance.toFixed(2)} ${res.currency}`);
    } catch (e) {
      const msg = (e as Error).message;
      setXtb({ ...EMPTY_XTB, error: msg });
      log("error", `Fallo de conexión con XTB: ${msg}`);
    }
  }, [log]);

  const disconnectXtb = useCallback(() => {
    setXtb(EMPTY_XTB);
    setLiveArmed(false);
    log("info", "Desconectado de XTB.");
  }, [log]);

  const refreshXtb = useCallback(async () => {
    const c = credsRef.current;
    if (!c.userId || !c.password) return;
    try {
      const res = await xtbAccountState({ data: c });
      setXtb({ connected: true, error: null, ...res });
    } catch (e) {
      setXtb((p) => ({ ...p, error: (e as Error).message }));
    }
  }, []);

  const closeXtbPosition = useCallback(
    async (orderId: number, symbol: string, volume: number, side: "BUY" | "SELL") => {
      try {
        await xtbCloseTrade({ data: { ...credsRef.current, orderId, symbol, volume, side } });
        log("trade", `Posición real cerrada en XTB · ${symbol} #${orderId}`);
        await refreshXtb();
      } catch (e) {
        log("error", `No se pudo cerrar ${symbol}: ${(e as Error).message}`);
      }
    },
    [log, refreshXtb],
  );

  const closeManually = useCallback(
    (positionId: string) => {
      setAccount((prev) => {
        const next: PaperAccount = { ...prev, positions: [...prev.positions], history: [...prev.history] };
        const pos = next.positions.find((p) => p.id === positionId);
        if (!pos) return prev;
        const c = closePosition(next, positionId, pos.currentPrice || pos.openPrice, "MANUAL");
        if (c) log("trade", `Cierre manual ${c.symbol} · ${c.pnl >= 0 ? "+" : ""}${c.pnl.toFixed(2)} €`);
        return next;
      });
    },
    [log],
  );

  const scan = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setScanning(true);
    const cfg = configRef.current;

    try {
      const instruments = cfg.symbols.map((s) => INSTRUMENT_MAP[s]).filter(Boolean);
      if (!instruments.length) {
        log("warn", "No hay instrumentos seleccionados.");
        return;
      }

      const market = await fetchMarketData({
        data: { symbols: instruments.map((i) => i.yahoo), interval: cfg.timeframe },
      });

      let newsItems: NewsItem[] = [];
      if (cfg.useNewsFilter) {
        try {
          const res = await fetchNews({
            data: { tickers: instruments.filter((i) => i.assetClass !== "forex").slice(0, 6).map((i) => i.yahoo) },
          });
          const yahooToId = new Map(INSTRUMENTS.map((i) => [i.yahoo, i.id]));
          newsItems = res.items.map((n) => ({
            title: n.title,
            source: n.source,
            time: n.time,
            link: n.link,
            sentiment: n.sentiment,
            symbols: n.tickers.map((t) => yahooToId.get(t) ?? t),
          }));
          setNews(newsItems);
        } catch {
          /* noticias opcionales */
        }
      }

      const nextCandles: Record<string, Candle[]> = {};
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
        nextCandles[inst.id] = cs;
        nextPrices[inst.id] = cs[cs.length - 1].c;
        const a = analyze(inst.id, cs, newsItems);
        if (a) nextAnalyses[inst.id] = a;
      }

      setCandles(nextCandles);
      setPrices(nextPrices);
      setAnalyses(nextAnalyses);
      setLastScan(Date.now());
      if (errors.length) log("warn", `Sin datos para: ${errors.join(" | ")}`);

      // --- Gestión de cartera simulada ---
      const working: PaperAccount = {
        ...accountRef.current,
        positions: accountRef.current.positions.map((p) => ({ ...p })),
        history: [...accountRef.current.history],
        equityCurve: [...accountRef.current.equityCurve],
      };

      const tick = markToMarket(working, nextPrices, cfg);
      for (const c of tick.closed) {
        log(
          "trade",
          `${c.exit === "TP" ? "Objetivo alcanzado" : "Stop ejecutado"} · ${c.symbol} ${c.side} · ${c.pnl >= 0 ? "+" : ""}${c.pnl.toFixed(2)} €`,
        );
      }
      for (const u of tick.trailingUpdates) log("info", u);

      const s = computeStats(working, cfg.startingBalance);
      const dailyLossHit = s.dailyPnlPct <= -cfg.maxDailyLossPct;
      const dailyProfitHit = s.dailyPnlPct >= cfg.maxDailyProfitPct;

      if ((dailyLossHit || dailyProfitHit) && working.positions.length) {
        for (const p of [...working.positions]) {
          const c = closePosition(working, p.id, nextPrices[p.symbol] ?? p.openPrice, "CORTE_DIARIO");
          if (c) log("warn", `Cierre por límite diario · ${c.symbol} ${c.pnl >= 0 ? "+" : ""}${c.pnl.toFixed(2)} €`);
        }
      }

      const canTrade =
        runningRef.current && !cfg.analysisOnly && !dailyLossHit && !dailyProfitHit;

      if (canTrade) {
        const prof = riskProfile(cfg.aggressiveness);
        const maxPos = cfg.maxConcurrentPositions + prof.maxPositionsBoost;
        const tradableCapital = working.equity * (cfg.capitalAllocationPct / 100);
        const rf = adaptiveRiskFactor(
          Object.values(nextAnalyses).reduce((m, a) => Math.max(m, a.volatilityPct), 0),
          recentWinRate(working),
          s.drawdownPct,
        );

        const ranked = Object.values(nextAnalyses).sort((a, b) => b.confidence - a.confidence);

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
            if (!armedRef.current || !xtbRefConnected()) continue;
            try {
              const res = await xtbOpenTrade({
                data: {
                  ...credsRef.current,
                  symbol: INSTRUMENT_MAP[a.symbol].xtb,
                  side: plan.side,
                  volume: plan.volume,
                  stopLoss: Number(plan.stopLoss.toFixed(INSTRUMENT_MAP[a.symbol].digits)),
                  takeProfit: Number(plan.takeProfit.toFixed(INSTRUMENT_MAP[a.symbol].digits)),
                  comment: "AlphaDesk",
                },
              });
              log(
                "trade",
                `ORDEN REAL enviada a XTB · ${plan.side} ${res.volume} ${a.symbol} @ ${res.price} · SL ${plan.stopLoss.toFixed(4)} / TP ${plan.takeProfit.toFixed(4)}`,
              );
              await refreshXtb();
            } catch (e) {
              log("error", `XTB rechazó la orden en ${a.symbol}: ${(e as Error).message}`);
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
            log(
              "trade",
              `Apertura simulada · ${plan.side} ${plan.volume} ${a.symbol} @ ${plan.entry.toFixed(4)} · confianza ${plan.confidence}% · riesgo ${plan.riskAmount.toFixed(2)} €`,
            );
          }
        }
      }

      markToMarket(working, nextPrices, cfg);
      setAccount(working);

      if (cfg.mode === "real" && credsRef.current.userId && credsRef.current.password) {
        await refreshXtb();
      }
    } catch (e) {
      log("error", `Error en el ciclo de análisis: ${(e as Error).message}`);
    } finally {
      busyRef.current = false;
      setScanning(false);
    }
  }, [log, refreshXtb]);

  const xtbConnectedRef = useRef(false);
  xtbConnectedRef.current = xtb.connected;
  function xtbRefConnected() {
    return xtbConnectedRef.current;
  }

  // Bucle principal
  useEffect(() => {
    if (!hydrated) return;
    void scan();
    const id = window.setInterval(() => void scan(), Math.max(15, config.scanIntervalSec) * 1000);
    return () => window.clearInterval(id);
  }, [hydrated, config.scanIntervalSec, config.timeframe, config.symbols, scan]);

  const toggleRunning = useCallback(() => {
    setRunning((r) => {
      const next = !r;
      log("info", next ? "Bot ACTIVADO: ejecutará operaciones automáticamente." : "Bot en pausa: solo análisis.");
      return next;
    });
  }, [log]);

  return {
    hydrated,
    config,
    updateConfig,
    account,
    stats,
    profile,
    analyses,
    prices,
    candles,
    news,
    logs,
    running,
    toggleRunning,
    scanning,
    lastScan,
    scan,
    creds,
    saveCreds,
    xtb,
    connectXtb,
    disconnectXtb,
    refreshXtb,
    closeXtbPosition,
    closeManually,
    resetSimulation,
    liveArmed,
    setLiveArmed,
  };
}

export type TradingBot = ReturnType<typeof useTradingBot>;
