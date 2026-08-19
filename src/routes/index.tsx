import { createFileRoute } from "@tanstack/react-router";
import { Activity, Gauge, Layers, Percent, Target, Wallet } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeskHeader } from "@/components/desk/DeskHeader";
import { StatCard } from "@/components/desk/StatCard";
import { EquityChart } from "@/components/desk/EquityChart";
import { AnalysisGrid } from "@/components/desk/AnalysisGrid";
import { HistoryTable, PositionsTable } from "@/components/desk/Tables";
import { ActivityLog, NewsFeed } from "@/components/desk/Feeds";
import { ConfigPanel } from "@/components/desk/ConfigPanel";
import { XtbPanel } from "@/components/desk/XtbPanel";
import { LoginScreen } from "@/components/desk/LoginScreen";
import { useTradingBot } from "@/hooks/useTradingBot";
import { fmtMoney, fmtPct, fmtSigned } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AlphaDesk · Bot de trading automático para XTB" },
      {
        name: "description",
        content:
          "Panel de trading algorítmico con análisis técnico en tiempo real, gestión de riesgo adaptativa, simulación con dinero ficticio y ejecución real en XTB.",
      },
      { property: "og:title", content: "AlphaDesk · Bot de trading automático para XTB" },
      {
        property: "og:description",
        content:
          "Bot configurable de forex, índices, acciones, materias primas y cripto: análisis de patrones y noticias, riesgo automático y modo simulación integrado.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Desk,
});

function Desk() {
  const bot = useTradingBot();
  const { config, account, stats, analyses, logs, news, profile } = bot;

  if (!bot.authChecked) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Cargando…</div>;
  }

  if (!bot.authenticated) {
    return <LoginScreen onLogin={bot.login} missingConfig={bot.missingConfig} />;
  }

  const isSim = config.mode === "simulacion";
  const equity = isSim ? account.equity : bot.xtb.equity;
  const currency = isSim ? "€" : bot.xtb.currency || "EUR";
  const floating = account.positions.reduce((s, p) => s + p.pnl, 0);
  const signals = Object.values(analyses).filter(
    (a) => a.suggestion !== "ESPERAR" && a.confidence >= profile.minConfidence,
  ).length;

  return (
    <div className="min-h-screen">
      <DeskHeader bot={bot} />

      <main className="mx-auto max-w-[1600px] space-y-5 px-4 py-6 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <StatCard
            label={isSim ? "Capital simulado" : "Capital en XTB"}
            value={fmtMoney(equity, currency)}
            sub={isSim ? `Saldo cerrado ${fmtMoney(account.balance)}` : bot.xtb.connected ? "Cuenta conectada" : "Sin conexión"}
            icon={<Wallet className="size-4" />}
          />
          <StatCard
            label="Resultado total"
            value={fmtSigned(stats.netPnl)}
            sub={fmtPct(stats.netPnlPct)}
            tone={stats.netPnl >= 0 ? "profit" : "loss"}
            icon={<Target className="size-4" />}
          />
          <StatCard
            label="Resultado del día"
            value={fmtSigned(stats.dailyPnl)}
            sub={`Límite ${config.maxDailyLossPct}% / +${config.maxDailyProfitPct}%`}
            tone={stats.dailyPnl >= 0 ? "profit" : "loss"}
            icon={<Percent className="size-4" />}
          />
          <StatCard
            label="Flotante abierto"
            value={fmtSigned(floating)}
            sub={`${account.positions.length} posición(es)`}
            tone={floating >= 0 ? "profit" : "loss"}
            icon={<Layers className="size-4" />}
          />
          <StatCard
            label="Acierto / Factor"
            value={`${(stats.winRate * 100).toFixed(0)}%`}
            sub={`PF ${stats.profitFactor.toFixed(2)} · ${stats.totalTrades} ops`}
            tone="accent"
            icon={<Gauge className="size-4" />}
          />
          <StatCard
            label="Señales activas"
            value={String(signals)}
            sub={`Caída máx. ${stats.drawdownPct.toFixed(1)}%`}
            icon={<Activity className="size-4" />}
          />
        </section>

        <Tabs defaultValue="mercado" className="space-y-4">
          <TabsList className="bg-surface-2">
            <TabsTrigger value="mercado">Mercado</TabsTrigger>
            <TabsTrigger value="cartera">Cartera</TabsTrigger>
            <TabsTrigger value="xtb">Cuenta XTB</TabsTrigger>
            <TabsTrigger value="config">Configuración</TabsTrigger>
          </TabsList>

          <TabsContent value="mercado" className="space-y-4">
            <AnalysisGrid analyses={analyses} minConfidence={profile.minConfidence} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ActivityLog logs={logs} />
              <NewsFeed news={news} />
            </div>
          </TabsContent>

          <TabsContent value="cartera" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
              <EquityChart data={account.equityCurve} startingBalance={config.startingBalance} />
              <div className="panel grid grid-cols-2 gap-4 p-5">
                {[
                  ["Operaciones", String(stats.totalTrades)],
                  ["Ganadoras", String(stats.wins)],
                  ["Perdedoras", String(stats.losses)],
                  ["Mejor operación", fmtSigned(stats.bestTrade)],
                  ["Peor operación", fmtSigned(stats.worstTrade)],
                  ["Ganancia media", fmtMoney(stats.avgWin)],
                  ["Pérdida media", fmtMoney(stats.avgLoss)],
                  ["Exposición", fmtMoney(stats.exposure)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="label-xs">{k}</p>
                    <p className="num mt-1 text-sm font-semibold">{v}</p>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="label-xs mb-2">Posiciones abiertas (simulación)</p>
              <PositionsTable
                positions={account.positions}
                onClose={bot.closeManually}
                emptyText="El bot no tiene posiciones abiertas ahora mismo."
              />
            </div>
            <div>
              <p className="label-xs mb-2">Historial</p>
              <HistoryTable history={account.history} />
            </div>
          </TabsContent>

          <TabsContent value="xtb">
            <XtbPanel bot={bot} />
          </TabsContent>

          <TabsContent value="config">
            <ConfigPanel bot={bot} />
          </TabsContent>
        </Tabs>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 text-xs text-muted-foreground">
          <p className="max-w-3xl">
            Los datos de mercado proceden de fuentes públicas y pueden tener retraso. Operar con apalancamiento conlleva
            un riesgo elevado de pérdida de capital: esta herramienta no es asesoramiento financiero.
          </p>
          <button
            onClick={() => void bot.logout()}
            className="rounded-md border border-border px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cerrar sesión
          </button>
        </footer>
      </main>
    </div>
  );
}
