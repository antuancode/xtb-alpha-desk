/** Autenticación del panel y de la API del bot. Server-only. */
import { requirePanelPassword, requireSecret, missingRequiredEnv } from "./config.server";

const COOKIE = "alphadesk_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días
const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(requireSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return b64url(new Uint8Array(sig));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function createToken(): Promise<string> {
  const payload = `${Date.now() + MAX_AGE * 1000}`;
  return `${payload}.${await hmac(payload)}`;
}

async function verifyToken(token: string): Promise<boolean> {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!timingSafeEqual(sig, await hmac(payload))) return false;
  const exp = Number(payload);
  return Number.isFinite(exp) && exp > Date.now();
}

function readCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return rest.join("=");
  }
  return null;
}

export async function isAuthenticated(request: Request): Promise<boolean> {
  if (missingRequiredEnv().length > 0) return false;
  const token = readCookie(request);
  return token ? verifyToken(decodeURIComponent(token)) : false;
}

function cookieHeader(value: string, maxAge: number, secure: boolean): string {
  return [
    `${COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
    secure ? "Secure" : "",
    `Max-Age=${maxAge}`,
  ]
    .filter(Boolean)
    .join("; ");
}

function isHttps(request: Request): boolean {
  return (
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https"
  );
}

// Freno sencillo contra fuerza bruta (proceso único, memoria).
const attempts = new Map<string, { count: number; until: number }>();

function clientKey(request: Request): string {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

export async function login(request: Request, password: string): Promise<Response> {
  const missing = missingRequiredEnv();
  if (missing.length > 0) {
    return Response.json(
      { error: `Servidor sin configurar: falta ${missing.join(", ")}.` },
      { status: 503 },
    );
  }

  const key = clientKey(request);
  const entry = attempts.get(key);
  if (entry && entry.until > Date.now()) {
    return Response.json({ error: "Demasiados intentos. Espera un minuto." }, { status: 429 });
  }

  if (!timingSafeEqual(password, requirePanelPassword())) {
    const count = (entry?.count ?? 0) + 1;
    attempts.set(key, { count, until: count >= 5 ? Date.now() + 60_000 : 0 });
    return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }

  attempts.delete(key);
  return Response.json(
    { authenticated: true },
    {
      headers: {
        "set-cookie": cookieHeader(await createToken(), MAX_AGE, isHttps(request)),
        "cache-control": "no-store",
      },
    },
  );
}

export function logout(request: Request): Response {
  return Response.json(
    { authenticated: false },
    { headers: { "set-cookie": cookieHeader("", 0, isHttps(request)), "cache-control": "no-store" } },
  );
}

/** Devuelve una respuesta de error si la petición no está autenticada. */
export async function guard(request: Request): Promise<Response | null> {
  const missing = missingRequiredEnv();
  if (missing.length > 0) {
    return Response.json(
      { error: `Servidor sin configurar: falta ${missing.join(", ")}.` },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  if (await isAuthenticated(request)) return null;
  return Response.json(
    { error: "No autenticado" },
    { status: 401, headers: { "cache-control": "no-store" } },
  );
}
