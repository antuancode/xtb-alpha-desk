/**
 * Configuración obligatoria del servidor. No hay valores por defecto:
 * si falta un secreto, la aplicación no debe funcionar.
 * Server-only.
 */

export interface MissingConfig {
  missing: string[];
}

function readRequired(name: string): string | null {
  const raw = process.env[name];
  if (!raw || raw.trim().length < 8) return null;
  return raw;
}

export function missingRequiredEnv(): string[] {
  const missing: string[] = [];
  if (!readRequired("ALPHADESK_SECRET")) missing.push("ALPHADESK_SECRET");
  if (!readRequired("ALPHADESK_PASSWORD")) missing.push("ALPHADESK_PASSWORD");
  return missing;
}

export function isConfigured(): boolean {
  return missingRequiredEnv().length === 0;
}

/** Devuelve el secreto o lanza: nunca hay clave por defecto. */
export function requireSecret(): string {
  const value = readRequired("ALPHADESK_SECRET");
  if (!value) {
    throw new Error(
      "Falta ALPHADESK_SECRET (mínimo 8 caracteres). Define una clave larga y aleatoria antes de arrancar.",
    );
  }
  return value;
}

/** Contraseña de acceso al panel. Obligatoria, sin valor por defecto. */
export function requirePanelPassword(): string {
  const value = readRequired("ALPHADESK_PASSWORD");
  if (!value) {
    throw new Error(
      "Falta ALPHADESK_PASSWORD (mínimo 8 caracteres). Define la contraseña del panel antes de arrancar.",
    );
  }
  return value;
}

/**
 * Comprobación de arranque. En producción el proceso muere si falta un secreto;
 * en desarrollo se registra el error y las rutas protegidas responden 503.
 */
export function assertServerConfig(): void {
  const missing = missingRequiredEnv();
  if (missing.length === 0) return;
  const message = `AlphaDesk no puede arrancar: faltan variables obligatorias (${missing.join(", ")}).`;
  if (process.env["NODE_ENV"] === "production") {
    console.error(message);
    throw new Error(message);
  }
  console.error(`${message} Las rutas del bot responderán 503 hasta que las definas.`);
}
