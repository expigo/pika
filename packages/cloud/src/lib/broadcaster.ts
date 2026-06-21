/**
 * Shared server broadcaster.
 *
 * Holds a reference to the Bun `Server` (captured in index.ts) so code paths
 * OUTSIDE the WebSocket handler — e.g. a deferred session reap, where the DJ's
 * own socket is already gone — can still publish to a topic. `server.publish()`
 * reaches every subscriber of the topic.
 *
 * @file broadcaster.ts
 * @package @pika/cloud
 */

export interface Broadcaster {
  publish(topic: string, data: string, compress?: boolean): number;
}

let broadcaster: Broadcaster | null = null;

/** Register the server broadcaster (idempotent). Called once from index.ts. */
export function setBroadcaster(b: Broadcaster): void {
  broadcaster = b;
}

/** Get the server broadcaster, or null if not captured yet. */
export function getBroadcaster(): Broadcaster | null {
  return broadcaster;
}
