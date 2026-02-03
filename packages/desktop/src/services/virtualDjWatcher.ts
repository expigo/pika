import type { TrackInfo } from "@pika/shared";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { settingsRepository } from "../db/repositories/settingsRepository";

const IPC_TIMEOUT_MS = 5000;

// 🛡️ Issue 27 Fix: Timeout wrapper for IPC calls
async function invokeWithTimeout<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`IPC Timeout: ${cmd}`)), IPC_TIMEOUT_MS),
  );
  return Promise.race([invoke<T>(cmd, args), timeout]);
}

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
  private unlistenFn: UnlistenFn | null = null;
  private isUsingNative = false;

  /**
   * Read and parse the latest track from history using Rust
   */
  async readLatestTrack(): Promise<NowPlayingTrack | null> {
    try {
      // Get custom VDJ path from settings (may be "auto" or a file path)
      const customPath = await settingsRepository.get("library.vdjPath");

      const result = await invokeWithTimeout<HistoryTrack | null>("read_virtualdj_history", {
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
          const metadata = await invokeWithTimeout<{
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
    if (this.pollingInterval || this.unlistenFn) {
      return;
    }

    try {
      console.log("[VDJ Watcher] Attempting to start native file system watcher...");
      const customPath = await settingsRepository.get("library.vdjPath");

      // 1. Try to start native watcher
      await invoke("start_vdj_watcher", { customPath });

      // 2. Setup event listener
      this.unlistenFn = await listen<HistoryTrack>("vdj-history-update", (event) => {
        this.handleNativeUpdate(event.payload);
      });

      this.isUsingNative = true;
      console.log("[VDJ Watcher] Native watcher started successfully. Polling disabled.");

      // Initial read to populate state immediately
      const initial = await this.readLatestTrack();
      if (initial) {
        this.lastTrack = initial;
        this.lastTimestamp = initial.rawTimestamp ?? 0;
        // Notify immediately if we have a track
        this.notifyListeners(initial);
      }
    } catch (e) {
      console.warn("[VDJ Watcher] Native watcher failed to start, falling back to polling:", e);
      this.isUsingNative = false;

      // FALBACK: Start polling (Legacy Logic)
      const getInterval = () => {
        return typeof document !== "undefined" && document.visibilityState === "hidden"
          ? 3000
          : 1000;
      };

      console.log(`[VDJ Watcher] Starting legacy polling (Adaptive: ${getInterval()}ms)...`);

      const initial = await this.readLatestTrack();
      if (initial) {
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
        }
      }

      this.restartPolling(getInterval());

      if (typeof document !== "undefined" && !this.visibilityListenerAdded) {
        document.addEventListener("visibilitychange", this.handleVisibilityChange);
        this.visibilityListenerAdded = true;
      }
    }
  }

  /**
   * Handle update from native watcher
   */
  private async handleNativeUpdate(historyTrack: HistoryTrack) {
    // Convert HistoryTrack to NowPlayingTrack (enrich with BPM/Key if needed)
    // We reuse readLatestTrack logic partly, or implement enrichment here.
    // To keep it simple and robust, we can use the historyTrack payload directly if it has enough info,
    // but we usually need to enrich it with BPM/Key from database lookup.

    // Fast path: Construct basic track
    let track: NowPlayingTrack = {
      artist: historyTrack.artist,
      title: historyTrack.title,
      filePath: historyTrack.file_path,
      timestamp: new Date(historyTrack.timestamp * 1000),
      rawTimestamp: historyTrack.timestamp,
      // Missing fingerprint/bpm info initially
    };

    // Enrich: Check if we need to fetch metadata
    // (This matches readLatestTrack logic but triggered by event)
    if (track.filePath && !track.filePath.startsWith("unknown")) {
      try {
        const metadata = await invokeWithTimeout<{
          bpm: number | null;
          key: string | null;
          energy: number | null;
        } | null>("lookup_vdj_track_metadata", {
          filePath: track.filePath,
        });

        if (metadata) {
          track.bpm = metadata.bpm ?? undefined;
          track.key = metadata.key ?? undefined;
          track.energy = metadata.energy ?? undefined;
        }
      } catch (e) {
        // Ignore lookup errors
      }
    }

    if (this.hasTrackChanged(track)) {
      console.log("[VDJ Watcher] Native update:", track.artist, "-", track.title);
      this.lastTrack = track;
      this.lastTimestamp = track.rawTimestamp ?? 0;
      this.notifyListeners(track);
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
    // Stop native watcher
    if (this.unlistenFn) {
      this.unlistenFn();
      this.unlistenFn = null;
      invoke("stop_vdj_watcher").catch(console.error);
    }
    this.isUsingNative = false;

    // Stop polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    this.lastTimestamp = 0;
    console.log("[VDJ Watcher] Stopped watching");

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
