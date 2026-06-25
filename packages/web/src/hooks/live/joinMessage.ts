/**
 * Pure decision for the "join" message a listener sends on (re)connect.
 *
 * Extracted from useWebSocketConnection so the choice is unit-testable without a
 * WebSocket or React. A connection joins one of three ways:
 *   - a persistent Stage (SUBSCRIBE_STAGE) — stays subscribed across DJ rotation
 *   - a specific session (SUBSCRIBE) — legacy /live/[sessionId]
 *   - the lobby list (GET_SESSIONS) — no target yet
 *
 * @file packages/web/src/hooks/live/joinMessage.ts
 */

import { MESSAGE_TYPES } from "@pika/shared";

export interface JoinContext {
  /** Stage to join (mutually exclusive with a session target). */
  targetStageId?: string;
  /** Explicit session to join. */
  targetSessionId?: string;
  /** Session discovered at runtime (used when no explicit target was given). */
  discoveredSessionId?: string | null;
  clientId: string;
}

export type JoinMessage =
  | { type: typeof MESSAGE_TYPES.SUBSCRIBE_STAGE; clientId: string; stageId: string }
  | { type: typeof MESSAGE_TYPES.SUBSCRIBE; clientId: string; sessionId: string }
  | { type: typeof MESSAGE_TYPES.GET_SESSIONS; clientId: string };

/**
 * Pick the join message for a connection. A stage target wins (it's the
 * persistent context); otherwise an explicit or discovered session; otherwise
 * the lobby list.
 */
export function selectJoinMessage(ctx: JoinContext): JoinMessage {
  if (ctx.targetStageId) {
    return {
      type: MESSAGE_TYPES.SUBSCRIBE_STAGE,
      clientId: ctx.clientId,
      stageId: ctx.targetStageId,
    };
  }
  const sessionId = ctx.targetSessionId || ctx.discoveredSessionId || null;
  if (sessionId) {
    return { type: MESSAGE_TYPES.SUBSCRIBE, clientId: ctx.clientId, sessionId };
  }
  return { type: MESSAGE_TYPES.GET_SESSIONS, clientId: ctx.clientId };
}
