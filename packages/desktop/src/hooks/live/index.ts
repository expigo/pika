/**
 * Live Session Modules
 *
 * This directory contains modular components extracted from the
 * monolithic useLiveSession.ts for better testability and maintainability.
 *
 * @package @pika/desktop
 */

// Types
export * from "./types";

// Core modules
export {
  subscribeToReactions,
  notifyReactionListeners,
  getReactionListenerCount,
  clearReactionListeners,
} from "./reactionSubscriptions";

export {
  flushLikeBatch,
  addToPendingLikes,
  getPendingLikeCount,
  getPendingLikeTrackTitle,
  resetLikeBatching,
  configureLikeBatching,
} from "./likeBatching";

export {
  generateMessageId,
  handleAck,
  handleNack,
  handleTimeout,
  retrySend,
  clearPendingMessages,
  trackMessage,
  getPendingMessageCount,
  isMessagePending,
  setSocketInstance,
  configureReliability,
} from "./reliability";

export {
  flushQueue,
  isQueueFlushing,
  getQueueSize,
  setQueueSocketInstance,
  configureQueueFlush,
} from "./offlineQueue";

export {
  sendMessage,
  setMessageSenderSocket,
  isSocketConnected,
} from "./messageSender";

export {
  generateSessionId,
  getTrackKey,
  broadcastTrack,
  resetLastBroadcastedTrack,
  getLastBroadcastedTrackKey,
  forceReBroadcast,
} from "./trackBroadcast";

// State helpers (transition layer for store access)
export * from "./stateHelpers";

// Constants (centralized magic numbers)
export * from "./constants";

// Type guards (runtime type safety)
export * from "./typeGuards";

// Message router (O(1) dispatch)
export { messageRouter, type MessageRouterContext } from "./messageRouter";

// Connection manager (goLive helpers)
export {
  createDatabaseSession,
  startVirtualDJWatcher,
  prepareInitialTrackState,
  getTrackInfoForBroadcast,
} from "./connectionManager";
