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
export async function enqueueForAnalysis(trackId: number, filePath: string) {
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
    processQueue();
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
      }
    } else {
      console.error("[ProgressiveAnalysis] HTTP error:", response.status);
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
