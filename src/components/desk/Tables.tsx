import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INSTRUMENT_MAP } from "@/lib/trading/instruments";
import { fmtDateTime, fmtPrice, fmtSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClosedTrade, Position } from "@/lib/trading/types";

export function PositionsTable({
  positions,
  onClose,
  emptyText,
}: {
  positions: Position[];
  onClose: (id: string) => void;
  emptyText: string;
}) {
  if (!positions.length) {
    return <div className="panel p-6 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-border">
            {["Instrumento", "Dirección", "Volumen", "Entrada", "Actual", "SL / TP", "P/L", ""].map((h) => (
              <th key={h} className="label-xs px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const digits = INSTRUMENT_MAP[p.symbol]?.digits ?? 2;
            return (
              <tr key={p.id} className="row-in border-b border-border/60 last:border-0">
                <td className="px-3 py-2.5">
                  <p className="font-medium">{p.symbol}</p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(p.openTime)}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "num rounded px-1.5 py-0.5 text-xs font-semibold",
                      p.side === "BUY" ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
                    )}
                  >
                    {p.side === "BUY" ? "COMPRA" : "VENTA"}
                  </span>
                </td>
                <td className="num px-3 py-2.5">{p.volume}</td>
                <td className="num px-3 py-2.5">{fmtPrice(p.openPrice, digits)}</td>
                <td className="num px-3 py-2.5">{fmtPrice(p.currentPrice || p.openPrice, digits)}</td>
                <td className="num px-3 py-2.5 text-xs text-muted-foreground">
                  {fmtPrice(p.stopLoss, digits)} / {fmtPrice(p.takeProfit, digits)}
                </td>
                <td className={cn("num px-3 py-2.5 font-semibold", p.pnl >= 0 ? "text-profit" : "text-loss")}>
                  {fmtSigned(p.pnl)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Button size="icon" variant="ghost" onClick={() => onClose(p.id)} aria-label="Cerrar posición">
                    <X className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function HistoryTable({ history }: { history: ClosedTrade[] }) {
  if (!history.length) {
    return <div className="panel p-6 text-center text-sm text-muted-foreground">Todavía no hay operaciones cerradas.</div>;
  }

  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border">
            {["Cierre", "Instrumento", "Dirección", "Volumen", "Entrada", "Salida", "Motivo", "Resultado"].map((h) => (
              <th key={h} className="label-xs px-3 py-2 text-left font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {history.slice(0, 60).map((t) => {
            const digits = INSTRUMENT_MAP[t.symbol]?.digits ?? 2;
            return (
              <tr key={t.id} className="border-b border-border/60 last:border-0">
                <td className="num px-3 py-2 text-xs text-muted-foreground">{fmtDateTime(t.closeTime)}</td>
                <td className="px-3 py-2 font-medium">{t.symbol}</td>
                <td className="px-3 py-2">
                  <span className={cn("num text-xs", t.side === "BUY" ? "text-profit" : "text-loss")}>
                    {t.side === "BUY" ? "COMPRA" : "VENTA"}
                  </span>
                </td>
                <td className="num px-3 py-2">{t.volume}</td>
                <td className="num px-3 py-2">{fmtPrice(t.openPrice, digits)}</td>
                <td className="num px-3 py-2">{fmtPrice(t.closePrice, digits)}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{t.exit}</td>
                <td className={cn("num px-3 py-2 font-semibold", t.pnl >= 0 ? "text-profit" : "text-loss")}>
                  {fmtSigned(t.pnl)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
