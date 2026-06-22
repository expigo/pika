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
  isTrackFresh,
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
  const track = await virtualDjWatcher.readLatestTrack();
  // A stale last-history entry means VDJ is idle/closed → there is no current track.
  if (track && !isTrackFresh(track)) {
    logger.info("Live", "Latest VDJ track is stale — treating as no current track", {
      title: track.title,
    });
    return null;
  }
  return track;
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

  if (includeCurrentTrack) {
    setSkipInitialTrackBroadcast(false);
    // 🛡️ Fix for Issue #2: Do NOT mark as processed or broadcasted here.
    // By leaving it clean, the watcher's initial "readLatestTrack" event will trigger:
    // 1. recordPlay (since it's not processed) -> Writes to DB
    // 2. broadcastTrack (since lastBroadcastedKey is distinct) -> Sends to Mobile
  } else {
    logger.debug("Live", "Skipping initial track (user chose not to include)");
    setSkipInitialTrackBroadcast(true);

    // Full suppression. Seed the broadcast-dedup key so the watcher's initial
    // emission is NOT broadcast to dancers/cloud (broadcastTrack dedups on this key),
    // and mark it processed so it isn't recorded to the local logbook. handleTrackChange
    // matches this same key to also suppress the desktop "Now Playing" UI.
    setLastBroadcastedTrackKey(`${initialTrack.artist}:${initialTrack.title}`);
    addProcessedTrackKey(trackKey);
  }
}

/**
 * Get TrackInfo representation of a NowPlayingTrack
 */
export function getTrackInfoForBroadcast(track: NowPlayingTrack) {
  return toTrackInfo(track);
}
