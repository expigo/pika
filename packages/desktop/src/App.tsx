import { PIKA_VERSION } from "@pika/shared";
import { useSidecar } from "./hooks/useSidecar";
import { LibraryImporter } from "./components/LibraryImporter";
import "./App.css";

function App() {
  const { status, baseUrl, healthData, error, restart } = useSidecar();

  // Check if we're in Tauri
  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  return (
    <main className="container">
      <h1>Pika! Desktop v{PIKA_VERSION}</h1>
      <p className="subtitle">Your intelligent music library companion</p>

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

      <LibraryImporter />
    </main>
  );
}

export default App;
