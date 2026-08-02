# syntax=docker/dockerfile:1

# ---- Builder: install the workspace, compile the SPA ----
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile \
  && pnpm --filter frontend build

# ---- Runner: nginx serving the static SPA, proxying /api to the API ----
FROM nginx:1.27-alpine AS runner

COPY --from=builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx/default.conf.template /etc/nginx/templates/default.conf.template

# The nginx image envsubst entrypoint renders the template into
# /etc/nginx/conf.d/; only ${BACKEND_UPSTREAM} is substituted (it is the only
# defined env var), so nginx's own $host/$uri/... variables are preserved.
ENV BACKEND_UPSTREAM=http://backend:3000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
