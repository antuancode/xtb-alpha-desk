import { createFileRoute } from "@tanstack/react-router";

/** Comprobación de salud del contenedor. No expone estado ni datos sensibles. */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () => {
        const { missingRequiredEnv } = await import("@/server/config.server");
        const missing = missingRequiredEnv();
        if (missing.length > 0) {
          return Response.json(
            { status: "unconfigured" },
            { status: 503, headers: { "cache-control": "no-store" } },
          );
        }
        return Response.json(
          { status: "ok", at: Date.now() },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
