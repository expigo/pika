/**
 * Connection Manager
 *
 * Helper functions for the goLive connection lifecycle.
 * Extracted to reduce the size of useLiveSession.ts.
 *
 * @package @pika/desktop
 */

import { sessionRepository } from "../../db/repositories/sessionRepository";
import {
  type NowPlayingTrack,
  toTrackInfo,
  virtualDjWatcher,
} from "../../services/virtualDjWatcher";
import { logger } from "../../utils/logger";
import { TRACK_DEDUP_WINDOW_MS } from "./constants";
import {
  addProcessedTrackKey,
  clearProcessedTrackKeys,
  setLastBroadcastedTrackKey,
  setSkipInitialTrackBroadcast,
} from "./stateHelpers";

// =============================================================================
// Database Session Management
// =============================================================================

/**
 * Create a new database session and link it to the cloud session ID
 */
export async function createDatabaseSession(
  sessionName: string | undefined,
  cloudSessionId: string,
): Promise<number> {
  const name = sessionName || `Live Set ${new Date().toLocaleDateString()}`;
  logger.info("Live", "Creating database session", { name });

  const dbSession = await sessionRepository.createSession(name);
  await sessionRepository.setCloudSessionId(dbSession.id, cloudSessionId);

  logger.info("Live", "Database session created", { dbSessionId: dbSession.id });
  return dbSession.id;
}

// =============================================================================
// VirtualDJ Watcher Management
// =============================================================================

/**
 * Fetch the currently playing track from VDJ history without starting the watcher
 */
export async function detectInitialTrack(): Promise<NowPlayingTrack | null> {
  logger.debug("Live", "Detecting initial VirtualDJ track");
  return virtualDjWatcher.readLatestTrack();
}

/**
 * Start VDJ watcher polling
 */
export async function startVirtualDJWatcher(): Promise<void> {
  logger.debug("Live", "Starting VirtualDJ watcher");
  await virtualDjWatcher.startWatching();
}

// =============================================================================
// Initial Track Handling
// =============================================================================

/**
 * Prepare the initial track state based on user preference
 *
 * @param initialTrack - The currently playing track (if any)
 * @param includeCurrentTrack - Whether to include the current track in the session
 */
export function prepareInitialTrackState(
  initialTrack: NowPlayingTrack | null,
  includeCurrentTrack: boolean,
): void {
  clearProcessedTrackKeys();
  setLastBroadcastedTrackKey(null);

  if (!initialTrack) return;

  logger.info("Live", "Initial track found", {
    artist: initialTrack.artist,
    title: initialTrack.title,
  });

  const dedupWindow = Math.floor(Date.now() / TRACK_DEDUP_WINDOW_MS);
  const trackKey = `${initialTrack.artist}-${initialTrack.title}-${dedupWindow}`;
  const absoluteKey = `${initialTrack.artist}:${initialTrack.title}`;

  if (includeCurrentTrack) {
    setSkipInitialTrackBroadcast(false);
    // Even if including, we mark as processed for recordPlay to prevent double-counting
    // (the watcher listener will handle the actual broadcast/recording)
    addProcessedTrackKey(trackKey);
    setLastBroadcastedTrackKey(absoluteKey);
  } else {
    logger.debug("Live", "Skipping initial track (user chose not to include)");
    setSkipInitialTrackBroadcast(true);

    // Mark the initial track as processed so it won't be recorded/broadcast
    addProcessedTrackKey(trackKey);
    setLastBroadcastedTrackKey(absoluteKey);
  }
}

/**
 * Get TrackInfo representation of a NowPlayingTrack
 */
export function getTrackInfoForBroadcast(track: NowPlayingTrack) {
  return toTrackInfo(track);
}
