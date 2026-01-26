/**
 * Progressive Analysis Service
 * Analyzes tracks in the background as they're played.
 *
 * This is a singleton service (not a hook) that can be called from
 * useLiveSession without React context requirements.
 */

import { fetch } from "@tauri-apps/plugin-http";
import { type AnalysisResult, trackRepository } from "../db/repositories/trackRepository";
import { settingsRepository } from "../db/repositories/settingsRepository";
import { sendMessage } from "../hooks/live";
import { getSessionId as getStoreSessionId } from "../hooks/live/stateHelpers";
import { MESSAGE_TYPES } from "@pika/shared";

interface AnalysisJob {
  trackId: number;
  filePath: string;
}

// Singleton state
let queue: AnalysisJob[] = [];
let isProcessing = false;
let sidecarBaseUrl: string | null = null;
let processingTimeout: ReturnType<typeof setTimeout> | null = null;

// Delay is now dynamic based on CPU priority setting (see scheduleNextProcess)

/**
 * Set the sidecar base URL (called from App when sidecar is ready)
 */
export function setSidecarUrl(url: string | null) {
  sidecarBaseUrl = url;
  console.log("[ProgressiveAnalysis] Sidecar URL set:", url);
}

/**
 * Enqueue a track for progressive analysis
 * Respects the analysis.onTheFly setting
 */
export async function enqueueForAnalysis(
  trackId: number,
  filePath: string,
  waitForCompletion = false,
) {
  // Check if progressive analysis is enabled
  const enabled = await settingsRepository.get("analysis.onTheFly");
  if (!enabled) {
    console.log("[ProgressiveAnalysis] On-the-fly analysis disabled");
    return;
  }

  if (!sidecarBaseUrl) {
    console.log("[ProgressiveAnalysis] Sidecar not ready");
    return;
  }

  // Check if already in queue
  if (queue.some((job) => job.trackId === trackId)) {
    console.log("[ProgressiveAnalysis] Track already in queue:", trackId);
    return;
  }

  // Check if already analyzed
  const track = await trackRepository.getTrackById(trackId);
  if (track?.analyzed) {
    console.log("[ProgressiveAnalysis] Track already analyzed:", trackId);
    return;
  }

  console.log("[ProgressiveAnalysis] Enqueueing track:", trackId);
  queue.push({ trackId, filePath });

  // Start processing if not already running
  if (!isProcessing && !processingTimeout) {
    const promise = processQueue();
    if (waitForCompletion) return promise;
  }
}

/**
 * Process the analysis queue
 */
async function processQueue() {
  if (isProcessing || queue.length === 0 || !sidecarBaseUrl) {
    return;
  }

  isProcessing = true;

  const job = queue.shift();
  if (!job) {
    isProcessing = false;
    return;
  }
  console.log("[ProgressiveAnalysis] Processing:", job.filePath);

  try {
    // Double-check track isn't analyzed (could have changed while queued)
    const track = await trackRepository.getTrackById(job.trackId);
    if (track?.analyzed) {
      console.log("[ProgressiveAnalysis] Track already analyzed, skipping");
      isProcessing = false;
      scheduleNextProcess();
      return;
    }

    // Call sidecar for analysis
    const url = `${sidecarBaseUrl}/analyze?path=${encodeURIComponent(job.filePath)}`;
    const response = await fetch(url, { method: "GET" });

    if (response.ok) {
      const result: AnalysisResult = await response.json();
      if (result.error) {
        console.error("[ProgressiveAnalysis] Analysis error:", result.error);
        await trackRepository.markTrackAnalyzed(job.trackId, null);
      } else {
        console.log("[ProgressiveAnalysis] Complete:", result.bpm, result.key);
        await trackRepository.markTrackAnalyzed(job.trackId, result);

        // U4 Fix: Immediately broadcast improved data to listeners
        // This solves the issue where Web App is stuck with "null" BPM until next track
        const sessionId = getStoreSessionId();
        if (sessionId) {
          const track = await trackRepository.getTrackById(job.trackId);
          if (track) {
            console.log("[ProgressiveAnalysis] Broadcasting updated metadata");
            // 🛡️ Issue 49 Fix: Use METADATA_UPDATED to bypass rate limits on server
            // and avoid resetting like counters.
            console.log("[TestDebug] About to sendMessage METADATA_UPDATED");
            try {
              sendMessage({
                type: MESSAGE_TYPES.METADATA_UPDATED,
                sessionId,
                track: {
                  artist: track.artist ?? "",
                  title: track.title ?? "",
                  bpm: track.bpm ?? undefined,
                  key: track.key ?? undefined,
                  energy: track.energy ?? undefined,
                  danceability: track.danceability ?? undefined,
                  brightness: track.brightness ?? undefined,
                  acousticness: track.acousticness ?? undefined,
                  groove: track.groove ?? undefined,
                },
              });
              console.log("[TestDebug] sendMessage called");
            } catch (err) {
              console.error("[TestDebug] sendMessage failed", err);
            }
          } else {
            console.log("[TestDebug] Track not found for broadcast");
          }
        } else {
          console.log("[TestDebug] No sessionId");
        }
      }
    } else {
      console.log("[ProgressiveAnalysis] HTTP error:", response.status);
      await trackRepository.markTrackAnalyzed(job.trackId, null);
    }
  } catch (e) {
    console.error("[ProgressiveAnalysis] Error:", e);
    // Don't mark as analyzed on network error - can retry later
  }

  isProcessing = false;
  scheduleNextProcess();
}

/**
 * Schedule the next queue processing with delay based on CPU priority
 */
async function scheduleNextProcess() {
  if (queue.length === 0) {
    return;
  }

  // Clear any existing timeout
  if (processingTimeout) {
    clearTimeout(processingTimeout);
  }

  // Get delay based on CPU priority setting
  const priority = await settingsRepository.get("analysis.cpuPriority");
  const delay = priority === "high" ? 0 : priority === "low" ? 3000 : 2000;

  // Schedule next processing with delay
  processingTimeout = setTimeout(() => {
    processingTimeout = null;
    processQueue();
  }, delay);
}

/**
 * Get current queue length (for debugging)
 */
export function getQueueLength(): number {
  return queue.length;
}

/**
 * Clear the queue (for cleanup)
 */
export function clearQueue() {
  queue = [];
  if (processingTimeout) {
    clearTimeout(processingTimeout);
    processingTimeout = null;
  }
}

/**
 * Reset internal state (For testing only)
 */
export function resetServiceState() {
  queue = [];
  isProcessing = false;
  sidecarBaseUrl = null;
  if (processingTimeout) {
    clearTimeout(processingTimeout);
    processingTimeout = null;
  }
}
