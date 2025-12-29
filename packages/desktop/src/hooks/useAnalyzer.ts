import { useState, useCallback, useRef } from "react";
import { fetch } from "@tauri-apps/plugin-http";
import {
    trackRepository,
    type Track,
    type AnalysisResult,
} from "../db/repositories/trackRepository";

export interface UseAnalyzerState {
    isAnalyzing: boolean;
    currentTrack: Track | null;
    progress: number;
    totalToAnalyze: number;
    error: string | null;
}

export interface UseAnalyzerReturn extends UseAnalyzerState {
    startAnalysis: (baseUrl: string) => Promise<void>;
    stopAnalysis: () => void;
}

export function useAnalyzer(): UseAnalyzerReturn {
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
    const [progress, setProgress] = useState(0);
    const [totalToAnalyze, setTotalToAnalyze] = useState(0);
    const [error, setError] = useState<string | null>(null);

    // Use refs to track state across async operations
    const shouldContinue = useRef(true);
    const isAnalyzingRef = useRef(false);

    const stopAnalysis = useCallback(() => {
        shouldContinue.current = false;
    }, []);

    const startAnalysis = useCallback(async (baseUrl: string) => {
        // Use ref to prevent concurrent runs
        if (isAnalyzingRef.current) {
            console.log("Analysis already in progress");
            return;
        }

        console.log("Starting analysis with baseUrl:", baseUrl);

        shouldContinue.current = true;
        isAnalyzingRef.current = true;
        setIsAnalyzing(true);
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
                            response.statusText
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
            }

            console.log("Analysis loop completed. Processed:", processed);
        } catch (e) {
            console.error("Analysis error:", e);
            setError(String(e));
        } finally {
            isAnalyzingRef.current = false;
            setIsAnalyzing(false);
            setCurrentTrack(null);
        }
    }, []);

    return {
        isAnalyzing,
        currentTrack,
        progress,
        totalToAnalyze,
        error,
        startAnalysis,
        stopAnalysis,
    };
}
