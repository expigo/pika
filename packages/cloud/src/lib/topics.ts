/**
 * WebSocket Pub/Sub Topic Routing
 *
 * Pika! uses Bun's native in-memory pub/sub for WebSocket broadcasting.
 * Traffic is split into two kinds of topics:
 *
 *   1. DISCOVERY_TOPIC ("live-session") — the "lobby". Every connection is
 *      subscribed to it for its entire lifetime. Carries only rare, global
 *      discovery/system events (SESSION_STARTED / SESSION_ENDED /
 *      SESSION_EXPIRED / SERVER_SHUTDOWN) so that session-browsing clients and
 *      in-session clients alike learn about sessions appearing/disappearing.
 *
 *   2. session:{id} — one topic per live session (see {@link getSessionTopic}).
 *      Carries ALL high-frequency, session-scoped traffic (now-playing, likes,
 *      reactions, tempo, polls, announcements, listener counts, history sync).
 *      A dancer subscribes on SUBSCRIBE; the DJ subscribes on REGISTER_SESSION.
 *
 * Routing per-session traffic to per-session topics makes cross-session
 * delivery physically impossible (no client-side filtering required) and
 * collapses fan-out from O(all clients) to O(clients in that session).
 *
 * NOTE: Bun topics are per-instance (in-memory). This is correct for the
 * current single-instance deployment and maps 1:1 onto Redis pub/sub channels
 * if/when multi-instance horizontal scaling is introduced.
 *
 * @file packages/cloud/src/lib/topics.ts
 * @package @pika/cloud
 */

/**
 * The global discovery / "lobby" topic. Every connection subscribes to this on
 * open. Reserved for rare, broadcast-to-everyone lifecycle events.
 *
 * Kept as the literal "live-session" string so that pre-existing clients (which
 * already filter discovery events by sessionId) continue to work unchanged.
 */
export const DISCOVERY_TOPIC = "live-session" as const;

/**
 * Returns the per-session pub/sub topic for a given session id.
 *
 * @param sessionId - The CloudSessionID of the live session.
 * @returns A topic string of the form `session:{sessionId}`.
 */
export function getSessionTopic(sessionId: string): string {
  return `session:${sessionId}`;
}
