# --- Stage 1: Builder ---
FROM oven/bun:latest AS builder
WORKDIR /app

# Copy root config files
COPY package.json bun.lock ./
# Copy workspace package files for dependency resolution
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
COPY packages/cloud/package.json packages/cloud/
COPY packages/desktop/package.json packages/desktop/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared packages/shared
COPY packages/web packages/web

# Set production env for build optimizations
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 🏗️ Public build args. NEXT_PUBLIC_* are intentionally inlined into the client
# bundle, and SENTRY_DSN is the non-secret DSN — these are safe as ARG/ENV.
ARG NEXT_PUBLIC_CLOUD_WS_URL
ARG NEXT_PUBLIC_CLOUD_API_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ENV
ARG SENTRY_DSN

ENV NEXT_PUBLIC_CLOUD_WS_URL=$NEXT_PUBLIC_CLOUD_WS_URL
ENV NEXT_PUBLIC_CLOUD_API_URL=$NEXT_PUBLIC_CLOUD_API_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV
ENV SENTRY_DSN=$SENTRY_DSN

# Build the web app.
# - DOCKER_BUILD is intentionally unset: builds run on multi-core CI runners.
# - SENTRY_AUTH_TOKEN (used only to upload source maps) is passed as a BuildKit
#   secret so it is NEVER baked into an image layer (fixes SecretsUsedInArgOrEnv).
WORKDIR /app/packages/web
RUN --mount=type=secret,id=sentry_auth_token \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/sentry_auth_token 2>/dev/null || true)" \
    bun run build

# --- Stage 2: Runtime (Next.js standalone) ---
# `output: "standalone"` emits a self-contained server with only the file-traced
# node_modules, instead of copying the entire 1.2 GB workspace node_modules.
FROM oven/bun:latest AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# public/ and .next/static are NOT part of the standalone output and must be
# copied in. Paths are nested under packages/web because outputFileTracingRoot
# is the monorepo root, so the traced server lives at packages/web/server.js.
COPY --from=builder /app/packages/web/public ./packages/web/public
COPY --from=builder /app/packages/web/.next/standalone ./
COPY --from=builder /app/packages/web/.next/static ./packages/web/.next/static

EXPOSE 3000
CMD ["bun", "packages/web/server.js"]
