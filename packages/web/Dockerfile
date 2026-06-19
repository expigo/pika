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

# 🏗️ Build Args for Next.js (Must be present during build)
ARG NEXT_PUBLIC_CLOUD_WS_URL
ARG NEXT_PUBLIC_CLOUD_API_URL
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_ENV
ARG SENTRY_DSN
ARG SENTRY_AUTH_TOKEN

ENV NEXT_PUBLIC_CLOUD_WS_URL=$NEXT_PUBLIC_CLOUD_WS_URL
ENV NEXT_PUBLIC_CLOUD_API_URL=$NEXT_PUBLIC_CLOUD_API_URL
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_ENV=$NEXT_PUBLIC_ENV
ENV SENTRY_DSN=$SENTRY_DSN
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN

# Build the web app.
# NOTE: we intentionally do NOT set DOCKER_BUILD=1 here. That env throttled the
# build to 1 CPU (a workaround for the 1-vCPU VPS). Builds now run on GitHub
# runners (multi-core), so we let Next use all available cores for speed.
WORKDIR /app/packages/web
RUN bun run build

# --- Stage 2: Runtime ---
FROM oven/bun:latest AS runtime
WORKDIR /app

# Copy necessary files from builder
# We need the node_modules, the built .next folder, and the package files
COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared /app/packages/shared
COPY --from=builder /app/packages/web/package.json /app/packages/web/
COPY --from=builder /app/packages/web/.next /app/packages/web/.next
COPY --from=builder /app/packages/web/public /app/packages/web/public
# Bun uses an isolated (pnpm-style) layout: `next` lives in the root
# node_modules/.bun store and is only symlinked into the web package's
# node_modules. We must copy that directory so `next` resolves at runtime.
COPY --from=builder /app/packages/web/node_modules /app/packages/web/node_modules

WORKDIR /app/packages/web

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
# Runs the web package's `start` script (`next start`). Resolves `next` from
# packages/web/node_modules/.bin — no workspace filter / hardcoded path needed.
CMD ["bun", "run", "start"]
