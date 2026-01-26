import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

// Serwist config removed due to incompatibility with Next 16 + Sentry.
// We build SW manually via scripts/build-sw.ts

const nextConfig: NextConfig = {
  /* config options here */
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
