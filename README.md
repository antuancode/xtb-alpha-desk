# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS

## Despliegue 24/7 en una Raspberry Pi (Docker)

El bot ya no vive en el navegador: el motor de análisis y ejecución corre en el
servidor y guarda su estado en SQLite, así que sigue operando con todos los
navegadores cerrados y se recupera solo tras un reinicio.

```bash
git clone <tu-repo> alphadesk && cd alphadesk
cp .env.example .env        # OBLIGATORIO: ALPHADESK_SECRET y ALPHADESK_PASSWORD
#   ALPHADESK_SECRET=$(openssl rand -hex 32)
docker compose up -d --build
docker compose ps           # el estado debe pasar a "healthy"
```

- Panel: `http://<ip-de-la-raspberry>:3000` → pide la contraseña `ALPHADESK_PASSWORD`.
- Datos persistentes: volumen `alphadesk-data` montado en `/data` (`alphadesk.db`).
- `restart: unless-stopped` hace que Docker levante el contenedor al arrancar la Pi.
- Ver registros: `docker compose logs -f alphadesk`.
- `HEALTHCHECK` consulta `GET /api/health` dentro del contenedor con Bun; si el
  servidor no responde o faltan secretos, el contenedor aparece como `unhealthy`.

### Seguridad

- No existe ninguna clave por defecto: sin `ALPHADESK_SECRET` y `ALPHADESK_PASSWORD`
  el proceso falla al arrancar en producción.
- Todas las rutas `/api/bot/*` exigen una cookie de sesión firmada (HttpOnly,
  SameSite=Strict) emitida por `POST /api/bot/session`; sin ella devuelven 401.
- Las credenciales de XTB se guardan cifradas (AES-GCM) en el servidor y nunca
  se envían al navegador (solo se muestra el usuario enmascarado).

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `ALPHADESK_SECRET` | **Obligatoria.** Cifra las credenciales de XTB y firma la sesión del panel. |
| `ALPHADESK_PASSWORD` | **Obligatoria.** Contraseña de acceso al panel y a la API. |
| `XTB_USER_ID` / `XTB_PASSWORD` / `XTB_ACCOUNT` | Credenciales opcionales; tienen prioridad sobre las guardadas desde el panel. |
| `ALPHADESK_DATA_DIR` | Carpeta de datos (por defecto `/data`). |
| `PORT` | Puerto del servidor (3000). |

### API del bot

Todas requieren sesión autenticada salvo `/api/health` y el login.

| Endpoint | Uso |
| --- | --- |
| `GET /api/health` | Salud del contenedor (usado por el `HEALTHCHECK`). |
| `GET/POST/DELETE /api/bot/session` | Estado de sesión, login y logout. |
| `GET /api/bot/snapshot` | Estado completo (motor, configuración, cartera, análisis, registros). |
| `GET /api/bot/stream` | Flujo SSE en tiempo real para los paneles. |
| `POST /api/bot/command` | `start`, `stop`, `scan`, `arm`, `config`, `closeSim`, `resetSim`, `closeXtb`, `refreshXtb`. |
| `POST/DELETE /api/bot/credentials` | Guardar o borrar las credenciales cifradas de XTB. |
