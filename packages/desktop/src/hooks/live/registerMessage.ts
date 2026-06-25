/**
 * Pure builder for the REGISTER_SESSION payload a DJ sends on going live.
 *
 * Extracted so the contract — token + stageId are included only when present —
 * is unit-testable without driving the whole socket lifecycle.
 *
 * @file packages/desktop/src/hooks/live/registerMessage.ts
 */

import { MESSAGE_TYPES } from "@pika/shared";

export interface RegisterSessionParams {
  sessionId: string;
  djName: string;
  /** DJ auth token; omitted from the message when absent (anonymous mode). */
  token?: string | null;
  /** Stage to broadcast under; omitted when standalone. */
  stageId?: string;
}

export function buildRegisterSessionMessage(p: RegisterSessionParams): {
  type: string;
  [key: string]: unknown;
} {
  return {
    type: MESSAGE_TYPES.REGISTER_SESSION,
    sessionId: p.sessionId,
    djName: p.djName,
    ...(p.token ? { token: p.token } : {}),
    ...(p.stageId ? { stageId: p.stageId } : {}),
  };
}
