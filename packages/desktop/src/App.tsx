import { PIKA_VERSION } from "@pika/shared";
import { useSidecar } from "./hooks/useSidecar";
import { LibraryImporter } from "./components/LibraryImporter";
import { AnalyzerStatus } from "./components/AnalyzerStatus";
import { LibraryBrowser } from "./components/LibraryBrowser";
import "./App.css";

import { useState, useEffect } from "react";

function App() {
  const { status, baseUrl, healthData, error, restart } = useSidecar();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Check if we're in Tauri
  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const refreshTracks = async () => {
    if (!inTauri) return;
    // Trigger library browser refresh
    setRefreshTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    refreshTracks();
  }, [inTauri]);

  return (
    <main className="container">
      <h1>Pika! Desktop v{PIKA_VERSION}</h1>
      <p className="subtitle">Your intelligent music library companion</p>

      {/* Top toolbar with import/analysis controls */}
      <div
        className="toolbar"
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          margin: "1rem 0",
        }}
      >
        <LibraryImporter onImportComplete={refreshTracks} />
        <AnalyzerStatus baseUrl={baseUrl} onComplete={refreshTracks} />
      </div>

      {/* Status cards - collapsible debug panel */}
      <details
        className="debug-section"
        style={{ marginBottom: "1rem" }}
      >
        <summary
          style={{
            cursor: "pointer",
            opacity: 0.7,
            fontSize: "0.875rem",
            marginBottom: "0.5rem",
          }}
        >
          🔧 Debug Info ({status})
        </summary>
        <div className="debug-panel">
          <div>inTauri={String(inTauri)}</div>
          <div>Status: {status}</div>
          <div>Base URL: {baseUrl ?? "null"}</div>
          <div>Health: {healthData ? JSON.stringify(healthData) : "null"}</div>
          <div>Error: {error ?? "null"}</div>
        </div>
      </details>

      {/* Sidecar status banner */}
      <div className="sidecar-status">
        {status === "starting" && (
          <div className="status-card loading">
            <div className="spinner" />
            <span>Starting analysis engine...</span>
          </div>
        )}

        {status === "ready" && (
          <div className="status-card ready" style={{ padding: "0.5rem 1rem" }}>
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

      {/* Main Library Browser */}
      <LibraryBrowser refreshTrigger={refreshTrigger} />
    </main>
  );
}

export default App;
