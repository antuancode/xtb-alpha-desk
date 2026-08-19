import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  userId: z.string().min(3).max(32),
  password: z.string().min(3).max(128),
  account: z.enum(["real", "demo"]),
});

export const Route = createFileRoute("/api/bot/credentials")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Credenciales no válidas" }, { status: 400 });

        const { getCredentials, saveCredentials } = await import("@/server/state");
        const { source } = await getCredentials();
        if (source === "env") {
          return Response.json(
            { error: "Las credenciales vienen de variables de entorno y no se pueden cambiar desde el panel." },
            { status: 409 },
          );
        }
        await saveCredentials(parsed.data);
        const { getEngine } = await import("@/server/engine");
        const engine = await getEngine();
        await engine.refreshXtbView();
        return Response.json(await engine.snapshot());
      },
      DELETE: async () => {
        const { deleteCredentials, getCredentials } = await import("@/server/state");
        const { source } = await getCredentials();
        if (source === "env") {
          return Response.json({ error: "Definidas por entorno: elimínalas del archivo .env." }, { status: 409 });
        }
        await deleteCredentials();
        const { getEngine } = await import("@/server/engine");
        const engine = await getEngine();
        await engine.refreshXtbView();
        return Response.json(await engine.snapshot());
      },
    },
  },
});
