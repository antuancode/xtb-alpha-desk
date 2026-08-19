import { createFileRoute } from "@tanstack/react-router";

/** Flujo SSE: empuja el estado completo del bot a todos los paneles conectados. */
export const Route = createFileRoute("/api/bot/stream")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { getEngine } = await import("@/server/engine");
        const { subscribe } = await import("@/server/bus");
        const engine = await getEngine();

        const encoder = new TextEncoder();
        let unsubscribe: (() => void) | null = null;
        let keepAlive: ReturnType<typeof setInterval> | null = null;

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            let closed = false;
            const send = (data: unknown) => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
              } catch {
                closed = true;
              }
            };

            send(await engine.snapshot());

            let pending = false;
            unsubscribe = subscribe(() => {
              if (pending) return;
              pending = true;
              setTimeout(() => {
                pending = false;
                void engine.snapshot().then(send);
              }, 250);
            });

            keepAlive = setInterval(() => {
              if (closed) return;
              try {
                controller.enqueue(encoder.encode(": ping\n\n"));
              } catch {
                closed = true;
              }
            }, 20_000);

            request.signal.addEventListener("abort", () => {
              closed = true;
              unsubscribe?.();
              if (keepAlive) clearInterval(keepAlive);
              try {
                controller.close();
              } catch {
                /* ya cerrado */
              }
            });
          },
          cancel() {
            unsubscribe?.();
            if (keepAlive) clearInterval(keepAlive);
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream; charset=utf-8",
            "cache-control": "no-store, no-transform",
            connection: "keep-alive",
            "x-accel-buffering": "no",
          },
        });
      },
    },
  },
});
