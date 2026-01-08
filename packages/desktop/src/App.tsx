import { PIKA_VERSION } from "@pika/shared";
import { useSidecar } from "./hooks/useSidecar";
import { useLiveSession } from "./hooks/useLiveSession";
import { LibraryImporter } from "./components/LibraryImporter";
import { AnalyzerStatus } from "./components/AnalyzerStatus";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { SetCanvas } from "./components/SetCanvas";
import { LiveControl } from "./components/LiveControl";
import { LivePerformanceMode } from "./components/LivePerformanceMode";
import { Logbook } from "./components/Logbook";
import { Toaster } from "sonner";
import { Maximize2, LayoutGrid, Calendar } from "lucide-react";
import { useDjSettings, getStoredSettings } from "./hooks/useDjSettings";
import "./App.css";

import { useState, useEffect } from "react";

type ViewMode = "builder" | "logbook";

function App() {
  const { status, baseUrl, healthData, error, restart } = useSidecar();
  const { isLive, listenerCount, tempoFeedback, activePoll, startPoll, endPoll, sessionId } = useLiveSession();
  const { setServerEnv, djName } = useDjSettings(); // Hook must be top-level
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("builder");

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
      {/* Performance Mode Overlay */}
      {isPerformanceMode && (
        <LivePerformanceMode
          onExit={() => setIsPerformanceMode(false)}
          listenerCount={listenerCount}
          tempoFeedback={tempoFeedback}
          activePoll={activePoll}
          onStartPoll={startPoll}
          onEndPoll={endPoll}
          sessionId={sessionId}
          djName={djName}
        />
      )}

      {/* Toast notifications */}
      <Toaster theme="dark" position="top-right" richColors />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>Pika! Desktop</h1>
          <span style={styles.version}>v{PIKA_VERSION}</span>

          {/* View Toggle */}
          <div style={styles.viewTabs}>
            <button
              type="button"
              onClick={() => setViewMode("builder")}
              style={{
                ...styles.viewTab,
                ...(viewMode === "builder" ? styles.viewTabActive : {}),
              }}
            >
              <LayoutGrid size={14} />
              Set Builder
            </button>
            <button
              type="button"
              onClick={() => setViewMode("logbook")}
              style={{
                ...styles.viewTab,
                ...(viewMode === "logbook" ? styles.viewTabActive : {}),
              }}
            >
              <Calendar size={14} />
              Logbook
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={styles.toolbar}>
          <LiveControl />
          {isLive && (
            <button
              type="button"
              onClick={() => setIsPerformanceMode(true)}
              style={styles.performanceButton}
              title="Enter Performance Mode"
            >
              <Maximize2 size={16} />
              <span>Perform</span>
            </button>
          )}
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

      {/* Settings panel - hidden by default */}
      <details style={styles.debugSection}>
        <summary style={styles.debugSummary}>
          ⚙️ Settings
        </summary>
        <div style={styles.debugPanel}>
          {/* Auth Token */}
          <div style={styles.settingsSection}>
            <div style={styles.settingsLabel}>
              <span>🔑 DJ Auth Token</span>
              {getStoredSettings().authToken ? (
                <span style={styles.tokenStatus}>✅ Connected</span>
              ) : (
                <span style={styles.tokenStatusPending}>⚠️ Not set</span>
              )}
            </div>
            <div style={styles.tokenInputRow}>
              <input
                type="password"
                defaultValue={getStoredSettings().authToken}
                placeholder="pk_dj_your_token_here"
                style={styles.tokenInput}
                onChange={(e) => {
                  // Debounced save will happen on blur
                  e.currentTarget.dataset.pendingValue = e.target.value;
                }}
                onBlur={(e) => {
                  const value = e.currentTarget.dataset.pendingValue || e.target.value;
                  if (value !== getStoredSettings().authToken) {
                    // Save the token - we'll need to add setAuthToken to the hook usage
                    localStorage.setItem('pika_dj_settings', JSON.stringify({
                      ...getStoredSettings(),
                      authToken: value
                    }));
                    // Show feedback
                    if (value) {
                      alert('Token saved! It will be used for your next session.');
                    }
                  }
                }}
              />
              <a
                href="https://pika.stream/dj/register"
                target="_blank"
                rel="noopener noreferrer"
                style={styles.tokenLink}
              >
                Get Token
              </a>
            </div>
            <p style={styles.tokenHint}>
              Enter your DJ token to authenticate your sessions. Get one at pika.stream
            </p>
          </div>

          {/* Environment */}
          <div style={styles.settingsSection}>
            <div style={styles.settingsLabel}>🌐 Environment</div>
            <select
              defaultValue={getStoredSettings().serverEnv}
              onChange={(e) => {
                const env = e.target.value as "dev" | "prod";
                setServerEnv(env);
              }}
              style={styles.envSelect}
            >
              <option value="prod">Production (pika.stream)</option>
              <option value="dev">Development (localhost)</option>
            </select>
          </div>

          {/* Debug Info (collapsed) */}
          <details style={{ marginTop: '1rem' }}>
            <summary style={{ cursor: 'pointer', color: '#64748b', fontSize: '0.75rem' }}>
              🔧 Debug Info
            </summary>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
              <div>inTauri={String(inTauri)}</div>
              <div>Status: {status}</div>
              <div>Base URL: {baseUrl ?? "null"}</div>
              <div>Health: {healthData ? JSON.stringify(healthData) : "null"}</div>
              <div>Error: {error ?? "null"}</div>
            </div>
          </details>
        </div>
      </details>

      {/* Main Content */}
      <main style={styles.mainContent}>
        {viewMode === "builder" ? (
          <>
            {/* Left Panel - Library Browser (60%) */}
            <div style={styles.leftPanel}>
              <LibraryBrowser refreshTrigger={refreshTrigger} />
            </div>

            {/* Right Panel - Set Canvas (40%) */}
            <div style={styles.rightPanel}>
              <SetCanvas />
            </div>
          </>
        ) : (
          /* Logbook View */
          <div style={styles.fullPanel}>
            <Logbook />
          </div>
        )}
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
    alignItems: "center",
    gap: "0.75rem",
  },
  title: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: "bold",
  },
  version: {
    fontSize: "0.75rem",
    opacity: 0.6,
    marginRight: "0.5rem",
  },
  viewTabs: {
    display: "flex",
    gap: "0.25rem",
    marginLeft: "0.5rem",
    padding: "0.25rem",
    background: "#0f172a",
    borderRadius: "8px",
  },
  viewTab: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.5rem 0.75rem",
    background: "transparent",
    color: "#64748b",
    border: "none",
    borderRadius: "6px",
    fontSize: "0.8125rem",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  viewTabActive: {
    background: "#334155",
    color: "#e2e8f0",
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
  performanceButton: {
    display: "flex",
    alignItems: "center",
    gap: "0.375rem",
    padding: "0.5rem 0.75rem",
    background: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: "6px",
    fontSize: "0.875rem",
    fontWeight: "bold",
    cursor: "pointer",
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
  fullPanel: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    overflow: "hidden",
  },
  debugRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    marginBottom: "0.5rem",
  },
  envSelect: {
    background: "#334155",
    color: "#e2e8f0",
    border: "1px solid #475569",
    borderRadius: "4px",
    padding: "0.25rem 0.5rem",
    fontSize: "0.8rem",
    width: "100%",
  },
  settingsSection: {
    marginBottom: "1rem",
  },
  settingsLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    fontSize: "0.8rem",
    fontWeight: 600,
    marginBottom: "0.5rem",
    color: "#e2e8f0",
  },
  tokenInputRow: {
    display: "flex",
    gap: "0.5rem",
  },
  tokenInput: {
    flex: 1,
    background: "#334155",
    color: "#e2e8f0",
    border: "1px solid #475569",
    borderRadius: "4px",
    padding: "0.5rem",
    fontSize: "0.8rem",
    fontFamily: "monospace",
  },
  tokenLink: {
    display: "flex",
    alignItems: "center",
    padding: "0.5rem 0.75rem",
    background: "#3b82f6",
    color: "white",
    borderRadius: "4px",
    fontSize: "0.75rem",
    fontWeight: 600,
    textDecoration: "none",
    whiteSpace: "nowrap",
  },
  tokenHint: {
    fontSize: "0.7rem",
    color: "#64748b",
    marginTop: "0.5rem",
    marginBottom: 0,
  },
  tokenStatus: {
    fontSize: "0.7rem",
    color: "#22c55e",
  },
  tokenStatusPending: {
    fontSize: "0.7rem",
    color: "#f59e0b",
  },
};

export default App;
