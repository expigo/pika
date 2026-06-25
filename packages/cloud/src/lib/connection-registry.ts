/**
 * Live WebSocket connection registry.
 *
 * The set of open sockets (DJ + dancer) was previously a private `index.ts` constant. It lives
 * here so read-only consumers (the admin overview) can get the count without importing `index.ts`
 * (which would create an import cycle). `index.ts` keeps mutating it exactly as before.
 */

import type { ServerWebSocket } from "bun";

/** Source of truth for currently-open sockets. */
export const activeConnections = new Set<ServerWebSocket>();

/** Number of currently-open WebSocket connections. */
export function getActiveConnectionCount(): number {
  return activeConnections.size;
}
