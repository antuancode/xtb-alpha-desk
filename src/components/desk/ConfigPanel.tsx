import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ASSET_CLASS_LABEL, INSTRUMENTS } from "@/lib/trading/instruments";
import { cn } from "@/lib/utils";
import type { TradingBot } from "@/hooks/useTradingBot";
import type { AssetClass } from "@/lib/trading/types";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm">{label}</Label>
        {hint && <span className="num text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export function ConfigPanel({ bot }: { bot: TradingBot }) {
  const { config, updateConfig, profile, resetSimulation } = bot;
  const [newBalance, setNewBalance] = useState(String(config.startingBalance));

  const grouped = INSTRUMENTS.reduce<Record<AssetClass, typeof INSTRUMENTS>>(
    (acc, i) => {
      (acc[i.assetClass] ||= []).push(i);
      return acc;
    },
    {} as Record<AssetClass, typeof INSTRUMENTS>,
  );

  const toggleSymbol = (id: string) => {
    const has = config.symbols.includes(id);
    const next = has ? config.symbols.filter((s) => s !== id) : [...config.symbols, id];
    if (next.length === 0) return;
    updateConfig({ symbols: next.slice(0, 16) });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel space-y-5 p-5">
        <div>
          <h3 className="text-sm font-semibold">Perfil de riesgo</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            La agresividad ajusta automáticamente el umbral de entrada, la distancia del stop, el objetivo de beneficio y
            el tamaño de cada posición.
          </p>
        </div>

        <Field label="Agresividad" hint={`${config.aggressiveness}/10 · ${profile.label}`}>
          <Slider
            value={[config.aggressiveness]}
            min={1}
            max={10}
            step={1}
            onValueChange={([v]) => updateConfig({ aggressiveness: v })}
          />
          <div className="num grid grid-cols-3 gap-2 pt-1 text-[11px] text-muted-foreground">
            <span>Confianza mín. {profile.minConfidence}%</span>
            <span className="text-center">Stop {profile.atrStopMult}×ATR</span>
            <span className="text-right">Objetivo {profile.rewardRatio}R</span>
          </div>
        </Field>

        <Field label="Parte de la cartera operable" hint={`${config.capitalAllocationPct}%`}>
          <Slider
            value={[config.capitalAllocationPct]}
            min={5}
            max={100}
            step={5}
            onValueChange={([v]) => updateConfig({ capitalAllocationPct: v })}
          />
        </Field>

        <Field label="Riesgo por operación" hint={`${config.riskPerTradePct}% del capital operable`}>
          <Slider
            value={[config.riskPerTradePct]}
            min={0.1}
            max={5}
            step={0.1}
            onValueChange={([v]) => updateConfig({ riskPerTradePct: Number(v.toFixed(1)) })}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Posiciones máx." hint={`+${profile.maxPositionsBoost} por agresividad`}>
            <Input
              type="number"
              min={1}
              max={12}
              value={config.maxConcurrentPositions}
              onChange={(e) => updateConfig({ maxConcurrentPositions: Math.max(1, Number(e.target.value)) })}
            />
          </Field>
          <Field label="Frecuencia de escaneo" hint="segundos">
            <Input
              type="number"
              min={15}
              max={600}
              step={5}
              value={config.scanIntervalSec}
              onChange={(e) => updateConfig({ scanIntervalSec: Math.max(15, Number(e.target.value)) })}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Pérdida diaria máx." hint="% de corte">
            <Input
              type="number"
              min={1}
              max={50}
              value={config.maxDailyLossPct}
              onChange={(e) => updateConfig({ maxDailyLossPct: Number(e.target.value) })}
            />
          </Field>
          <Field label="Objetivo diario" hint="% de cierre">
            <Input
              type="number"
              min={1}
              max={100}
              value={config.maxDailyProfitPct}
              onChange={(e) => updateConfig({ maxDailyProfitPct: Number(e.target.value) })}
            />
          </Field>
        </div>

        <Field label="Temporalidad de análisis">
          <Select value={config.timeframe} onValueChange={(v) => updateConfig({ timeframe: v as typeof config.timeframe })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">5 minutos · intradía rápido</SelectItem>
              <SelectItem value="15m">15 minutos · intradía</SelectItem>
              <SelectItem value="1h">1 hora · swing corto</SelectItem>
              <SelectItem value="1d">1 día · posicional</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Modo solo análisis</Label>
              <p className="text-xs text-muted-foreground">Genera señales sin abrir ninguna posición.</p>
            </div>
            <Switch checked={config.analysisOnly} onCheckedChange={(v) => updateConfig({ analysisOnly: v })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Stop dinámico (trailing)</Label>
              <p className="text-xs text-muted-foreground">Asegura beneficio moviendo el stop a favor.</p>
            </div>
            <Switch checked={config.useTrailingStop} onCheckedChange={(v) => updateConfig({ useTrailingStop: v })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Análisis de noticias</Label>
              <p className="text-xs text-muted-foreground">Incorpora titulares reales al cálculo de la señal.</p>
            </div>
            <Switch checked={config.useNewsFilter} onCheckedChange={(v) => updateConfig({ useNewsFilter: v })} />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="panel space-y-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">Cuenta de simulación</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Dinero ficticio gestionado por este programa, con precios reales de mercado. No usa la cuenta demo de XTB.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label className="text-sm">Capital inicial ficticio (€)</Label>
              <Input
                className="mt-2"
                type="number"
                min={100}
                step={100}
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => resetSimulation(Math.max(100, Number(newBalance) || 10000))}>
              <RotateCcw className="size-4" /> Reiniciar
            </Button>
          </div>
        </div>

        <div className="panel space-y-4 p-5">
          <div>
            <h3 className="text-sm font-semibold">Instrumentos vigilados</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {config.symbols.length} seleccionados · máximo 16 para mantener el escaneo ágil.
            </p>
          </div>
          {(Object.keys(grouped) as AssetClass[]).map((cls) => (
            <div key={cls}>
              <p className="label-xs mb-2">{ASSET_CLASS_LABEL[cls]}</p>
              <div className="flex flex-wrap gap-1.5">
                {grouped[cls].map((i) => {
                  const active = config.symbols.includes(i.id);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onClick={() => toggleSymbol(i.id)}
                      className={cn(
                        "num rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                        active
                          ? "border-primary/50 bg-primary/15 text-primary"
                          : "border-border bg-surface-2 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {i.id}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
