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

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "const p=process.env.PORT||3000; const r=await fetch('http://127.0.0.1:'+p+'/api/health'); if(!r.ok) process.exit(1); const j=await r.json(); if(j.status!=='ok') process.exit(1);" || exit 1

CMD ["bun", "run", ".output/server/index.mjs"]
