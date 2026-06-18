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

# Build the web app
WORKDIR /app/packages/web
ENV DOCKER_BUILD=1
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

# Install only production dependencies (optional but better)
WORKDIR /app/packages/web
# Note: Next.js standalone build is even better, but this is a good first step.

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["bun", "run", "start"]
