/** Estado persistente del bot (config, cuenta simulada, logs, credenciales). Server-only. */
import { getStore } from "./db";
import { decryptJson, encryptJson } from "./crypto";
import { DEFAULT_CONFIG, sanitizeConfig } from "@/lib/trading/config";
import { createAccount, type PaperAccount } from "@/lib/trading/engine";
import type { BotConfig, LogEntry } from "@/lib/trading/types";

export interface PersistedState {
  running: boolean;
  liveArmed: boolean;
  startedAt: number | null;
  lastScanAt: number | null;
  lastXtbOkAt: number | null;
  lastError: string | null;
}

export interface XtbCredentials {
  userId: string;
  password: string;
  account: "real" | "demo";
}

const DEFAULT_STATE: PersistedState = {
  running: false,
  liveArmed: false,
  startedAt: null,
  lastScanAt: null,
  lastXtbOkAt: null,
  lastError: null,
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const store = await getStore();
  const raw = store.getKV(key);
  if (!raw) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  const store = await getStore();
  store.setKV(key, JSON.stringify(value));
}

export async function getState(): Promise<PersistedState> {
  return readJson<PersistedState>("state", DEFAULT_STATE);
}

export async function patchState(patch: Partial<PersistedState>): Promise<PersistedState> {
  const next = { ...(await getState()), ...patch };
  await writeJson("state", next);
  return next;
}

export async function getConfig(): Promise<BotConfig> {
  return readJson<BotConfig>("config", DEFAULT_CONFIG);
}

export async function setConfig(patch: Partial<BotConfig>): Promise<BotConfig> {
  const next = sanitizeConfig(patch, await getConfig());
  await writeJson("config", next);
  return next;
}

export async function getAccount(): Promise<PaperAccount> {
  const store = await getStore();
  const raw = store.getKV("account");
  if (!raw) {
    const cfg = await getConfig();
    const fresh = createAccount(cfg.startingBalance);
    await writeJson("account", fresh);
    return fresh;
  }
  try {
    return JSON.parse(raw) as PaperAccount;
  } catch {
    const cfg = await getConfig();
    return createAccount(cfg.startingBalance);
  }
}

export async function setAccount(account: PaperAccount): Promise<void> {
  await writeJson("account", account);
}

export async function appendLog(level: LogEntry["level"], msg: string): Promise<LogEntry> {
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    t: Date.now(),
    level,
    msg,
  };
  const store = await getStore();
  store.appendLog(entry);
  return entry;
}

export async function getLogs(limit = 250): Promise<LogEntry[]> {
  const store = await getStore();
  return store.listLogs(limit).map((l) => ({ id: l.id, t: l.t, level: l.level as LogEntry["level"], msg: l.msg }));
}

export async function clearLogs(): Promise<void> {
  (await getStore()).clearLogs();
}

/** Credenciales: primero el entorno, si no las guardadas cifradas en SQLite. */
export async function getCredentials(): Promise<{ creds: XtbCredentials | null; source: "env" | "db" | null }> {
  const userId = process.env["XTB_USER_ID"];
  const password = process.env["XTB_PASSWORD"];
  if (userId && password) {
    const account = process.env["XTB_ACCOUNT"] === "demo" ? "demo" : "real";
    return { creds: { userId, password, account }, source: "env" };
  }
  const store = await getStore();
  const raw = store.getKV("xtb_credentials");
  if (!raw) return { creds: null, source: null };
  const creds = await decryptJson<XtbCredentials>(raw);
  return creds ? { creds, source: "db" } : { creds: null, source: null };
}

export async function saveCredentials(creds: XtbCredentials): Promise<void> {
  const store = await getStore();
  store.setKV("xtb_credentials", await encryptJson(creds));
}

export async function deleteCredentials(): Promise<void> {
  const store = await getStore();
  store.setKV("xtb_credentials", "");
}

export function maskLogin(userId: string): string {
  if (userId.length <= 4) return "••••";
  return `${"•".repeat(Math.max(2, userId.length - 4))}${userId.slice(-4)}`;
}
