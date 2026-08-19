# AlphaDesk · imagen para Raspberry Pi (arm64) y amd64
# Construye el servidor Nitro (preset node-server) y lo ejecuta con Bun,
# de modo que el motor de trading corre 24/7 sin ningún navegador abierto.
FROM oven/bun:1-alpine AS build
WORKDIR /app

COPY package.json bun.lock* bunfig.toml ./
RUN bun install --frozen-lockfile || bun install

COPY . .
ENV NITRO_PRESET=node-server
RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    ALPHADESK_DATA_DIR=/data

RUN mkdir -p /data
COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/bot/snapshot > /dev/null || exit 1

CMD ["bun", "run", ".output/server/index.mjs"]
