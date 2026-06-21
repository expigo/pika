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

// Only wrap with Sentry for production builds. In `next dev` (Turbopack), the
// Sentry plugin injects a parallel webpack resolution pass that, in this Bun
// isolated-install monorepo, cannot resolve the `tailwindcss` bare specifier
// from the repo root and sends Turbopack into an unbounded recompile/retry loop
// that exhausts RAM (see vercel/next.js#92978). Gating to production removes the
// dual-bundler pass in dev entirely; Sentry remains fully active in prod builds.
const config =
  process.env.NODE_ENV === "production"
    ? withSentryConfig(nextConfig, {
        // For all available options, see:
        // https://github.com/getsentry/sentry-webpack-plugin#options

        // Suppresses source map uploading logs during bundling
        silent: true,
        org: "pika",
        project: "web",
        authToken: process.env.SENTRY_AUTH_TOKEN,
      })
    : nextConfig;

export default config;
