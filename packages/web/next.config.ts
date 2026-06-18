import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Serwist config removed due to incompatibility with Next 16 + Sentry.
// We build SW manually via scripts/build-sw.ts

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    // Limit CPU usage and worker threads during Docker build to prevent VPS memory exhaustion
    cpus: process.env.DOCKER_BUILD ? 1 : undefined,
    workerThreads: process.env.DOCKER_BUILD ? false : undefined,
  }
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
