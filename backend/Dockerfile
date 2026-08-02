# syntax=docker/dockerfile:1

# ---- Builder: full workspace install, Prisma client, NestJS compile ----
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

# Bring in the whole repo (context = repo root); .dockerignore keeps it lean.
COPY . .

# Frozen-lockfile install of the pnpm workspace, then compile the API and
# prune it to a self-contained production tree in /out (runtime deps only).
# `--legacy` is required because the workspace does not use
# inject-workspace-packages.
RUN pnpm install --frozen-lockfile \
  && pnpm --filter backend exec prisma generate \
  && pnpm --filter backend build \
  && pnpm --filter backend deploy --prod --legacy /out

# ---- Runner: minimal image with production dependencies only ----
FROM node:22-alpine AS runner
RUN corepack enable
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY --from=builder /out ./

# The deploy target has no generated client yet; `prisma` ships in the
# image (dependency of @prisma/client) so we generate against the bundled
# schema. Engines are downloaded for linux-musl at build time.
RUN node node_modules/prisma/build/index.js generate

# Run as a non-root user (the official node image ships the `node` user).
# The app never writes to the image, so no chown is needed.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/health || exit 1

# Env loading: process env (Docker/Render) is used directly; a local .env is
# picked up by ConfigModule if present (node dist/main + ConfigModule, per H1).
CMD ["node", "dist/main.js"]
