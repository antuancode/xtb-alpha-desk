import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/bot/snapshot")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { guard } = await import("@/server/auth");
        const denied = await guard(request);
        if (denied) return denied;
        const { getEngine } = await import("@/server/engine");
        const engine = await getEngine();
        return Response.json(await engine.snapshot(), {
          headers: { "cache-control": "no-store" },
        });
      },
    },
  },
});
