# syntax=docker/dockerfile:1

# --- Build stage ---
FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

# --- Runtime stage ---
FROM node:22-bookworm-slim
WORKDIR /app

COPY scripts/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

COPY --from=builder /app/build ./build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN mkdir -p /data
ENV DB_PATH=/data/fishcount.sqlite3
ENV NODE_ENV=production

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
