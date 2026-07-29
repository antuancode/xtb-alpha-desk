import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtMoney, fmtTime } from "@/lib/format";

export function EquityChart({
  data,
  startingBalance,
}: {
  data: { t: number; equity: number }[];
  startingBalance: number;
}) {
  const points = data.slice(-240);
  const positive = points.length ? points[points.length - 1].equity >= startingBalance : true;

  return (
    <div className="panel p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="label-xs">Curva de capital</span>
        <span className="num text-xs text-muted-foreground">{points.length} puntos</span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={positive ? "var(--color-profit)" : "var(--color-loss)"}
                  stopOpacity={0.45}
                />
                <stop
                  offset="100%"
                  stopColor={positive ? "var(--color-profit)" : "var(--color-loss)"}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="t"
              tickFormatter={(v) => fmtTime(Number(v))}
              stroke="var(--color-muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={48}
            />
            <YAxis
              domain={["auto", "auto"]}
              stroke="var(--color-muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(v) => Number(v).toFixed(0)}
            />
            <Tooltip
              contentStyle={{
                background: "var(--color-popover)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(v) => fmtTime(Number(v))}
              formatter={(v) => [fmtMoney(Number(v)), "Capital"]}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke={positive ? "var(--color-profit)" : "var(--color-loss)"}
              strokeWidth={2}
              fill="url(#eq)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
