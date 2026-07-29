/**
 * Cliente XTB (xStation5 JSON API sobre WebSocket).
 * Server-only: nunca importar desde el navegador.
 */

type AnyRecord = Record<string, unknown>;

export interface XtbCredentials {
  userId: string;
  password: string;
  account: "real" | "demo";
}

interface Socketish {
  send(data: string): void;
  close(): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: () => void): void;
  onError(cb: (err: unknown) => void): void;
}

const ENDPOINTS = {
  real: "wss://ws.xtb.com/real",
  demo: "wss://ws.xtb.com/demo",
};

async function openSocket(url: string): Promise<Socketish> {
  const G = globalThis as unknown as { WebSocket?: new (url: string) => WebSocket };

  if (typeof G.WebSocket === "function") {
    const ws = new G.WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout conectando con XTB")), 15000);
      ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("No se pudo abrir la conexión con XTB"));
      });
    });
    return {
      send: (d) => ws.send(d),
      close: () => ws.close(),
      onMessage: (cb) => ws.addEventListener("message", (e) => cb(String((e as MessageEvent).data))),
      onClose: (cb) => ws.addEventListener("close", () => cb()),
      onError: (cb) => ws.addEventListener("error", (e) => cb(e)),
    };
  }

  // Runtime tipo Cloudflare Workers: upgrade vía fetch
  const res = await fetch(url.replace("wss://", "https://"), { headers: { Upgrade: "websocket" } });
  const socket = (res as unknown as { webSocket?: WebSocket }).webSocket;
  if (!socket) throw new Error("El entorno del servidor no permite abrir WebSockets hacia XTB");
  (socket as unknown as { accept: () => void }).accept();
  return {
    send: (d) => socket.send(d),
    close: () => socket.close(),
    onMessage: (cb) => socket.addEventListener("message", (e) => cb(String((e as MessageEvent).data))),
    onClose: (cb) => socket.addEventListener("close", () => cb()),
    onError: (cb) => socket.addEventListener("error", (e) => cb(e)),
  };
}

export class XtbSession {
  private socket: Socketish | null = null;
  private buffer = "";
  private queue: Array<(msg: AnyRecord) => void> = [];
  private closed = false;
  streamSessionId: string | null = null;

  async connect(creds: XtbCredentials) {
    this.socket = await openSocket(ENDPOINTS[creds.account]);
    this.socket.onMessage((chunk) => this.handleChunk(chunk));
    this.socket.onClose(() => {
      this.closed = true;
    });
    this.socket.onError(() => {
      this.closed = true;
    });

    const login = await this.command("login", {
      userId: creds.userId,
      password: creds.password,
    });
    if (!login.status) {
      throw new Error(String(login.errorDescr ?? "Credenciales de XTB rechazadas"));
    }
    this.streamSessionId = (login.streamSessionId as string) ?? null;
  }

  private handleChunk(chunk: string) {
    this.buffer += chunk;
    // XTB separa mensajes con dos saltos de línea
    let idx: number;
    while ((idx = this.buffer.indexOf("\n\n")) !== -1) {
      const raw = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 2);
      this.dispatch(raw);
    }
    const trimmed = this.buffer.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      this.buffer = "";
      this.dispatch(trimmed);
    }
  }

  private dispatch(raw: string) {
    if (!raw) return;
    let parsed: AnyRecord;
    try {
      parsed = JSON.parse(raw) as AnyRecord;
    } catch {
      return;
    }
    const resolver = this.queue.shift();
    if (resolver) resolver(parsed);
  }

  async command(command: string, args: AnyRecord = {}): Promise<AnyRecord> {
    if (!this.socket || this.closed) throw new Error("Conexión con XTB cerrada");
    const payload = JSON.stringify({ command, arguments: args });
    return new Promise<AnyRecord>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`XTB no respondió a "${command}"`)), 20000);
      this.queue.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      try {
        this.socket!.send(payload);
      } catch (e) {
        clearTimeout(timer);
        reject(e as Error);
      }
    });
  }

  async close() {
    try {
      if (this.socket && !this.closed) {
        await this.command("logout").catch(() => undefined);
        this.socket.close();
      }
    } catch {
      /* noop */
    }
    this.closed = true;
  }
}

export async function withXtb<T>(creds: XtbCredentials, fn: (s: XtbSession) => Promise<T>): Promise<T> {
  const session = new XtbSession();
  await session.connect(creds);
  try {
    return await fn(session);
  } finally {
    await session.close();
  }
}

export function expectData<T>(res: AnyRecord, label: string): T {
  if (!res.status) throw new Error(`${label}: ${String(res.errorDescr ?? res.errorCode ?? "error desconocido")}`);
  return res.returnData as T;
}
