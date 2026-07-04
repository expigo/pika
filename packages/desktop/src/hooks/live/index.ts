/**
 * Live Session Modules
 *
 * This directory contains modular components extracted from the
 * monolithic useLiveSession.ts for better testability and maintainability.
 *
 * @package @pika/desktop
 */

// Connection manager (goLive helpers)
export {
  createDatabaseSession,
  detectInitialTrack,
  getTrackInfoForBroadcast,
  prepareInitialTrackState,
  startVirtualDJWatcher,
} from "./connectionManager";
// Constants (centralized magic numbers)
export * from "./constants";

export {
  addToPendingLikes,
  configureLikeBatching,
  flushLikeBatch,
  getPendingLikeCount,
  getPendingLikeTrackTitle,
  resetLikeBatching,
} from "./likeBatching";
// Message router (O(1) dispatch)
export { type MessageRouterContext, messageRouter } from "./messageRouter";
export {
  isSocketConnected,
  sendMessage,
  setMessageSenderSocket,
} from "./messageSender";
export {
  configureQueueFlush,
  flushQueue,
  getQueueSize,
  isQueueFlushing,
  setQueueSocketInstance,
} from "./offlineQueue";
// Core modules
export {
  clearReactionListeners,
  getReactionListenerCount,
  notifyReactionListeners,
  subscribeToReactions,
} from "./reactionSubscriptions";
export {
  clearPendingMessages,
  configureReliability,
  generateMessageId,
  getPendingMessageCount,
  handleAck,
  handleNack,
  handleTimeout,
  isMessagePending,
  retrySend,
  setSocketInstance,
  trackMessage,
} from "./reliability";
// State helpers (transition layer for store access)
export * from "./stateHelpers";
export {
  broadcastTrack,
  forceReBroadcast,
  generateSessionId,
  getLastBroadcastedTrackKey,
  getTrackKey,
  resetLastBroadcastedTrack,
} from "./trackBroadcast";
// Type guards (runtime type safety)
export * from "./typeGuards";
// Types
export * from "./types";
