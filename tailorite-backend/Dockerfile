# syntax=docker/dockerfile:1.7
# Tailorite API and extraction worker: one image, two commands.
#   API:     applies pending migrations, then starts the API (default; set MIGRATE_ON_START=false to skip)
#   Worker:  node --enable-source-maps dist/worker.js
#   Migrate: node node_modules/prisma/build/index.js migrate deploy

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@10.34.6 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/dist ./dist
# Schema, migrations and Prisma config, so the container can apply migrations when it starts.
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma7.config.ts ./prisma7.config.ts
# Synthetic demo media for the sandbox and the guarded presenter seed.
COPY --from=build --chown=node:node /app/fixtures ./fixtures
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Migrations run before the API accepts traffic (Prisma takes a lock, so parallel starts are safe). If they
# fail, the container exits and the platform keeps the previous version running.
CMD ["sh", "-c", "if [ \"${MIGRATE_ON_START:-true}\" != \"false\" ]; then node node_modules/prisma/build/index.js migrate deploy || exit 1; fi; exec node --enable-source-maps dist/main.js"]
