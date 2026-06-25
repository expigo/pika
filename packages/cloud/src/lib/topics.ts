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
 *   2. session:{id} / stage:{id} — the per-audience high-frequency topic.
 *      Carries ALL session-scoped traffic (now-playing, likes, reactions,
 *      tempo, polls, announcements, listener counts, history sync). A stage-less
 *      session uses `session:{id}` (legacy); a session running under a Stage
 *      uses `stage:{stageId}` so dancers stay subscribed across DJ rotation
 *      (see {@link getStageTopic}). Resolved per-session by
 *      `getSessionBroadcastTopic` in lib/sessions.ts. A dancer subscribes on
 *      SUBSCRIBE (by session) or SUBSCRIBE_STAGE (by stage); the DJ subscribes
 *      on REGISTER_SESSION.
 *   3. event:{id} — parent of a set of stages (see {@link getEventTopic}).
 *      Carries event-wide organizer announcements; dancers are auto-subscribed
 *      when they join a stage.
 *
 * Routing per-audience traffic to per-audience topics makes cross-audience
 * delivery physically impossible (no client-side filtering required) and
 * collapses fan-out from O(all clients) to O(clients in that session/stage).
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

/**
 * Returns the per-stage pub/sub topic. A Stage is a persistent venue context
 * that outlives any single DJ set; dancers subscribe to it on QR scan and stay
 * subscribed across DJ rotation, so a handover is invisible to them.
 *
 * @param stageId - The Stage id.
 * @returns A topic string of the form `stage:{stageId}`.
 */
export function getStageTopic(stageId: string): string {
  return `stage:${stageId}`;
}

/**
 * Returns the per-event pub/sub topic (parent of a stage). Carries event-wide
 * organizer announcements. Dancers are auto-subscribed when they join a stage.
 *
 * @param eventId - The Event id.
 * @returns A topic string of the form `event:{eventId}`.
 */
export function getEventTopic(eventId: string): string {
  return `event:${eventId}`;
}
