# --- Stage 1: Builder ---
FROM oven/bun:latest AS builder
WORKDIR /app

# Copy root config files
COPY package.json bun.lock ./
# Copy workspace package files for dependency resolution
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared packages/shared
COPY packages/web packages/web

# Set production env for build optimizations
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Build the web app
WORKDIR /app/packages/web
RUN bun run build

# --- Stage 2: Runtime ---
FROM oven/bun:latest AS runtime
WORKDIR /app

# Copy necessary files from builder
# We need the node_modules, the built .next folder, and the package files
COPY --from=builder /app/package.json /app/bun.lock ./
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
