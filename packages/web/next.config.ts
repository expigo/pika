import path from "node:path";
import { fileURLToPath } from "node:url";
import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Serwist config removed due to incompatibility with Next 16 + Sentry.
// We build SW manually via scripts/build-sw.ts

const projectDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  // Emit a self-contained server bundling only file-traced deps, so the Docker
  // image ships ~150 MB instead of the entire 1.2 GB workspace node_modules.
  output: "standalone",
  // Monorepo: trace from the repo root so the workspace dep (@pika/shared) and
  // hoisted runtime deps are included in the standalone output.
  outputFileTracingRoot: path.join(projectDir, "../../"),
  experimental: {
    // Legacy throttle for on-box Docker builds; CI builds run multi-core so this
    // is no longer triggered (DOCKER_BUILD is not set in the Dockerfile anymore).
    cpus: process.env.DOCKER_BUILD ? 1 : undefined,
    workerThreads: process.env.DOCKER_BUILD ? false : undefined,
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  // Suppresses source map uploading logs during bundling
  silent: true,
  org: "pika",
  project: "web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
});
