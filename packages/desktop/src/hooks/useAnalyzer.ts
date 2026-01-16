import { fetch } from "@tauri-apps/plugin-http";
import { useCallback, useRef, useState } from "react";
import {
  type AnalysisResult,
  type Track,
  trackRepository,
} from "../db/repositories/trackRepository";
import { settingsRepository } from "../db/repositories/settingsRepository";

export interface UseAnalyzerState {
  isAnalyzing: boolean;
  isPaused: boolean;
  currentTrack: Track | null;
  progress: number;
  totalToAnalyze: number;
  error: string | null;
}

export interface UseAnalyzerReturn extends UseAnalyzerState {
  startAnalysis: (baseUrl: string) => Promise<void>;
  startSetAnalysis: (baseUrl: string, trackIds: number[]) => Promise<void>;
  stopAnalysis: () => void;
  pauseAnalysis: () => void;
  resumeAnalysis: () => void;
}

export function useAnalyzer(): UseAnalyzerReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [progress, setProgress] = useState(0);
  const [totalToAnalyze, setTotalToAnalyze] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Use refs to track state across async operations
  const shouldContinue = useRef(true);
  const isAnalyzingRef = useRef(false);
  const isPausedRef = useRef(false);
  const resumeResolve = useRef<(() => void) | null>(null);

  const stopAnalysis = useCallback(() => {
    shouldContinue.current = false;
    // If paused, also resume to let the loop exit
    if (isPausedRef.current && resumeResolve.current) {
      resumeResolve.current();
    }
  }, []);

  const pauseAnalysis = useCallback(() => {
    isPausedRef.current = true;
    setIsPaused(true);
    console.log("[Analyzer] Paused");
  }, []);

  const resumeAnalysis = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    console.log("[Analyzer] Resumed");
    // Resolve the pause promise to continue the loop
    if (resumeResolve.current) {
      resumeResolve.current();
      resumeResolve.current = null;
    }
  }, []);

  const startAnalysis = useCallback(async (baseUrl: string) => {
    // Use ref to prevent concurrent runs
    if (isAnalyzingRef.current) {
      console.log("Analysis already in progress");
      return;
    }

    console.log("Starting analysis with baseUrl:", baseUrl);

    shouldContinue.current = true;
    isPausedRef.current = false;
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setIsPaused(false);
    setError(null);
    setProgress(0);

    try {
      // Get initial count of unanalyzed tracks
      const total = await trackRepository.getUnanalyzedCount();
      console.log("Total unanalyzed tracks:", total);
      setTotalToAnalyze(total);

      if (total === 0) {
        console.log("No tracks to analyze");
        setError("No unanalyzed tracks found");
        return;
      }

      let processed = 0;

      // Process tracks one by one
      while (shouldContinue.current) {
        const track = await trackRepository.getNextUnanalyzedTrack();
        console.log("Next track:", track);

        if (!track) {
          // No more tracks to analyze
          console.log("No more tracks to analyze");
          break;
        }

        setCurrentTrack(track);

        try {
          // Call the Python sidecar analysis endpoint
          const url = `${baseUrl}/analyze?path=${encodeURIComponent(track.filePath)}`;
          console.log("Fetching:", url);

          const response = await fetch(url, { method: "GET" });
          console.log("Response status:", response.status);

          if (response.ok) {
            const result: AnalysisResult = await response.json();
            console.log("Analysis result:", result);

            if (result.error) {
              // Sidecar returned an error in the response body
              console.error(`Analysis error for ${track.filePath}:`, result.error);
              await trackRepository.markTrackAnalyzed(track.id, null);
            } else {
              await trackRepository.markTrackAnalyzed(track.id, result);
            }
          } else {
            // HTTP error
            console.error(
              `Analysis failed for ${track.filePath}:`,
              response.status,
              response.statusText,
            );
            await trackRepository.markTrackAnalyzed(track.id, null);
          }
        } catch (e) {
          // Network or parsing error
          console.error(`Error analyzing ${track.filePath}:`, e);
          await trackRepository.markTrackAnalyzed(track.id, null);
        }

        processed++;
        setProgress(processed);

        // Add delay between tracks based on CPU priority setting
        if (shouldContinue.current && processed < totalToAnalyze) {
          const priority = await settingsRepository.get("analysis.cpuPriority");
          const delay = priority === "high" ? 0 : priority === "low" ? 3000 : 1000;
          if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        // Wait if paused
        if (isPausedRef.current && shouldContinue.current) {
          await new Promise<void>((resolve) => {
            resumeResolve.current = resolve;
          });
        }
      }

      console.log("Analysis loop completed. Processed:", processed);
    } catch (e) {
      console.error("Analysis error:", e);
      setError(String(e));
    } finally {
      isAnalyzingRef.current = false;
      isPausedRef.current = false;
      setIsAnalyzing(false);
      setIsPaused(false);
      setCurrentTrack(null);
    }
  }, []);

  /**
   * Analyze specific tracks by ID (for pre-gig set analysis)
   */
  const startSetAnalysis = useCallback(async (baseUrl: string, trackIds: number[]) => {
    if (isAnalyzingRef.current) {
      console.log("Analysis already in progress");
      return;
    }

    if (trackIds.length === 0) {
      setError("No tracks to analyze");
      return;
    }

    console.log("Starting set analysis with", trackIds.length, "tracks");

    shouldContinue.current = true;
    isPausedRef.current = false;
    isAnalyzingRef.current = true;
    setIsAnalyzing(true);
    setIsPaused(false);
    setError(null);
    setProgress(0);
    setTotalToAnalyze(trackIds.length);

    try {
      let processed = 0;

      for (const trackId of trackIds) {
        if (!shouldContinue.current) break;

        const track = await trackRepository.getTrackById(trackId);
        if (!track) {
          processed++;
          setProgress(processed);
          continue;
        }

        // Skip already analyzed tracks
        if (track.analyzed) {
          processed++;
          setProgress(processed);
          continue;
        }

        setCurrentTrack(track);

        try {
          const url = `${baseUrl}/analyze?path=${encodeURIComponent(track.filePath)}`;
          const response = await fetch(url, { method: "GET" });

          if (response.ok) {
            const result: AnalysisResult = await response.json();
            if (result.error) {
              console.error(`Analysis error for ${track.filePath}:`, result.error);
              await trackRepository.markTrackAnalyzed(track.id, null);
            } else {
              await trackRepository.markTrackAnalyzed(track.id, result);
            }
          } else {
            console.error(`Analysis failed for ${track.filePath}:`, response.status);
            await trackRepository.markTrackAnalyzed(track.id, null);
          }
        } catch (e) {
          console.error(`Error analyzing ${track.filePath}:`, e);
          await trackRepository.markTrackAnalyzed(track.id, null);
        }

        processed++;
        setProgress(processed);

        // Add delay between tracks based on CPU priority setting
        if (shouldContinue.current && processed < trackIds.length) {
          const priority = await settingsRepository.get("analysis.cpuPriority");
          const delay = priority === "high" ? 0 : priority === "low" ? 3000 : 1000;
          if (delay > 0) {
            await new Promise((r) => setTimeout(r, delay));
          }
        }

        // Wait if paused
        if (isPausedRef.current && shouldContinue.current) {
          await new Promise<void>((resolve) => {
            resumeResolve.current = resolve;
          });
        }
      }

      console.log("Set analysis completed. Processed:", processed);
    } catch (e) {
      console.error("Set analysis error:", e);
      setError(String(e));
    } finally {
      isAnalyzingRef.current = false;
      isPausedRef.current = false;
      setIsAnalyzing(false);
      setIsPaused(false);
      setCurrentTrack(null);
    }
  }, []);

  return {
    isAnalyzing,
    isPaused,
    currentTrack,
    progress,
    totalToAnalyze,
    error,
    startAnalysis,
    startSetAnalysis,
    stopAnalysis,
    pauseAnalysis,
    resumeAnalysis,
  };
}
