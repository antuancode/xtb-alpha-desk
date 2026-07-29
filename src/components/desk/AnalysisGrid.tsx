import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { INSTRUMENT_MAP, ASSET_CLASS_LABEL } from "@/lib/trading/instruments";
import { fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Analysis } from "@/lib/trading/types";

function ScoreBar({ score }: { score: number }) {
  const width = Math.min(50, Math.abs(score) / 2);
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
      <div className="absolute inset-y-0 left-1/2 w-px bg-grid" />
      <div
        className={cn("absolute inset-y-0 rounded-full", score >= 0 ? "bg-profit" : "bg-loss")}
        style={
          score >= 0
            ? { left: "50%", width: `${width}%` }
            : { right: "50%", width: `${width}%` }
        }
      />
    </div>
  );
}

export function AnalysisGrid({ analyses, minConfidence }: { analyses: Record<string, Analysis>; minConfidence: number }) {
  const list = Object.values(analyses).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  if (!list.length) {
    return (
      <div className="panel p-8 text-center text-sm text-muted-foreground">
        Descargando datos de mercado reales…
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((a) => {
        const inst = INSTRUMENT_MAP[a.symbol];
        const actionable = a.suggestion !== "ESPERAR" && a.confidence >= minConfidence;
        return (
          <div
            key={a.symbol}
            className={cn(
              "panel row-in p-4 transition-colors",
              actionable && (a.suggestion === "BUY" ? "border-profit/40" : "border-loss/40"),
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold tracking-tight">{inst?.name ?? a.symbol}</p>
                <p className="label-xs">
                  {a.symbol} · {inst ? ASSET_CLASS_LABEL[inst.assetClass] : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="num text-sm font-semibold">{fmtPrice(a.price, inst?.digits ?? 2)}</p>
                <p
                  className={cn(
                    "num flex items-center justify-end gap-1 text-xs",
                    a.trend === "alcista" ? "text-profit" : a.trend === "bajista" ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {a.trend === "alcista" ? (
                    <ArrowUpRight className="size-3" />
                  ) : a.trend === "bajista" ? (
                    <ArrowDownRight className="size-3" />
                  ) : (
                    <Minus className="size-3" />
                  )}
                  {a.trend}
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="label-xs">Señal</span>
                <span
                  className={cn(
                    "num font-semibold",
                    a.score > 0 ? "text-profit" : a.score < 0 ? "text-loss" : "text-muted-foreground",
                  )}
                >
                  {a.score > 0 ? "+" : ""}
                  {a.score}
                </span>
              </div>
              <ScoreBar score={a.score} />
            </div>

            <div className="num mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="label-xs">RSI</p>
                <p className={cn(a.rsi > 70 ? "text-loss" : a.rsi < 30 ? "text-profit" : "")}>{a.rsi.toFixed(0)}</p>
              </div>
              <div>
                <p className="label-xs">Volatilidad</p>
                <p>{a.volatilityPct.toFixed(2)}%</p>
              </div>
              <div>
                <p className="label-xs">Confianza</p>
                <p className={cn(a.confidence >= minConfidence ? "text-accent" : "text-muted-foreground")}>
                  {a.confidence}%
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
              <p className="line-clamp-2 text-xs text-muted-foreground">{a.reasons.slice(0, 2).join(" · ")}</p>
              <span
                className={cn(
                  "num shrink-0 rounded-md px-2 py-1 text-xs font-semibold",
                  a.suggestion === "BUY"
                    ? "bg-profit/15 text-profit"
                    : a.suggestion === "SELL"
                      ? "bg-loss/15 text-loss"
                      : "bg-surface-2 text-muted-foreground",
                )}
              >
                {a.suggestion === "BUY" ? "COMPRA" : a.suggestion === "SELL" ? "VENTA" : "ESPERAR"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
