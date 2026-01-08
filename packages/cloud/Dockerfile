FROM oven/bun:latest AS base
WORKDIR /app

# Install dependencies
COPY pika/packages/shared /app/packages/shared
COPY pika/packages/cloud/package.json ./package.json
# We need to install dependencies. 
# Since we are in a monorepo structure but copying partially, 
# we might need to adjust how we install.
# For simplicity in MVP, we'll try to treat cloud as standalone or copy needed shared parts.

# NOTE: Since @pika/shared is a workspace dependency, we need to handle it.
# Strategy: Copy shared package into the image and link it.

# 1. Setup workspace structure in image
WORKDIR /workspace
COPY package.json .
COPY bun.lockb . 
COPY packages/shared packages/shared
COPY packages/cloud packages/cloud

# 2. Install
WORKDIR /workspace/packages/cloud
RUN bun install

# 3. Environment
ENV NODE_ENV=production
ENV DATABASE_URL="file:local.db" 
# (Overridden at runtime)

EXPOSE 3001

# 4. Run
CMD ["bun", "run", "src/index.ts"]
