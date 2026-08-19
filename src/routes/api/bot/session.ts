import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({ password: z.string().min(1).max(256) });

export const Route = createFileRoute("/api/bot/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { isAuthenticated } = await import("@/server/auth");
        const { missingRequiredEnv } = await import("@/server/config.server");
        return Response.json(
          { authenticated: await isAuthenticated(request), missing: missingRequiredEnv() },
          { headers: { "cache-control": "no-store" } },
        );
      },
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Petición no válida" }, { status: 400 });
        const { login } = await import("@/server/auth");
        return login(request, parsed.data.password);
      },
      DELETE: async ({ request }) => {
        const { logout } = await import("@/server/auth");
        return logout(request);
      },
    },
  },
});
