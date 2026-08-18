/** Cifrado AES-GCM para las credenciales guardadas en SQLite. Server-only. */

const enc = new TextEncoder();
const dec = new TextDecoder();

async function key(): Promise<CryptoKey> {
  const secret = process.env["ALPHADESK_SECRET"] ?? "alphadesk-default-insecure-key";
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function encryptJson(value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify(value));
  const buf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), data);
  return `${toB64(iv)}.${toB64(new Uint8Array(buf))}`;
}

export async function decryptJson<T>(payload: string): Promise<T | null> {
  try {
    const [ivB64, dataB64] = payload.split(".");
    if (!ivB64 || !dataB64) return null;
    const buf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(ivB64) },
      await key(),
      fromB64(dataB64),
    );
    return JSON.parse(dec.decode(buf)) as T;
  } catch {
    return null;
  }
}
