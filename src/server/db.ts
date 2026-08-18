/**
 * Capa de persistencia de AlphaDesk.
 *
 * Usa SQLite (bun:sqlite en el contenedor, node:sqlite si se ejecuta con Node)
 * y cae a un almacén en memoria cuando el runtime no ofrece SQLite
 * (por ejemplo la vista previa serverless). Server-only.
 */

export interface StoredLog {
  id: string;
  t: number;
  level: string;
  msg: string;
}

export interface LockRow {
  engineId: string;
  pid: number;
  heartbeat: number;
}

export interface Store {
  readonly kind: "sqlite" | "memory";
  readonly location: string;
  getKV(key: string): string | null;
  setKV(key: string, value: string): void;
  appendLog(entry: StoredLog): void;
  listLogs(limit: number): StoredLog[];
  clearLogs(): void;
  lockInfo(): LockRow | null;
  acquireLock(engineId: string, pid: number, staleMs: number): boolean;
  heartbeat(engineId: string): void;
  releaseLock(engineId: string): void;
}

interface SqlDb {
  prepare(sql: string): {
    run: (...params: unknown[]) => unknown;
    get: (...params: unknown[]) => unknown;
    all: (...params: unknown[]) => unknown[];
  };
  exec?: (sql: string) => unknown;
}

const MAX_LOGS = 1000;

function dynamicImport(specifier: string): Promise<unknown> {
  // Evita que el bundler intente resolver bun:sqlite / node:sqlite en build.
  const fn = new Function("s", "return import(s)") as (s: string) => Promise<unknown>;
  return fn(specifier);
}

async function openSqlite(file: string): Promise<SqlDb | null> {
  try {
    const mod = (await dynamicImport("bun:sqlite")) as { Database: new (f: string, o?: unknown) => SqlDb };
    return new mod.Database(file, { create: true });
  } catch {
    /* no es Bun */
  }
  try {
    const mod = (await dynamicImport("node:sqlite")) as {
      DatabaseSync: new (f: string) => SqlDb;
    };
    return new mod.DatabaseSync(file);
  } catch {
    return null;
  }
}

function ensureDir(file: string) {
  try {
    const idx = file.lastIndexOf("/");
    if (idx <= 0) return;
    const dir = file.slice(0, idx);
    const fn = new Function("s", "return import(s)") as (s: string) => Promise<{ mkdirSync: (p: string, o: unknown) => void }>;
    void fn("node:fs").then((fs) => {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        /* noop */
      }
    });
  } catch {
    /* noop */
  }
}

class SqliteStore implements Store {
  readonly kind = "sqlite" as const;
  constructor(
    private db: SqlDb,
    readonly location: string,
  ) {
    const stmts = [
      `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)`,
      `CREATE TABLE IF NOT EXISTS logs (id TEXT PRIMARY KEY, t INTEGER NOT NULL, level TEXT NOT NULL, msg TEXT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS logs_t ON logs (t DESC)`,
      `CREATE TABLE IF NOT EXISTS engine_lock (id INTEGER PRIMARY KEY CHECK (id = 1), engine_id TEXT NOT NULL, pid INTEGER NOT NULL, heartbeat INTEGER NOT NULL)`,
    ];
    for (const s of stmts) this.db.prepare(s).run();
  }

  getKV(key: string): string | null {
    const row = this.db.prepare(`SELECT value FROM kv WHERE key = ?`).get(key) as { value?: string } | undefined;
    return row?.value ?? null;
  }

  setKV(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, value, Date.now());
  }

  appendLog(entry: StoredLog): void {
    this.db.prepare(`INSERT OR REPLACE INTO logs (id, t, level, msg) VALUES (?, ?, ?, ?)`).run(entry.id, entry.t, entry.level, entry.msg);
    this.db.prepare(`DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY t DESC LIMIT ?)`).run(MAX_LOGS);
  }

  listLogs(limit: number): StoredLog[] {
    return this.db.prepare(`SELECT id, t, level, msg FROM logs ORDER BY t DESC LIMIT ?`).all(limit) as StoredLog[];
  }

  clearLogs(): void {
    this.db.prepare(`DELETE FROM logs`).run();
  }

  lockInfo(): LockRow | null {
    const row = this.db.prepare(`SELECT engine_id, pid, heartbeat FROM engine_lock WHERE id = 1`).get() as
      | { engine_id: string; pid: number; heartbeat: number }
      | undefined;
    return row ? { engineId: row.engine_id, pid: row.pid, heartbeat: row.heartbeat } : null;
  }

  acquireLock(engineId: string, pid: number, staleMs: number): boolean {
    const now = Date.now();
    const current = this.lockInfo();
    if (current && current.engineId !== engineId && now - current.heartbeat < staleMs) return false;
    this.db
      .prepare(
        `INSERT INTO engine_lock (id, engine_id, pid, heartbeat) VALUES (1, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET engine_id = excluded.engine_id, pid = excluded.pid, heartbeat = excluded.heartbeat`,
      )
      .run(engineId, pid, now);
    return this.lockInfo()?.engineId === engineId;
  }

  heartbeat(engineId: string): void {
    this.db.prepare(`UPDATE engine_lock SET heartbeat = ? WHERE id = 1 AND engine_id = ?`).run(Date.now(), engineId);
  }

  releaseLock(engineId: string): void {
    this.db.prepare(`DELETE FROM engine_lock WHERE id = 1 AND engine_id = ?`).run(engineId);
  }
}

class MemoryStore implements Store {
  readonly kind = "memory" as const;
  readonly location = "memoria (sin persistencia)";
  private kv = new Map<string, string>();
  private logs: StoredLog[] = [];
  private lock: LockRow | null = null;

  getKV(key: string) {
    return this.kv.get(key) ?? null;
  }
  setKV(key: string, value: string) {
    this.kv.set(key, value);
  }
  appendLog(entry: StoredLog) {
    this.logs = [entry, ...this.logs].slice(0, MAX_LOGS);
  }
  listLogs(limit: number) {
    return this.logs.slice(0, limit);
  }
  clearLogs() {
    this.logs = [];
  }
  lockInfo() {
    return this.lock;
  }
  acquireLock(engineId: string, pid: number, staleMs: number) {
    const now = Date.now();
    if (this.lock && this.lock.engineId !== engineId && now - this.lock.heartbeat < staleMs) return false;
    this.lock = { engineId, pid, heartbeat: now };
    return true;
  }
  heartbeat(engineId: string) {
    if (this.lock?.engineId === engineId) this.lock.heartbeat = Date.now();
  }
  releaseLock(engineId: string) {
    if (this.lock?.engineId === engineId) this.lock = null;
  }
}

let storePromise: Promise<Store> | undefined;

export function getStore(): Promise<Store> {
  if (!storePromise) {
    const file = process.env["ALPHADESK_DB"] ?? "/data/alphadesk.db";
    storePromise = (async () => {
      ensureDir(file);
      const db = await openSqlite(file);
      if (db) {
        try {
          const store = new SqliteStore(db, file);
          console.log(`[alphadesk] almacenamiento SQLite en ${file}`);
          return store as Store;
        } catch (e) {
          console.error("[alphadesk] no se pudo inicializar SQLite:", e);
        }
      }
      console.warn("[alphadesk] SQLite no disponible en este runtime: usando almacén en memoria (sin persistencia).");
      return new MemoryStore() as Store;
    })();
  }
  return storePromise;
}
