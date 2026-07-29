import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "profit" | "loss" | "accent";
  icon?: ReactNode;
}) {
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="label-xs">{label}</span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p
        className={cn(
          "num mt-2 text-2xl font-semibold tracking-tight",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          tone === "accent" && "text-accent",
        )}
      >
        {value}
      </p>
      {sub && <p className="num mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
