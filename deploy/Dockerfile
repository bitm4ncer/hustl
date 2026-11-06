# --- Build -------------------------------------------------------------------
FROM node:24-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build:all

# --- Runtime -----------------------------------------------------------------
FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       chromium fonts-dejavu-core ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production \
    HUSTL_DATA_DIR=/data \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    HOME=/tmp

COPY package.json package-lock.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist

RUN mkdir -p /data && chown -R 10001:10001 /data /app

USER 10001:10001
EXPOSE 3000

CMD ["node", "dist/server/index.mjs"]
