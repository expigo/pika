import { PIKA_VERSION } from "@pika/shared";
import { useSidecar } from "./hooks/useSidecar";
import { LibraryImporter } from "./components/LibraryImporter";
import { AnalyzerStatus } from "./components/AnalyzerStatus";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { SetCanvas } from "./components/SetCanvas";
import { LiveControl } from "./components/LiveControl";
import { Toaster } from "sonner";
import "./App.css";

import { useState, useEffect } from "react";

function App() {
  const { status, baseUrl, healthData, error, restart } = useSidecar();
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Check if we're in Tauri
  const inTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const refreshTracks = () => {
    if (!inTauri) return;
    setRefreshTrigger((prev) => prev + 1);
  };

  useEffect(() => {
    refreshTracks();
  }, [inTauri]);

  return (
    <div style={styles.appContainer}>
      {/* Toast notifications */}
      <Toaster theme="dark" position="top-right" richColors />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Pika! Desktop</h1>
          <span style={styles.version}>v{PIKA_VERSION}</span>
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <LiveControl />
          <div style={styles.toolbarDivider} />
          <LibraryImporter onImportComplete={refreshTracks} />
          <AnalyzerStatus baseUrl={baseUrl} onComplete={refreshTracks} />
        </div>
      </header>

      {/* Status Banner */}
      {status !== "ready" && status !== "browser" && (
        <div style={styles.statusBanner}>
          {status === "starting" && (
            <span style={styles.statusText}>
              ⏳ Starting analysis engine...
            </span>
          )}
          {status === "error" && (
            <>
              <span style={styles.statusError}>⚠️ {error}</span>
              <button
                type="button"
                onClick={restart}
                style={styles.retryButton}
              >
                Retry
              </button>
            </>
          )}
          {status === "idle" && (
            <>
              <span style={styles.statusText}>Engine stopped</span>
              <button
                type="button"
                onClick={restart}
                style={styles.retryButton}
              >
                Start
              </button>
            </>
          )}
        </div>
      )}

      {status === "browser" && (
        <div style={styles.statusBanner}>
          <span style={styles.statusText}>
            🌐 Running in browser - open the desktop app for full functionality
          </span>
        </div>
      )}

      {/* Debug panel - hidden by default */}
      <details style={styles.debugSection}>
        <summary style={styles.debugSummary}>
          🔧 Debug Info ({status})
        </summary>
        <div style={styles.debugPanel}>
          <div>inTauri={String(inTauri)}</div>
          <div>Status: {status}</div>
          <div>Base URL: {baseUrl ?? "null"}</div>
          <div>Health: {healthData ? JSON.stringify(healthData) : "null"}</div>
          <div>Error: {error ?? "null"}</div>
        </div>
      </details>

      {/* Main Content - Split Layout */}
      <main style={styles.mainContent}>
        {/* Left Panel - Library Browser (60%) */}
        <div style={styles.leftPanel}>
          <LibraryBrowser refreshTrigger={refreshTrigger} />
        </div>

        {/* Right Panel - Set Canvas (40%) */}
        <div style={styles.rightPanel}>
          <SetCanvas />
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
    background: "#0c0f14",
    color: "#e2e8f0",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "0.75rem 1rem",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    flexShrink: 0,
  },
  headerLeft: {
    display: "flex",
    alignItems: "baseline",
    gap: "0.5rem",
  },
  title: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: "bold",
  },
  version: {
    fontSize: "0.75rem",
    opacity: 0.6,
  },
  toolbar: {
    display: "flex",
    gap: "0.75rem",
    alignItems: "center",
  },
  toolbarDivider: {
    width: "1px",
    height: "24px",
    background: "#334155",
  },
  statusBanner: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "1rem",
    padding: "0.5rem 1rem",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    fontSize: "0.875rem",
    flexShrink: 0,
  },
  statusText: {
    opacity: 0.8,
  },
  statusError: {
    color: "#f87171",
  },
  retryButton: {
    padding: "0.25rem 0.75rem",
    background: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.75rem",
  },
  debugSection: {
    padding: "0.25rem 1rem",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    fontSize: "0.75rem",
    flexShrink: 0,
  },
  debugSummary: {
    cursor: "pointer",
    opacity: 0.6,
  },
  debugPanel: {
    padding: "0.5rem 0",
    opacity: 0.7,
  },
  mainContent: {
    flex: 1,
    display: "flex",
    gap: "1rem",
    padding: "1rem",
    overflow: "hidden",
    minHeight: 0,
  },
  leftPanel: {
    flex: "0 0 60%",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  rightPanel: {
    flex: "0 0 calc(40% - 1rem)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
};

export default App;
