import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computeStats, createAccount } from "@/lib/trading/engine";
import { riskProfile } from "@/lib/trading/strategy";
import { DEFAULT_CONFIG } from "@/lib/trading/config";
import type { BotConfig } from "@/lib/trading/types";
import type { BotSnapshot } from "@/lib/bot-types";

export { DEFAULT_CONFIG };

export interface XtbCredsInput {
  userId: string;
  password: string;
  account: "real" | "demo";
}

async function postCommand(body: unknown): Promise<BotSnapshot> {
  const res = await fetch("/api/bot/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as BotSnapshot | { error: string };
  if (!res.ok) throw new Error((json as { error: string }).error ?? "Error del servidor");
  return json as BotSnapshot;
}

/**
 * El bot vive en el servidor: este hook solo lee su estado (SSE + respaldo por
 * sondeo) y le envía comandos. Cerrar el navegador no detiene nada.
 */
export function useTradingBot() {
  const [snapshot, setSnapshot] = useState<BotSnapshot | null>(null);
  const [connection, setConnection] = useState<"conectando" | "en-vivo" | "sondeo" | "sin-conexion">("conectando");
  const [actionError, setActionError] = useState<string | null>(null);
  const [auth, setAuth] = useState<{ checked: boolean; authenticated: boolean; missing: string[] }>({
    checked: false,
    authenticated: false,
    missing: [],
  });
  const mounted = useRef(true);

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch("/api/bot/session", { cache: "no-store" });
      const json = (await res.json()) as { authenticated: boolean; missing?: string[] };
      if (mounted.current) {
        setAuth({ checked: true, authenticated: json.authenticated, missing: json.missing ?? [] });
      }
    } catch {
      if (mounted.current) setAuth({ checked: true, authenticated: false, missing: [] });
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (password: string) => {
    const res = await fetch("/api/bot/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? "No se pudo iniciar sesión");
    if (mounted.current) setAuth({ checked: true, authenticated: true, missing: [] });
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/bot/session", { method: "DELETE" });
    if (mounted.current) {
      setSnapshot(null);
      setAuth({ checked: true, authenticated: false, missing: [] });
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = useCallback((s: BotSnapshot) => {
    if (mounted.current) setSnapshot(s);
  }, []);

  // Flujo en tiempo real desde el servidor, con sondeo de respaldo.
  useEffect(() => {
    if (!auth.authenticated) return;
    let poll: ReturnType<typeof setInterval> | null = null;
    let source: EventSource | null = null;

    const startPolling = () => {
      if (poll) return;
      setConnection("sondeo");
      const tick = async () => {
        try {
          const res = await fetch("/api/bot/snapshot", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          apply((await res.json()) as BotSnapshot);
          setConnection((c) => (c === "sin-conexion" ? "sondeo" : c));
        } catch {
          setConnection("sin-conexion");
        }
      };
      void tick();
      poll = setInterval(() => void tick(), 5000);
    };

    try {
      source = new EventSource("/api/bot/stream");
      source.onmessage = (ev) => {
        try {
          apply(JSON.parse(ev.data as string) as BotSnapshot);
          setConnection("en-vivo");
          if (poll) {
            clearInterval(poll);
            poll = null;
          }
        } catch {
          /* ignorar mensajes corruptos */
        }
      };
      source.onerror = () => startPolling();
    } catch {
      startPolling();
    }

    return () => {
      source?.close();
      if (poll) clearInterval(poll);
    };
  }, [apply]);

  const run = useCallback(async (body: unknown) => {
    try {
      setActionError(null);
      const s = await postCommand(body);
      if (mounted.current) setSnapshot(s);
    } catch (e) {
      if (mounted.current) setActionError((e as Error).message);
    }
  }, []);

  const config = snapshot?.config ?? DEFAULT_CONFIG;
  const fallbackAccount = useMemo(() => createAccount(DEFAULT_CONFIG.startingBalance), []);
  const account = snapshot?.account ?? fallbackAccount;
  const stats = useMemo(() => computeStats(account, config.startingBalance), [account, config.startingBalance]);
  const profile = useMemo(() => riskProfile(config.aggressiveness), [config.aggressiveness]);

  const updateConfig = useCallback((patch: Partial<BotConfig>) => void run({ action: "config", patch }), [run]);
  const scan = useCallback(() => run({ action: "scan" }), [run]);
  const toggleRunning = useCallback(
    () => void run({ action: snapshot?.status.running ? "stop" : "start" }),
    [run, snapshot?.status.running],
  );
  const setLiveArmed = useCallback((armed: boolean) => void run({ action: "arm", armed }), [run]);
  const closeManually = useCallback((positionId: string) => void run({ action: "closeSim", positionId }), [run]);
  const resetSimulation = useCallback((balance: number) => void run({ action: "resetSim", balance }), [run]);
  const refreshXtb = useCallback(() => run({ action: "refreshXtb" }), [run]);
  const closeXtbPosition = useCallback(
    (orderId: number, symbol: string, volume: number, side: "BUY" | "SELL") =>
      run({ action: "closeXtb", orderId, symbol, volume, side }),
    [run],
  );

  const saveCredentials = useCallback(async (creds: XtbCredsInput) => {
    try {
      setActionError(null);
      const res = await fetch("/api/bot/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(creds),
      });
      const json = (await res.json()) as BotSnapshot | { error: string };
      if (!res.ok) throw new Error((json as { error: string }).error);
      if (mounted.current) setSnapshot(json as BotSnapshot);
    } catch (e) {
      if (mounted.current) setActionError((e as Error).message);
    }
  }, []);

  const clearCredentials = useCallback(async () => {
    try {
      setActionError(null);
      const res = await fetch("/api/bot/credentials", { method: "DELETE" });
      const json = (await res.json()) as BotSnapshot | { error: string };
      if (!res.ok) throw new Error((json as { error: string }).error);
      if (mounted.current) setSnapshot(json as BotSnapshot);
    } catch (e) {
      if (mounted.current) setActionError((e as Error).message);
    }
  }, []);

  return {
    hydrated: snapshot !== null,
    connection,
    actionError,
    status: snapshot?.status ?? null,
    config,
    updateConfig,
    account,
    stats,
    profile,
    analyses: snapshot?.analyses ?? {},
    prices: snapshot?.prices ?? {},
    news: snapshot?.news ?? [],
    logs: snapshot?.logs ?? [],
    running: snapshot?.status.running ?? false,
    scanning: snapshot?.status.scanning ?? false,
    lastScan: snapshot?.status.lastScanAt ?? null,
    liveArmed: snapshot?.status.liveArmed ?? false,
    xtb: snapshot?.xtb ?? {
      configured: false,
      source: null,
      login: null,
      account: "real" as const,
      connected: false,
      balance: 0,
      equity: 0,
      freeMargin: 0,
      currency: "EUR",
      positions: [],
      error: null,
      lastOkAt: null,
    },
    toggleRunning,
    scan,
    setLiveArmed,
    closeManually,
    resetSimulation,
    refreshXtb,
    closeXtbPosition,
    saveCredentials,
    clearCredentials,
  };
}

export type TradingBot = ReturnType<typeof useTradingBot>;
