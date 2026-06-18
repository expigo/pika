# --- Stage 1: Builder ---
FROM oven/bun:latest AS builder
WORKDIR /app

COPY package.json bun.lock ./
COPY packages/shared/package.json packages/shared/
COPY packages/cloud/package.json packages/cloud/
COPY packages/web/package.json packages/web/
COPY packages/desktop/package.json packages/desktop/

RUN bun install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/cloud packages/cloud

# --- Stage 2: Runtime ---
FROM oven/bun:latest AS runtime
WORKDIR /app

COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/packages/shared /app/packages/shared
COPY --from=builder /app/packages/cloud /app/packages/cloud

ENV NODE_ENV=production

WORKDIR /app/packages/cloud

EXPOSE 3001
# `start:prod` runs `drizzle-kit migrate` (idempotent, ~seconds) before booting,
# so the DB schema is always in sync with the deployed code. A failed migration
# aborts startup (fail-loud) rather than serving against a stale schema.
CMD ["bun", "run", "start:prod"]
