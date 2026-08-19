import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/bot/snapshot")({
  server: {
    handlers: {
      GET: async () => {
        const { getEngine } = await import("@/server/engine");
        const engine = await getEngine();
        return Response.json(await engine.snapshot(), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
