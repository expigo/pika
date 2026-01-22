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
import { TRACK_DEDUP_WINDOW_MS, VDJ_WATCH_INTERVAL_MS } from "./constants";
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
 * Start VDJ watcher and return the current track if any
 */
export async function startVirtualDJWatcher(): Promise<NowPlayingTrack | null> {
  logger.debug("Live", "Starting VirtualDJ watcher");
  await virtualDjWatcher.startWatching(VDJ_WATCH_INTERVAL_MS);
  return virtualDjWatcher.getCurrentTrack();
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

  if (includeCurrentTrack) {
    setSkipInitialTrackBroadcast(false);
  } else {
    logger.debug("Live", "Skipping initial track (user chose not to include)");
    setSkipInitialTrackBroadcast(true);

    // Mark the initial track as processed so it won't be recorded/broadcast
    const dedupWindow = Math.floor(Date.now() / TRACK_DEDUP_WINDOW_MS);
    const trackKey = `${initialTrack.artist}-${initialTrack.title}-${dedupWindow}`;
    addProcessedTrackKey(trackKey);
    setLastBroadcastedTrackKey(`${initialTrack.artist}:${initialTrack.title}`);
  }
}

/**
 * Get TrackInfo representation of a NowPlayingTrack
 */
export function getTrackInfoForBroadcast(track: NowPlayingTrack) {
  return toTrackInfo(track);
}
