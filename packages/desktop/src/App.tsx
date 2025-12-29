import { PIKA_VERSION } from "@pika/shared";
import { useSidecar } from "./hooks/useSidecar";
import { LibraryImporter } from "./components/LibraryImporter";
import { AnalyzerStatus } from "./components/AnalyzerStatus";
import "./App.css";

import { useState, useEffect } from "react";
import { trackRepository } from "./db/repositories/trackRepository";

function App() {
  const { status, baseUrl, healthData, error, restart } = useSidecar();
  const [totalTracks, setTotalTracks] = useState<number>(0);

  // Check if we're in Tauri
  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const refreshTracks = async () => {
    if (!inTauri) return;
    try {
      const count = await trackRepository.getTrackCount();
      setTotalTracks(count);
    } catch (e) {
      console.error("Failed to fetch track count:", e);
    }
  };

  useEffect(() => {
    refreshTracks();
  }, [inTauri]);

  return (
    <main className="container">
      <h1>Pika! Desktop v{PIKA_VERSION}</h1>
      <p className="subtitle">Your intelligent music library companion</p>

      <div className="stats-bar" style={{
        display: 'flex',
        gap: '2rem',
        margin: '1rem 0',
        padding: '1rem',
        background: '#1e293b',
        borderRadius: '8px'
      }}>
        <div className="stat-item">
          <span className="stat-label" style={{ opacity: 0.7, marginRight: '0.5rem' }}>Total Tracks:</span>
          <span className="stat-value" style={{ fontWeight: 'bold' }}>{totalTracks.toLocaleString()}</span>
        </div>
      </div>

      {/* Debug panel - always visible */}
      <div className="debug-panel">
        <div>🔍 Debug: inTauri={String(inTauri)}</div>
        <div>Status: {status}</div>
        <div>Base URL: {baseUrl ?? "null"}</div>
        <div>Health: {healthData ? JSON.stringify(healthData) : "null"}</div>
        <div>Error: {error ?? "null"}</div>
      </div>

      <div className="sidecar-status">
        {status === "starting" && (
          <div className="status-card loading">
            <div className="spinner" />
            <span>Starting analysis engine...</span>
          </div>
        )}

        {status === "ready" && (
          <div className="status-card ready">
            <div className="status-indicator" />
            <div className="status-content">
              <span className="status-label">Analysis Engine</span>
              {healthData ? (
                <>
                  <span className="status-version">{healthData.version}</span>
                  <span className="status-url">{baseUrl}</span>
                </>
              ) : (
                <span className="status-url">Connecting to {baseUrl}...</span>
              )}
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="status-card error">
            <span className="error-message">⚠️ {error}</span>
            <button type="button" onClick={restart} className="retry-button">
              Retry
            </button>
          </div>
        )}

        {status === "idle" && (
          <div className="status-card idle">
            <span>Engine stopped</span>
            <button type="button" onClick={restart} className="retry-button">
              Start
            </button>
          </div>
        )}

        {status === "browser" && (
          <div className="status-card idle">
            <span>
              🌐 Running in browser - open the desktop app for full
              functionality
            </span>
          </div>
        )}
      </div>

      <LibraryImporter onImportComplete={refreshTracks} />

      <AnalyzerStatus baseUrl={baseUrl} onComplete={refreshTracks} />
    </main>
  );
}

export default App;
