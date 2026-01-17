import { PIKA_VERSION } from "@pika/shared";
import { Calendar, LayoutGrid, Maximize2, Settings as SettingsIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AnalyzerStatus } from "./components/AnalyzerStatus";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { LibraryImporter } from "./components/LibraryImporter";
import { LiveControl } from "./components/LiveControl";
import { OfflineQueueIndicator } from "./components/OfflineQueueIndicator";
import { SetCanvas } from "./components/SetCanvas";
import { getStoredSettings, useDjSettings } from "./hooks/useDjSettings";
import { useLiveSession } from "./hooks/useLiveSession";
import { useSidecar } from "./hooks/useSidecar";
import { setSidecarUrl } from "./services/progressiveAnalysisService";
import { getLocalIp } from "./config";
import "./App.css";

// Lazy-loaded components (not needed on initial render)
const LivePerformanceMode = lazy(() =>
  import("./components/LivePerformanceMode").then((m) => ({ default: m.LivePerformanceMode })),
);
const Logbook = lazy(() => import("./components/Logbook").then((m) => ({ default: m.Logbook })));
const Settings = lazy(() => import("./components/Settings").then((m) => ({ default: m.Settings })));

// Loading fallback for lazy components
const LazyFallback = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      color: "#64748b",
      fontSize: "0.875rem",
    }}
  >
    Loading...
  </div>
);

type ViewMode = "builder" | "logbook";

function App() {
  const { status, baseUrl, healthData, error, restart } = useSidecar();
  const {
    isLive,
    status: liveSessionStatus,
    listenerCount,
    tempoFeedback,
    activePoll,
    activeAnnouncement,
    endedPoll,
    liveLikes,
    startPoll,
    endPoll,
    sendAnnouncement,
    cancelAnnouncement,
    clearEndedPoll,
    sessionId,
    forceSync,
  } = useLiveSession();
  const {
    setServerEnv,
    djName,
    djInfo,
    isAuthenticated,
    isValidating,
    validationError,
    setAuthToken,
    clearToken,
  } = useDjSettings();
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("builder");
  const [tokenInput, setTokenInput] = useState(getStoredSettings().authToken || "");
  const [localIp, setLocalIp] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Fetch local IP once on mount
  useEffect(() => {
    getLocalIp().then(setLocalIp);
  }, []);

  // Check if we're in Tauri
  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const refreshTracks = useCallback(() => {
    if (!inTauri) return;
    setRefreshTrigger((prev) => prev + 1);
  }, [inTauri]);

  useEffect(() => {
    refreshTracks();
  }, [refreshTracks]);

  // Set sidecar URL for progressive analysis service
  useEffect(() => {
    setSidecarUrl(baseUrl);
  }, [baseUrl]);

  return (
    <div style={styles.appContainer}>
      {/* Performance Mode Overlay */}
      {isPerformanceMode && (
        <Suspense fallback={<LazyFallback />}>
          <LivePerformanceMode
            onExit={() => setIsPerformanceMode(false)}
            listenerCount={listenerCount}
            tempoFeedback={tempoFeedback}
            activePoll={activePoll}
            activeAnnouncement={activeAnnouncement}
            endedPoll={endedPoll}
            liveLikes={liveLikes}
            onStartPoll={startPoll}
            onEndPoll={endPoll}
            onSendAnnouncement={sendAnnouncement}
            onCancelAnnouncement={cancelAnnouncement}
            onClearEndedPoll={clearEndedPoll}
            sessionId={sessionId}
            djName={djName}
            liveStatus={liveSessionStatus}
            onForceSync={forceSync}
            baseUrl={baseUrl}
            localIp={localIp}
          />
        </Suspense>
      )}

      {/* Toast notifications */}
      <Toaster theme="dark" position="top-right" richColors />

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 className="dashboard-title" style={styles.title}>
            Pika! Desktop
          </h1>
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
          <OfflineQueueIndicator />
          {isLive && (
            <button
              type="button"
              onClick={() => setIsPerformanceMode(true)}
              style={styles.performanceButton}
              title="Enter Performance Mode"
            >
              <Maximize2 size={16} />
              <span>Performance Mode</span>
            </button>
          )}
          <div style={styles.toolbarDivider} />
          <LibraryImporter onImportComplete={refreshTracks} />
          <AnalyzerStatus baseUrl={baseUrl} onComplete={refreshTracks} />
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              padding: "0.5rem",
              background: "transparent",
              border: "1px solid #334155",
              borderRadius: "6px",
              color: "#94a3b8",
              cursor: "pointer",
            }}
            title="Settings"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      {/* Settings Modal */}
      <Suspense fallback={<LazyFallback />}>
        <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </Suspense>

      {/* Status Banner */}
      {status !== "ready" && status !== "browser" && (
        <div style={styles.statusBanner}>
          {status === "starting" && (
            <span style={styles.statusText}>⏳ Starting analysis engine...</span>
          )}
          {status === "error" && (
            <>
              <span style={styles.statusError}>⚠️ {error}</span>
              <button type="button" onClick={restart} style={styles.retryButton}>
                Retry
              </button>
            </>
          )}
          {status === "idle" && (
            <>
              <span style={styles.statusText}>Engine stopped</span>
              <button type="button" onClick={restart} style={styles.retryButton}>
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
          ⚙️ Settings{" "}
          {isAuthenticated && <span style={styles.authBadge}>✓ {djInfo?.displayName}</span>}
        </summary>
        <div style={styles.debugPanel}>
          {/* DJ Account */}
          <div style={styles.settingsSection}>
            <div style={styles.settingsLabel}>
              <span>🎧 DJ Account</span>
              {isAuthenticated ? (
                <span style={styles.tokenStatus}>✅ Verified</span>
              ) : (
                <span style={styles.tokenStatusPending}>⚠️ Not logged in</span>
              )}
            </div>

            {/* Show logged in state or token input */}
            {isAuthenticated && djInfo ? (
              // Logged in - show DJ info
              <div style={styles.loggedInBox}>
                <div style={styles.djInfoRow}>
                  <span style={styles.djInfoLabel}>DJ Name:</span>
                  <span style={styles.djInfoValue}>{djInfo.displayName}</span>
                </div>
                <div style={styles.djInfoRow}>
                  <span style={styles.djInfoLabel}>Email:</span>
                  <span style={styles.djInfoValue}>{djInfo.email}</span>
                </div>
                <div style={styles.djInfoRow}>
                  <span style={styles.djInfoLabel}>Profile:</span>
                  <a
                    href={`https://pika.stream/dj/${djInfo.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.profileLink}
                  >
                    pika.stream/dj/{djInfo.slug}
                  </a>
                </div>
                <button type="button" onClick={clearToken} style={styles.logoutBtn}>
                  Sign Out
                </button>
              </div>
            ) : (
              // Not logged in - show token input
              <>
                <div style={styles.tokenInputRow}>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="pk_dj_your_token_here"
                    style={styles.tokenInput}
                    disabled={isValidating}
                  />
                  <button
                    type="button"
                    onClick={() => setAuthToken(tokenInput)}
                    disabled={isValidating || !tokenInput}
                    style={styles.validateBtn}
                  >
                    {isValidating ? "..." : "Connect"}
                  </button>
                </div>
                {validationError && <p style={styles.errorText}>{validationError}</p>}
                <p style={styles.tokenHint}>
                  Enter your DJ token to authenticate sessions.{" "}
                  <a
                    href="https://pika.stream/dj/register"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.linkText}
                  >
                    Get one here
                  </a>
                </p>
              </>
            )}
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
              <option value="staging">Staging (staging.pika.stream)</option>
              <option value="dev">Development (localhost)</option>
            </select>
          </div>

          {/* Debug Info (collapsed) */}
          <details style={{ marginTop: "1rem" }}>
            <summary style={{ cursor: "pointer", color: "#64748b", fontSize: "0.75rem" }}>
              🔧 Debug Info
            </summary>
            <div style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "0.5rem" }}>
              <div>inTauri={String(inTauri)}</div>
              <div>Status: {status}</div>
              <div>Base URL: {baseUrl ?? "null"}</div>
              <div>Health: {healthData ? JSON.stringify(healthData) : "null"}</div>
              <div>Error: {error ?? "null"}</div>
              <div>Authenticated: {String(isAuthenticated)}</div>
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
            <Suspense fallback={<LazyFallback />}>
              <Logbook />
            </Suspense>
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
    background: "#030711",
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
  authBadge: {
    marginLeft: "0.5rem",
    fontSize: "0.7rem",
    color: "#22c55e",
    fontWeight: 500,
  },
  loggedInBox: {
    background: "rgba(34, 197, 94, 0.1)",
    border: "1px solid rgba(34, 197, 94, 0.3)",
    borderRadius: "8px",
    padding: "0.75rem",
    marginTop: "0.5rem",
  },
  djInfoRow: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "0.35rem",
    fontSize: "0.8rem",
  },
  djInfoLabel: {
    color: "#64748b",
    minWidth: "60px",
  },
  djInfoValue: {
    color: "#e2e8f0",
    fontWeight: 500,
  },
  profileLink: {
    color: "#a78bfa",
    textDecoration: "none",
    fontSize: "0.8rem",
  },
  logoutBtn: {
    marginTop: "0.75rem",
    padding: "0.35rem 0.75rem",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "4px",
    color: "#ef4444",
    fontSize: "0.75rem",
    cursor: "pointer",
  },
  validateBtn: {
    padding: "0.5rem 1rem",
    background: "#22c55e",
    color: "white",
    border: "none",
    borderRadius: "4px",
    fontSize: "0.8rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  errorText: {
    fontSize: "0.7rem",
    color: "#ef4444",
    marginTop: "0.5rem",
    marginBottom: 0,
  },
  linkText: {
    color: "#a78bfa",
    textDecoration: "underline",
  },
};

export default App;
