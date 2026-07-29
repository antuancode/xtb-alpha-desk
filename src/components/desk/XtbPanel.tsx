import { AlertTriangle, Link2, Link2Off, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney, fmtPrice, fmtSigned } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TradingBot } from "@/hooks/useTradingBot";

export function XtbPanel({ bot }: { bot: TradingBot }) {
  const { creds, saveCreds, xtb, connectXtb, disconnectXtb, refreshXtb, closeXtbPosition, config, updateConfig, liveArmed, setLiveArmed } =
    bot;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_1fr]">
      <div className="panel space-y-4 p-5">
        <div>
          <h3 className="text-sm font-semibold">Conexión con XTB</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Se usa la API de xStation5. Las credenciales solo viven en la sesión de este navegador y se envían
            cifradas a XTB en cada operación; nunca se guardan en disco.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <Label className="text-sm">Número de cuenta (ID)</Label>
            <Input
              className="num mt-2"
              inputMode="numeric"
              placeholder="12345678"
              value={creds.userId}
              onChange={(e) => saveCreds({ ...creds, userId: e.target.value.trim() })}
            />
          </div>
          <div>
            <Label className="text-sm">Contraseña</Label>
            <Input
              className="mt-2"
              type="password"
              placeholder="••••••••"
              value={creds.password}
              onChange={(e) => saveCreds({ ...creds, password: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-sm">Servidor</Label>
            <Select value={creds.account} onValueChange={(v) => saveCreds({ ...creds, account: v as "real" | "demo" })}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="real">Cuenta real</SelectItem>
                <SelectItem value="demo">Cuenta demo de XTB</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button className="flex-1" onClick={() => void connectXtb()}>
            <Link2 className="size-4" /> Conectar
          </Button>
          <Button variant="outline" onClick={() => void refreshXtb()} disabled={!xtb.connected}>
            <RefreshCw className="size-4" />
          </Button>
          <Button variant="outline" onClick={disconnectXtb} disabled={!xtb.connected}>
            <Link2Off className="size-4" />
          </Button>
        </div>

        {xtb.error && (
          <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            {xtb.error}
          </p>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Modo de ejecución</Label>
              <p className="text-xs text-muted-foreground">
                {config.mode === "real" ? "Órdenes enviadas a tu cuenta de XTB" : "Cartera ficticia con precios reales"}
              </p>
            </div>
            <Select value={config.mode} onValueChange={(v) => updateConfig({ mode: v as "real" | "simulacion" })}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simulacion">Simulación</SelectItem>
                <SelectItem value="real">Dinero real</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {config.mode === "real" && (
            <div className="space-y-3 rounded-md border border-loss/40 bg-loss/8 p-3">
              <p className="flex items-start gap-2 text-xs text-foreground">
                <ShieldAlert className="mt-0.5 size-4 shrink-0 text-loss" />
                El bot enviará órdenes con dinero real. Debes armar la ejecución explícitamente; se desarma al
                desconectar o recargar la página.
              </p>
              <div className="flex items-center justify-between gap-4">
                <Label className="text-sm">Armar ejecución real</Label>
                <Switch checked={liveArmed} disabled={!xtb.connected} onCheckedChange={setLiveArmed} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Saldo XTB", value: xtb.connected ? fmtMoney(xtb.balance, xtb.currency) : "—" },
            { label: "Capital (equity)", value: xtb.connected ? fmtMoney(xtb.equity, xtb.currency) : "—" },
            { label: "Margen libre", value: xtb.connected ? fmtMoney(xtb.freeMargin, xtb.currency) : "—" },
          ].map((s) => (
            <div key={s.label} className="panel p-4">
              <p className="label-xs">{s.label}</p>
              <p className="num mt-2 text-xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="panel overflow-x-auto">
          <div className="border-b border-border px-4 py-3">
            <span className="label-xs">Posiciones abiertas en XTB</span>
          </div>
          {xtb.positions.length ? (
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Símbolo", "Dirección", "Volumen", "Entrada", "SL / TP", "Beneficio", ""].map((h) => (
                    <th key={h} className="label-xs px-3 py-2 text-left font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {xtb.positions.map((p) => (
                  <tr key={p.orderId} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2.5 font-medium">{p.symbol}</td>
                    <td className={cn("num px-3 py-2.5 text-xs", p.side === "BUY" ? "text-profit" : "text-loss")}>
                      {p.side === "BUY" ? "COMPRA" : "VENTA"}
                    </td>
                    <td className="num px-3 py-2.5">{p.volume}</td>
                    <td className="num px-3 py-2.5">{fmtPrice(p.openPrice, 4)}</td>
                    <td className="num px-3 py-2.5 text-xs text-muted-foreground">
                      {fmtPrice(p.stopLoss, 4)} / {fmtPrice(p.takeProfit, 4)}
                    </td>
                    <td className={cn("num px-3 py-2.5 font-semibold", p.profit >= 0 ? "text-profit" : "text-loss")}>
                      {fmtSigned(p.profit, xtb.currency)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void closeXtbPosition(p.orderId, p.symbol, p.volume, p.side)}
                      >
                        Cerrar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {xtb.connected ? "No hay posiciones abiertas en la cuenta." : "Conecta tu cuenta para ver las posiciones reales."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
