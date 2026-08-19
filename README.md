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
cp .env.example .env        # define ALPHADESK_SECRET (y, si quieres, las credenciales de XTB)
docker compose up -d --build
```

- Panel: `http://<ip-de-la-raspberry>:3000`
- Datos persistentes: volumen `alphadesk-data` montado en `/data` (`alphadesk.db`).
- `restart: unless-stopped` hace que Docker levante el contenedor al arrancar la Pi.
- Ver registros: `docker compose logs -f alphadesk`.

### Variables de entorno

| Variable | Descripción |
| --- | --- |
| `ALPHADESK_SECRET` | Clave para cifrar las credenciales de XTB en la base de datos. |
| `XTB_USER_ID` / `XTB_PASSWORD` / `XTB_ACCOUNT` | Credenciales opcionales; tienen prioridad sobre las guardadas desde el panel. |
| `ALPHADESK_DATA_DIR` | Carpeta de datos (por defecto `/data`). |
| `PORT` | Puerto del servidor (3000). |

### API del bot

| Endpoint | Uso |
| --- | --- |
| `GET /api/bot/snapshot` | Estado completo (motor, configuración, cartera, análisis, registros). |
| `GET /api/bot/stream` | Flujo SSE en tiempo real para los paneles. |
| `POST /api/bot/command` | `start`, `stop`, `scan`, `arm`, `config`, `closeSim`, `resetSim`, `closeXtb`, `refreshXtb`. |
| `POST/DELETE /api/bot/credentials` | Guardar o borrar las credenciales cifradas de XTB. |
