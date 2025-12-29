import { useAnalyzer } from "../hooks/useAnalyzer";

interface Props {
    baseUrl: string | null;
    onComplete?: () => void;
}

export function AnalyzerStatus({ baseUrl, onComplete }: Props) {
    const {
        isAnalyzing,
        currentTrack,
        progress,
        totalToAnalyze,
        error,
        startAnalysis,
        stopAnalysis,
    } = useAnalyzer();

    const handleStart = async () => {
        if (!baseUrl) {
            console.error("No base URL available for analysis");
            return;
        }
        await startAnalysis(baseUrl);
        onComplete?.();
    };

    const progressPercent =
        totalToAnalyze > 0 ? Math.round((progress / totalToAnalyze) * 100) : 0;

    const getTrackDisplay = () => {
        if (!currentTrack) return "";
        const artist = currentTrack.artist || "Unknown Artist";
        const title = currentTrack.title || currentTrack.filePath.split("/").pop();
        return `${artist} - ${title}`;
    };

    return (
        <div
            className="analyzer-status"
            style={{
                marginTop: "2rem",
                padding: "1rem",
                background: "#1e293b",
                borderRadius: "8px",
            }}
        >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem" }}>
                🎵 Audio Analysis
            </h3>

            {isAnalyzing ? (
                <>
                    {/* Progress bar */}
                    <div
                        style={{
                            background: "#334155",
                            borderRadius: "4px",
                            height: "8px",
                            overflow: "hidden",
                            marginBottom: "0.5rem",
                        }}
                    >
                        <div
                            style={{
                                background: "#22c55e",
                                height: "100%",
                                width: `${progressPercent}%`,
                                transition: "width 0.3s ease",
                            }}
                        />
                    </div>

                    {/* Progress text */}
                    <div style={{ fontSize: "0.875rem", opacity: 0.8 }}>
                        Processing: {progress} / {totalToAnalyze} ({progressPercent}%)
                    </div>

                    {/* Current track */}
                    {currentTrack && (
                        <div
                            style={{
                                fontSize: "0.75rem",
                                opacity: 0.6,
                                marginTop: "0.5rem",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                            }}
                        >
                            {getTrackDisplay()}
                        </div>
                    )}

                    {/* Stop button */}
                    <button
                        type="button"
                        onClick={stopAnalysis}
                        style={{
                            marginTop: "1rem",
                            padding: "0.5rem 1rem",
                            background: "#ef4444",
                            color: "white",
                            border: "none",
                            borderRadius: "6px",
                            cursor: "pointer",
                        }}
                    >
                        Stop Analysis
                    </button>
                </>
            ) : (
                <>
                    {/* Start button */}
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                            type="button"
                            onClick={handleStart}
                            disabled={!baseUrl}
                            style={{
                                padding: "0.5rem 1rem",
                                background: baseUrl ? "#22c55e" : "#4b5563",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: baseUrl ? "pointer" : "not-allowed",
                                opacity: baseUrl ? 1 : 0.5,
                            }}
                        >
                            Start Analysis
                        </button>

                        {/* Re-analyze All button */}
                        <button
                            type="button"
                            onClick={async () => {
                                if (!baseUrl) return;
                                const { trackRepository } = await import("../db/repositories/trackRepository");
                                await trackRepository.resetAnalysis();
                                await startAnalysis(baseUrl);
                                onComplete?.();
                            }}
                            disabled={!baseUrl}
                            style={{
                                padding: "0.5rem 1rem",
                                background: baseUrl ? "#f59e0b" : "#4b5563",
                                color: "white",
                                border: "none",
                                borderRadius: "6px",
                                cursor: baseUrl ? "pointer" : "not-allowed",
                                opacity: baseUrl ? 1 : 0.5,
                                fontSize: "0.875rem",
                            }}
                            title="Reset and re-analyze all tracks (updates fingerprint metrics)"
                        >
                            Re-analyze All
                        </button>
                    </div>

                    {!baseUrl && (
                        <div
                            style={{
                                fontSize: "0.75rem",
                                opacity: 0.6,
                                marginTop: "0.5rem",
                            }}
                        >
                            Waiting for analysis engine...
                        </div>
                    )}
                </>
            )}

            {error && (
                <div
                    style={{
                        marginTop: "0.5rem",
                        color: "#ef4444",
                        fontSize: "0.875rem",
                    }}
                >
                    ❌ {error}
                </div>
            )}
        </div>
    );
}
