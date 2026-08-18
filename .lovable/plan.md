# AlphaDesk: bot centralizado 24/7 en Raspberry Pi

Refactor arquitectónico: el motor de trading pasa del navegador al servidor. El navegador queda como panel de control puro.

```text
ANTES                              DESPUÉS
[navegador] motor + estado         [navegador] panel (fetch + SSE)
     |  localStorage                      |  HTTP /api/bot/*
     v                                    v
  XTB / Yahoo                    [Raspberry Pi · Docker · Bun]
                                   motor singleton + SQLite + XTB
```

## Estado actual (verificado)

- Todo el estado y el bucle viven en `src/hooks/useTradingBot.ts`: `setInterval` de escaneo, cuenta simulada, config, logs, análisis, y credenciales XTB en `sessionStorage` (`alphadesk.xtb.v1`) + config/cuenta en `localStorage`.
- Las órdenes reales salen desde el navegador llamando a los server functions de `src/lib/xtb.functions.ts`, que reciben usuario y contraseña en cada petición.
- La lógica pura (`trading/engine.ts`, `strategy.ts`, `indicators.ts`, `instruments.ts`, `types.ts`) ya está libre de React: se reutiliza tal cual, sin tocar la estrategia ni los cálculos de riesgo.

## Qué se construye

### 1. Capa de persistencia (SQLite)

Nuevo módulo de almacenamiento con adaptador de driver: `bun:sqlite` en el contenedor, y almacén en memoria como respaldo cuando el runtime no tiene SQLite (vista previa de Lovable). Ruta del fichero por `ALPHADESK_DB` (por defecto `/data/alphadesk.db`).

Esquema:

- `bot_state` — clave/valor de una sola fila lógica: `running`, `liveArmed`, `startedAt`, `lastScanAt`, `nextScanAt`, `lastXtbOkAt`, `lastError`, `engineId`.
- `bot_config` — la `BotConfig` completa (JSON versionado).
- `paper_account` — saldo, equity, día de referencia, pico de equity.
- `paper_positions` — posiciones simuladas abiertas.
- `paper_history` — operaciones simuladas cerradas.
- `equity_curve` — puntos de la curva (con poda).
- `logs` — registro del bot con nivel y timestamp (rotación a N entradas).
- `xtb_credentials` — usuario/contraseña cifrados (AES-GCM con `ALPHADESK_SECRET`); nunca se devuelven al frontend.
- `engine_lock` — fila única con `engineId`, `pid`, `heartbeat` para el singleton.

### 2. Motor de servidor (singleton)

`src/server/engine/*`: el bucle de `useTradingBot.scan()` se traslada íntegro a una clase/módulo sin React. Mismo orden de operaciones: datos de mercado → noticias → análisis → mark-to-market → límites diarios → apertura de posiciones (simulada o real por XTB).

Protección de instancia única en dos niveles:
1. Singleton de proceso vía `globalThis` (un solo temporizador aunque el módulo se importe desde varias rutas).
2. Bloqueo en base de datos: `engine_lock` con `engineId` + heartbeat cada 10 s; otro proceso solo toma el mando si el heartbeat lleva más de 60 s parado. `start` es idempotente: si ya corre, devuelve el estado sin crear un segundo bucle.

Arranque automático: al iniciarse el proceso, el motor lee `bot_state`; si `running = true`, reanuda solo. Se engancha en `src/server.ts`, que ya envuelve la entrada SSR, de modo que Docker/Pi lo recuperan sin navegador.

### 3. API (rutas de servidor TanStack, sin framework nuevo)

- `GET /api/bot/state` — estado consolidado: motor, uptime, último/próximo escaneo, última comunicación XTB, último error, engineId, config, cuenta, posiciones, análisis, XTB.
- `POST /api/bot/start` · `POST /api/bot/stop`
- `GET /api/bot/config` · `PUT /api/bot/config`
- `GET /api/bot/logs` · `GET /api/bot/account` · `GET /api/bot/positions`
- `POST /api/bot/positions/:id/close`
- `POST /api/bot/xtb/credentials` (guardar cifradas) · `POST /api/bot/xtb/connect` · `POST /api/bot/xtb/refresh` · `POST /api/bot/xtb/arm`
- `GET /api/bot/stream` — SSE: empuja estado, logs, posiciones y XTB a todos los dispositivos al instante.
- `GET /api/bot/health` — vivo/uptime/engineId.

Rutas fuera de `/api/public/*` y pensadas para LAN/Tailscale. Token opcional `ALPHADESK_TOKEN`: si está definido, toda ruta `/api/bot/*` lo exige por cabecera.

### 4. Credenciales XTB

Prioridad: `XTB_USER_ID` / `XTB_PASSWORD` / `XTB_ACCOUNT` del entorno. Si faltan, se pueden introducir una vez desde el panel y se guardan cifradas en SQLite. Nunca se devuelven al navegador (solo `configurado: sí/no`, login enmascarado y estado de conexión). Se elimina por completo el uso de `sessionStorage` para credenciales.

### 5. Frontend

`useTradingBot.ts` se reescribe como hook de panel: React Query para `GET /api/bot/state` + suscripción SSE para actualizaciones inmediatas (con polling de respaldo si el stream cae), y mutaciones para start/stop/config/cerrar posición. Mantiene exactamente la misma forma de retorno que hoy, para que `DeskHeader`, `ConfigPanel`, `XtbPanel`, `Tables`, `Feeds`, `AnalysisGrid` y `EquityChart` no cambien de interfaz. Se añade una tarjeta de estado del sistema (motor, uptime, escaneos, engineId, último error) en el panel existente. Cero decisiones de trading en el cliente; se borra todo el `localStorage`/`sessionStorage` del bot.

### 6. Docker / Raspberry Pi

- `Dockerfile` multi-etapa con `oven/bun` (linux/arm64), build de producción real, ejecución con `bun`, escuchando en `0.0.0.0:3000`.
- `docker-compose.yml`: `restart: unless-stopped`, volumen `./data:/data`, variables `ALPHADESK_DB=/data/alphadesk.db`, `ALPHADESK_SECRET`, credenciales XTB opcionales, healthcheck contra `/api/bot/health`.
- Script de build de servidor con preset Node/Bun (no Cloudflare) y `.dockerignore`, `.env.example`, sección de despliegue en el README con los comandos exactos y las pruebas de aceptación (A–K).

## Notas técnicas

- La estrategia, los indicadores, el dimensionado por riesgo y los instrumentos no se modifican; el motor de servidor los importa tal cual.
- El escaneo del servidor usa `fetch` directo a Yahoo (reutilizando la lógica de `market.functions.ts`/`news.functions.ts` extraída a módulos `.server.ts` compartidos) en lugar de RPC contra sí mismo.
- La vista previa de Lovable seguirá mostrando el panel, pero con almacén en memoria y sin garantía 24/7: el destino real es el contenedor de la Pi.
- Sin credenciales ni secretos en el repositorio: solo `.env.example` con nombres.

## Entrega

Al terminar se documenta: ficheros creados/modificados, qué se movió del cliente al servidor, esquema de base de datos, endpoints, funcionamiento del singleton, persistencia Docker, comandos exactos de despliegue en la Pi, y cómo verificar que cerrar todos los navegadores no detiene el bot y que MacBook e iPhone comparten estado.
