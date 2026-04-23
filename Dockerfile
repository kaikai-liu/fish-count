# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
ARG LITESTREAM_VERSION=v0.3.13

# --- Litestream binary stage ---
FROM alpine:3.20 AS litestream-builder
ARG LITESTREAM_VERSION
ADD https://github.com/benbjohnson/litestream/releases/download/${LITESTREAM_VERSION}/litestream-${LITESTREAM_VERSION}-linux-amd64.tar.gz /tmp/litestream.tar.gz
RUN tar -C /usr/local/bin -xzf /tmp/litestream.tar.gz

# --- App build stage ---
FROM node:${NODE_VERSION}-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# --- Runtime stage ---
FROM node:${NODE_VERSION}-bookworm-slim
WORKDIR /app

# Litestream binary + config + entrypoint
COPY --from=litestream-builder /usr/local/bin/litestream /usr/local/bin/litestream
COPY litestream.yml /etc/litestream.yml
COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# App bundle
COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# better-sqlite3 needs the database to exist somewhere writable
RUN mkdir -p /data
ENV DB_PATH=/data/fishcount.sqlite3
ENV NODE_ENV=production

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
