/**
 * State Helpers - Transition Layer for Store Access
 *
 * This module provides helper functions to read/write from useLiveStore
 * without requiring React hooks. Used by non-React code (WebSocket handlers,
 * business logic modules) to access centralized state.
 *
 * @package @pika/desktop
 */

import { useLiveStore } from "../useLiveStore";

// ============================================================================
// Session State Helpers
// ============================================================================

/**
 * Get current session ID (cloud session)
 */
export function getSessionId(): string | null {
  return useLiveStore.getState().sessionId;
}

/**
 * Set session ID
 */
export function setSessionId(id: string | null): void {
  useLiveStore.getState().setSessionId(id);
}

/**
 * Get current database session ID
 */
export function getDbSessionId(): number | null {
  return useLiveStore.getState().dbSessionId;
}

/**
 * Set database session ID
 */
export function setDbSessionId(id: number | null): void {
  useLiveStore.getState().setDbSessionId(id);
}

/**
 * Get current play ID
 */
export function getCurrentPlayId(): number | null {
  return useLiveStore.getState().currentPlayId;
}

/**
 * Set current play ID
 */
export function setCurrentPlayId(id: number | null): void {
  useLiveStore.getState().setCurrentPlayId(id);
}

// ============================================================================
// Status Helpers
// ============================================================================

/**
 * Check if session is live (status === "live" and has a dbSessionId)
 */
export function isLive(): boolean {
  const state = useLiveStore.getState();
  return state.status === "live" && state.dbSessionId !== null;
}

/**
 * Check if session is in "live mode" (isLiveFlag equivalent)
 * This is true when the user has clicked "Go Live" even if socket is connecting
 */
export function isInLiveMode(): boolean {
  const state = useLiveStore.getState();
  // In live mode if status is live or connecting, and we have a session ID
  return (state.status === "live" || state.status === "connecting") && state.sessionId !== null;
}

/**
 * Get current status
 */
export function getStatus() {
  return useLiveStore.getState().status;
}

/**
 * Set status
 */
export function setStatus(status: "offline" | "connecting" | "live" | "error"): void {
  useLiveStore.getState().setStatus(status);
}

// ============================================================================
// Track Broadcast Helpers
// ============================================================================

/**
 * Get last broadcasted track key (for deduplication)
 */
export function getLastBroadcastedTrackKey(): string | null {
  return useLiveStore.getState().lastBroadcastedTrackKey;
}

/**
 * Set last broadcasted track key
 */
export function setLastBroadcastedTrackKey(key: string | null): void {
  useLiveStore.getState().setLastBroadcastedTrackKey(key);
}

/**
 * Check if track key was already processed in this session
 */
export function hasProcessedTrackKey(key: string): boolean {
  return useLiveStore.getState().processedTrackKeys.has(key);
}

/**
 * Add a track key to processed set
 */
export function addProcessedTrackKey(key: string): void {
  useLiveStore.getState().addProcessedTrackKey(key);
}

/**
 * Clear processed track keys (on session start)
 */
export function clearProcessedTrackKeys(): void {
  useLiveStore.getState().clearProcessedTrackKeys();
}

// ============================================================================
// Initial Track Broadcast Helpers
// ============================================================================

/**
 * Get skip initial track broadcast flag
 */
export function shouldSkipInitialTrackBroadcast(): boolean {
  return useLiveStore.getState().skipInitialTrackBroadcast;
}

/**
 * Set skip initial track broadcast flag
 */
export function setSkipInitialTrackBroadcast(skip: boolean): void {
  useLiveStore.getState().setSkipInitialTrackBroadcast(skip);
}

// ============================================================================
// Queue Helpers
// ============================================================================

/**
 * Check if queue is currently flushing
 */
export function isQueueFlushing(): boolean {
  return useLiveStore.getState().isFlushingQueue;
}

/**
 * Set queue flushing state
 */
export function setQueueFlushing(flushing: boolean): void {
  useLiveStore.getState().setIsFlushingQueue(flushing);
}

// ============================================================================
// Like Batching Helpers
// ============================================================================

/**
 * Get pending like info
 */
export function getPendingLikeInfo(): { count: number; trackTitle: string | null } {
  return useLiveStore.getState().pendingLikeInfo;
}

/**
 * Set pending like info
 */
export function setPendingLikeInfo(info: { count: number; trackTitle: string | null }): void {
  useLiveStore.getState().setPendingLikeInfo(info);
}

// ============================================================================
// Played Tracks Helpers
// ============================================================================

/**
 * Add a track to played set
 */
export function addPlayedTrack(trackKey: string): void {
  useLiveStore.getState().addPlayedTrack(trackKey);
}

/**
 * Check if track was played in this session
 */
export function hasPlayedTrack(trackKey: string): boolean {
  return useLiveStore.getState().playedTrackKeys.has(trackKey);
}

/**
 * Clear played tracks (on session start)
 */
export function clearPlayedTracks(): void {
  useLiveStore.getState().clearPlayedTracks();
}

// ============================================================================
// Live Likes Helpers
// ============================================================================

/**
 * Get live likes count
 */
export function getLiveLikes(): number {
  return useLiveStore.getState().liveLikes;
}

/**
 * Set live likes count
 */
export function setLiveLikes(count: number): void {
  useLiveStore.getState().setLiveLikes(count);
}

/**
 * Increment live likes
 */
export function incrementLiveLikes(): void {
  useLiveStore.getState().incrementLiveLikes();
}

// ============================================================================
// Full Reset
// ============================================================================

/**
 * Reset all store state (on session end)
 */
export function resetStore(): void {
  useLiveStore.getState().reset();
}
