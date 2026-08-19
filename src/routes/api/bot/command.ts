import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("scan") }),
  z.object({ action: z.literal("arm"), armed: z.boolean() }),
  z.object({ action: z.literal("config"), patch: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("closeSim"), positionId: z.string().min(1).max(64) }),
  z.object({ action: z.literal("resetSim"), balance: z.number().min(100).max(10_000_000) }),
  z.object({
    action: z.literal("closeXtb"),
    orderId: z.number().int(),
    symbol: z.string().min(1).max(32),
    volume: z.number().positive(),
    side: z.enum(["BUY", "SELL"]),
  }),
  z.object({ action: z.literal("refreshXtb") }),
]);

export const Route = createFileRoute("/api/bot/command")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { guard } = await import("@/server/auth");
        const denied = await guard(request);
        if (denied) return denied;
        const parsed = bodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
          return Response.json({ error: "Comando no válido" }, { status: 400 });
        }
        const cmd = parsed.data;
        const { getEngine } = await import("@/server/engine");
        const engine = await getEngine();

        try {
          switch (cmd.action) {
            case "start":
              await engine.start();
              break;
            case "stop":
              await engine.stop();
              break;
            case "scan":
              void engine.scanNow();
              break;
            case "arm":
              await engine.setLiveArmed(cmd.armed);
              break;
            case "config":
              await engine.updateConfig(cmd.patch as never);
              break;
            case "closeSim":
              await engine.closeSimulatedPosition(cmd.positionId);
              break;
            case "resetSim":
              await engine.resetSimulation(cmd.balance);
              break;
            case "closeXtb":
              await engine.closeXtbPosition(cmd.orderId, cmd.symbol, cmd.volume, cmd.side);
              break;
            case "refreshXtb":
              await engine.refreshXtbView();
              break;
          }
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 400 });
        }

        return Response.json(await engine.snapshot(), { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
