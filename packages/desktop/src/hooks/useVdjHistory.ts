import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";
import { sessionRepository } from "../db/repositories/sessionRepository";
import { findOrCreateTrack } from "../services/trackService";
import { logger } from "../utils/logger";

export interface VdjHistoryTrack {
  artist: string;
  title: string;
  file_path: string;
  timestamp: number; // Unix timestamp in seconds
}

export interface DetectedSession {
  tracks: VdjHistoryTrack[];
  startTime: Date;
  endTime: Date;
  autoDetected: boolean;
  sessionGap: number; // Gap that triggered session boundary (ms)
}

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 minutes
const MAX_HISTORY_LOOKBACK = 24 * 60 * 60; // 24 hours in seconds

export function useVdjHistory() {
  const detectSession = useCallback(async (): Promise<DetectedSession | null> => {
    try {
      // Read up to 200 tracks (should cover any realistic session)
      const allTracks = await invoke<VdjHistoryTrack[]>("read_virtualdj_history_full", {
        maxEntries: 200,
      });

      if (allTracks.length === 0) {
        logger.info("VDJ History", "No tracks found in history");
        return null;
      }

      logger.info("VDJ History", `Read ${allTracks.length} tracks from VDJ`);

      // Filter: Only consider tracks from last 24 hours
      const now = Math.floor(Date.now() / 1000);
      const recentTracks = allTracks.filter(
        (t) => t.timestamp > 0 && now - t.timestamp < MAX_HISTORY_LOOKBACK,
      );

      if (recentTracks.length === 0) {
        logger.info("VDJ History", "No recent tracks (all older than 24h)");
        return null;
      }

      // Sort by timestamp descending (most recent first)
      recentTracks.sort((a, b) => b.timestamp - a.timestamp);

      // Detect session boundary via time gaps
      const sessionTracks: VdjHistoryTrack[] = [];
      let detectedGap = 0;

      for (let i = 0; i < recentTracks.length; i++) {
        const track = recentTracks[i];
        sessionTracks.push(track);

        // Check gap to next (older) track
        const nextTrack = recentTracks[i + 1];
        if (nextTrack) {
          const gap = (track.timestamp - nextTrack.timestamp) * 1000; // Convert to ms

          if (gap > SESSION_GAP_MS) {
            // Found session boundary
            logger.info(
              "VDJ History",
              `Session boundary detected: ${Math.round(gap / 60000)} min gap`,
            );
            detectedGap = gap;
            break;
          }
        }
      }

      if (sessionTracks.length === 0) return null;

      // Reverse to get chronological order (oldest first)
      sessionTracks.reverse();

      return {
        tracks: sessionTracks,
        startTime: new Date(sessionTracks[0].timestamp * 1000),
        endTime: new Date(sessionTracks[sessionTracks.length - 1].timestamp * 1000),
        autoDetected: true,
        sessionGap: detectedGap,
      };
    } catch (error) {
      logger.error("VDJ History", "Failed to detect session", error);
      return null;
    }
  }, []);

  const importTracks = useCallback(
    async (
      tracks: VdjHistoryTrack[],
      sessionId: number,
      startIndex = 0,
      onTrackImported?: (artist: string, title: string, timestamp: number) => void,
    ): Promise<number> => {
      let imported = 0;
      const tracksToImport = tracks.slice(startIndex);

      for (const track of tracksToImport) {
        try {
          // Find or create track in DB (reuse existing function)
          const dbTrack = await findOrCreateTrack(track.artist, track.title, track.file_path);

          // Add play with historical timestamp
          await sessionRepository.addPlay(sessionId, dbTrack.id, track.timestamp);

          imported++;

          // 🛡️ Register for dedup ONLY if import succeeded
          if (onTrackImported) {
            onTrackImported(track.artist, track.title, track.timestamp);
          }

          logger.debug("VDJ History", "Imported track", {
            title: track.title,
            timestamp: track.timestamp,
          });
        } catch (error) {
          logger.error("VDJ History", "Failed to import track", {
            title: track.title,
            error,
          });
          // Continue with other tracks (onTrackImported is NOT called for failed track)
        }
      }

      logger.info(
        "VDJ History",
        `Imported ${imported}/${tracksToImport.length} tracks (starting from #${startIndex + 1})`,
      );
      return imported;
    },
    [],
  );

  return { detectSession, importTracks };
}
