# Error Monitoring & Observability

Pika! uses **Sentry** for real-time error tracking and performance monitoring across the entire ecosystem (Cloud, Web, and Desktop).

## Overview

The integration is built on top of the `@pika/shared` logger, ensuring that any error or warning logged via the standard logger is automatically reported to Sentry in production environments.

### Key Features
- **Unified Reporting**: All packages use a common reporter interface.
- **Privacy First**: PII scrubbing is enabled to strip cookies, headers, and IP addresses.
- **Noise Control**: Built-in filtering for common browser extension errors.
- **Cost Efficient**: 10% trace sampling rate (`0.1`) to balance visibility and cost.
- **Deep Web Tracking**: Captures root layout crashes (`global-error.tsx`) and route-level errors.

## Environment Variables

To enable Sentry, set the following variables in your environment:

### Cloud Service
| Variable | Description | Default |
|----------|-------------|---------|
| `SENTRY_DSN` | The DSN from your Sentry project. | `undefined` |
| `NODE_ENV` | Sets the Sentry environment tag. | `production` |

### Web Application
| Variable | Description | Required |
|----------|-------------|----------|
| `SENTRY_DSN` | DSN for server-side and edge reporting. | Yes |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN for client-side reporting. | Yes |
| `SENTRY_AUTH_TOKEN` | Auth token for uploading source maps during build. | Yes (CI/CD) |

### Desktop Application
| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_SENTRY_DSN` | DSN for the Tauri frontend. | Yes |
| `VITE_ENV` | Environment tag (e.g., `staging`, `production`). | `production` |

## Deployment & CI/CD

### Source Maps (Web)
To ensure readable stack traces, your build process must have `SENTRY_AUTH_TOKEN` available. Next.js will automatically upload source maps to Sentry during `npm run build`.

### Staging vs Production
We **strongly recommend** monitoring the staging environment. Sentry will automatically tag events based on the environment variable, allowing you to filter by "staging" in the dashboard. This allows for verification of fixes and performance testing before production rollout.

## PII Scrubbing
All configurations include a `beforeSend` hook that removes:
- `request.headers`
- `request.cookies`
- `user.ip_address`

This ensures we do not leak dancer or DJ credentials or tracking data to external services.
