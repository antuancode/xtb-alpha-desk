/** Bus de eventos en proceso para empujar cambios a los paneles vía SSE. Server-only. */

export type BotEvent = { type: "snapshot" | "logs" | "state"; at: number };

type Listener = (event: BotEvent) => void;

const g = globalThis as unknown as { __alphadeskBus?: Set<Listener> };
const listeners: Set<Listener> = (g.__alphadeskBus ??= new Set<Listener>());

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publish(event: BotEvent): void {
  for (const l of [...listeners]) {
    try {
      l(event);
    } catch {
      /* un panel caído no debe romper el motor */
    }
  }
}

export function subscriberCount(): number {
  return listeners.size;
}
