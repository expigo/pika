import type { TrackInfo } from "@pika/shared";
import { invoke } from "@tauri-apps/api/core";
import { settingsRepository } from "../db/repositories/settingsRepository";

/**
 * Extended track info from VirtualDJ with additional metadata.
 * When sending to Cloud, map to TrackInfo.
 */
export interface NowPlayingTrack extends TrackInfo {
  filePath: string;
  timestamp: Date;
  rawTimestamp?: number;
}

/**
 * Convert NowPlayingTrack to TrackInfo for WebSocket messages.
 * Includes fingerprint data if available.
 */
export function toTrackInfo(track: NowPlayingTrack): TrackInfo {
  return {
    artist: track.artist,
    title: track.title,
    // Core metrics (Ensure BPM is a number for shared schema validation)
    bpm:
      typeof track.bpm === "string"
        ? Number.parseFloat(track.bpm) || undefined
        : (track.bpm as number | undefined),
    key: track.key,
    // Fingerprint metrics (if available on track)
    energy: track.energy,
    danceability: track.danceability,
    brightness: track.brightness,
    acousticness: track.acousticness,
    groove: track.groove,
  };
}

interface HistoryTrack {
  artist: string;
  title: string;
  file_path: string;
  timestamp: number;
  // Optional fields that might come from improved Rust backend
  bpm?: number;
  key?: string;
  energy?: number;
  danceability?: number;
  brightness?: number;
  acousticness?: number;
  groove?: number;
}

type TrackChangeCallback = (track: NowPlayingTrack) => void;

/**
 * VirtualDJ History Watcher
 * Monitors the VirtualDJ history folder for track changes using Rust backend
 */
class VirtualDJWatcher {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private lastTrack: NowPlayingTrack | null = null;
  private lastTimestamp = 0;
  private listeners: TrackChangeCallback[] = [];
  private visibilityListenerAdded = false;

  /**
   * Read and parse the latest track from history using Rust
   */
  async readLatestTrack(): Promise<NowPlayingTrack | null> {
    try {
      // Get custom VDJ path from settings (may be "auto" or a file path)
      const customPath = await settingsRepository.get("library.vdjPath");

      const result = await invoke<HistoryTrack | null>("read_virtualdj_history", {
        customPath: customPath,
      });

      if (!result) {
        return null;
      }

      // If BPM is missing (common with history logs), fetch from VDJ database/sidecar
      let bpm = result.bpm;
      let key = result.key;

      if ((!bpm || !key) && result.file_path && !result.file_path.startsWith("unknown")) {
        try {
          const metadata = await invoke<{
            bpm: number | null;
            key: string | null;
            energy: number | null;
          } | null>("lookup_vdj_track_metadata", {
            filePath: result.file_path,
          });

          if (metadata) {
            bpm = metadata.bpm ?? bpm;
            key = metadata.key ?? key;
            // Only update energy if provided
            // energy = metadata.energy ?? energy;
          }
        } catch (e) {
          console.warn("[VDJ Watcher] Metadata lookup failed:", e);
        }
      }

      const track: NowPlayingTrack = {
        artist: result.artist,
        title: result.title,
        bpm: bpm ? Number.parseFloat(String(bpm)) : undefined,
        key: key,
        filePath: result.file_path,
        timestamp: new Date(result.timestamp * 1000),
        rawTimestamp: result.timestamp,
        // Fingerprint fields
        energy: result.energy,
        danceability: result.danceability,
        brightness: result.brightness,
        acousticness: result.acousticness,
        groove: result.groove,
      };

      return track;
    } catch (e) {
      console.error("[VDJ Watcher] Failed to read history:", e);
      return null;
    }
  }

  /**
   * Start watching for track changes
   */
  async startWatching(): Promise<void> {
    if (this.pollingInterval) {
      return;
    }

    const getInterval = () => {
      // 🛡️ Reliability Audit: Adaptive polling (1s visible, 3s hidden)
      // Never stop polling to avoid missing tracks in background
      return typeof document !== "undefined" && document.visibilityState === "hidden" ? 3000 : 1000;
    };

    console.log(`[VDJ Watcher] Starting to watch (Adaptive: ${getInterval()}ms)...`);

    // Initial read
    const initial = await this.readLatestTrack();
    if (initial) {
      // 🛡️ FIX: Only notify if track actually changed from last known state
      // (This prevents phantom recordings on app visibility toggle)
      const changed = this.hasTrackChanged(initial);
      this.lastTrack = initial;
      this.lastTimestamp = initial.rawTimestamp ?? 0;

      if (changed) {
        console.log(
          "[VDJ Watcher] Initial track change detected:",
          initial.artist,
          "-",
          initial.title,
        );
        this.notifyListeners(initial);
      } else {
        console.debug("[VDJ Watcher] Track unchanged on start, skipping notify");
      }
    }

    // Start polling with current visibility-based interval
    this.restartPolling(getInterval());

    // 🛡️ Fix: Build-up of event listeners
    if (typeof document !== "undefined" && !this.visibilityListenerAdded) {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.visibilityListenerAdded = true;
    }
  }

  /**
   * Internal helper to start/restart polling with specific interval
   */
  private restartPolling(interval: number): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }

    this.pollingInterval = setInterval(async () => {
      try {
        const track = await this.readLatestTrack();
        if (track && this.hasTrackChanged(track)) {
          console.log("[VDJ Watcher] Track changed:", track.artist, "-", track.title);
          this.lastTrack = track;
          this.lastTimestamp = track.rawTimestamp ?? 0;
          this.notifyListeners(track);
        }
      } catch (e) {
        console.error("[VDJ Watcher] Polling error:", e);
      }
    }, interval);
  }

  /**
   * Handle visibility change to refresh polling interval
   */
  private handleVisibilityChange = () => {
    if (this.pollingInterval) {
      const interval =
        typeof document !== "undefined" && document.visibilityState === "hidden" ? 3000 : 1000;
      console.log(`[VDJ Watcher] Visibility changed, adjusting interval to ${interval}ms`);
      // 🛡️ FIX: We only restart the INTERVAL, not the whole startWatching() flow.
      // This avoids the 'initial read' logical branch which was prone to phantom notifies.
      this.restartPolling(interval);
    }
  };

  /**
   * Stop watching
   */
  stopWatching(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.lastTimestamp = 0;
      console.log("[VDJ Watcher] Stopped watching");
    }

    if (typeof document !== "undefined" && this.visibilityListenerAdded) {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      this.visibilityListenerAdded = false;
    }
  }

  /**
   * Check if track has changed since last notification
   */
  private hasTrackChanged(track: NowPlayingTrack): boolean {
    if (track.rawTimestamp && this.lastTimestamp) {
      return track.rawTimestamp !== this.lastTimestamp;
    }

    if (!this.lastTrack) return true;

    return track.artist !== this.lastTrack.artist || track.title !== this.lastTrack.title;
  }

  /**
   * Add a listener for track changes
   */
  onTrackChange(callback: TrackChangeCallback): () => void {
    this.listeners.push(callback);
    console.log("[VDJ Watcher] Listener added, total:", this.listeners.length);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
      console.log("[VDJ Watcher] Listener removed, total:", this.listeners.length);
    };
  }

  /**
   * Notify all listeners
   */
  private notifyListeners(track: NowPlayingTrack): void {
    console.log("[VDJ Watcher] Notifying", this.listeners.length, "listeners");
    for (const listener of this.listeners) {
      try {
        listener(track);
      } catch (e) {
        console.error("[VDJ Watcher] Listener error:", e);
      }
    }
  }

  /**
   * Get current track
   */
  getCurrentTrack(): NowPlayingTrack | null {
    return this.lastTrack;
  }
}

// Singleton instance
export const virtualDjWatcher = new VirtualDJWatcher();
