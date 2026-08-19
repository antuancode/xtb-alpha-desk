import { useState, type FormEvent } from "react";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  onLogin: (password: string) => Promise<void>;
  missingConfig: string[];
}

export function LoginScreen({ onLogin, missingConfig }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onLogin(password);
      setPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-sm space-y-5 p-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="size-4 text-primary" />
            AlphaDesk
          </div>
          <p className="text-xs text-muted-foreground">
            Panel privado del bot. Introduce la contraseña del servidor para continuar.
          </p>
        </div>

        {missingConfig.length > 0 ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            El servidor no está configurado: falta {missingConfig.join(", ")}. Define estas variables de entorno y
            reinicia el contenedor.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <Input
              type="password"
              autoComplete="current-password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={busy || password.length === 0}>
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Entrar
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
