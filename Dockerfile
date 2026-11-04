# syntax=docker/dockerfile:1

# Production image for pulse-analytics. Build with `docker build -t pulse .`
# or use docker-compose.yml, which also runs the migrations.

FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# One-shot migration runner: drizzle-kit is a dev dependency, so it lives in
# its own target instead of the runtime image.
FROM node:24-alpine AS migrate
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY package.json drizzle.config.ts ./
COPY lib/db/schema.ts ./lib/db/schema.ts
COPY drizzle ./drizzle
CMD ["npx", "drizzle-kit", "migrate"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
