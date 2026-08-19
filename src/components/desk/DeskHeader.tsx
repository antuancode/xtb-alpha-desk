import { Activity, Pause, Play, RefreshCw, ShieldCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TradingBot } from "@/hooks/useTradingBot";

export function DeskHeader({ bot }: { bot: TradingBot }) {
  const { config, running, scanning, lastScan, toggleRunning, scan, profile, connection, status } = bot;
  const conn: Record<typeof connection, { text: string; cls: string }> = {
    conectando: { text: "Conectando con el servidor…", cls: "text-muted-foreground" },
    "en-vivo": { text: "Servidor en vivo", cls: "text-profit" },
    sondeo: { text: "Servidor (sondeo)", cls: "text-accent" },
    "sin-conexion": { text: "Servidor no disponible", cls: "text-loss" },
  };
  const isReal = config.mode === "real";

  return (
    <header className="sticky top-0 z-30 border-b border-border/80 bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Activity className="size-5" />
          </div>
          <div className="leading-tight">
            <h1 className="text-base font-semibold tracking-tight">AlphaDesk</h1>
            <p className="label-xs">Trading algorítmico · XTB</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "num gap-1.5 border-border bg-surface-2 px-2.5 py-1 text-xs",
              isReal ? "text-loss" : "text-primary",
            )}
          >
            <span className={cn("size-1.5 rounded-full", isReal ? "bg-loss" : "bg-primary", running && "live-dot")} />
            {isReal ? "DINERO REAL" : "SIMULACIÓN"}
          </Badge>

          <Badge variant="outline" className="gap-1.5 border-border bg-surface-2 px-2.5 py-1 text-xs text-accent">
            <ShieldCheck className="size-3.5" /> {profile.label}
          </Badge>

          {config.analysisOnly && (
            <Badge variant="outline" className="border-border bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground">
              Solo análisis
            </Badge>
          )}

          <span className="num hidden text-xs text-muted-foreground sm:inline">
            {lastScan ? `Último escaneo ${fmtTime(lastScan)}` : "Esperando datos…"}
          </span>

          <Button variant="outline" size="sm" onClick={() => void scan()} disabled={scanning}>
            <RefreshCw className={cn("size-4", scanning && "animate-spin")} />
            <span className="hidden sm:inline">Escanear</span>
          </Button>

          <Button
            size="sm"
            variant={running ? "destructive" : "default"}
            onClick={toggleRunning}
            className="min-w-28"
          >
            {running ? <Pause className="size-4" /> : <Play className="size-4" />}
            {running ? "Detener bot" : "Activar bot"}
          </Button>

          {running && !config.analysisOnly && (
            <span className="num flex items-center gap-1 text-xs text-primary">
              <Zap className="size-3.5" /> auto
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
