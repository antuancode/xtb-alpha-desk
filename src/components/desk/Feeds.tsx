import { ScrollArea } from "@/components/ui/scroll-area";
import { fmtTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { LogEntry, NewsItem } from "@/lib/trading/types";

const LEVEL_STYLES: Record<LogEntry["level"], string> = {
  info: "text-muted-foreground",
  trade: "text-primary",
  warn: "text-warn",
  error: "text-loss",
  analysis: "text-accent",
};

export function ActivityLog({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="panel flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <span className="label-xs">Registro de actividad</span>
      </div>
      <ScrollArea className="h-[420px]">
        <div className="divide-y divide-border/50">
          {logs.map((l) => (
            <div key={l.id} className="row-in flex gap-3 px-4 py-2 text-xs">
              <span className="num shrink-0 text-muted-foreground">{fmtTime(l.t)}</span>
              <span className={cn("leading-relaxed", LEVEL_STYLES[l.level])}>{l.msg}</span>
            </div>
          ))}
          {!logs.length && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Sin actividad todavía.</p>}
        </div>
      </ScrollArea>
    </div>
  );
}

export function NewsFeed({ news }: { news: NewsItem[] }) {
  return (
    <div className="panel flex h-full flex-col">
      <div className="border-b border-border px-4 py-3">
        <span className="label-xs">Noticias de mercado</span>
      </div>
      <ScrollArea className="h-[420px]">
        <div className="divide-y divide-border/50">
          {news.map((n, i) => (
            <a
              key={`${n.link}-${i}`}
              href={n.link}
              target="_blank"
              rel="noreferrer noopener"
              className="block px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <div className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-1 size-1.5 shrink-0 rounded-full",
                    n.sentiment > 0.15 ? "bg-profit" : n.sentiment < -0.15 ? "bg-loss" : "bg-muted-foreground",
                  )}
                />
                <div>
                  <p className="text-xs leading-relaxed">{n.title}</p>
                  <p className="num mt-1 text-[11px] text-muted-foreground">
                    {n.symbols.join(", ")} · {fmtTime(n.time)}
                  </p>
                </div>
              </div>
            </a>
          ))}
          {!news.length && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              Sin titulares recientes para los instrumentos seleccionados.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
