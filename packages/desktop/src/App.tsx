import {
  Calendar,
  History as HistoryIcon,
  LayoutGrid,
  Maximize2,
  Settings as SettingsIcon,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AnalyzerStatus } from "./components/AnalyzerStatus";
import { LibraryBrowser } from "./components/LibraryBrowser";
import { LiveControl } from "./components/LiveControl";
import { OfflineQueueIndicator } from "./components/OfflineQueueIndicator";
import { SetCanvas } from "./components/SetCanvas";
import { EnergyWave } from "./components/EnergyWave";
import { CrateWorkspaceStats } from "./components/CrateWorkspaceStats";
import { useDjSettings } from "./hooks/useDjSettings";
import { useLiveSession } from "./hooks/useLiveSession";
import { useSidecar } from "./hooks/useSidecar";
import { useSettings } from "./hooks/useSettings";
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

function App() {
  const { settings } = useSettings();
  const { status, baseUrl } = useSidecar();
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
  const { djName, djInfo, isAuthenticated } = useDjSettings();

  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isPerformanceMode, setIsPerformanceMode] = useState(false);
  const [viewMode, setViewMode] = useState<"crate" | "stage" | "insights" | "archive">("crate");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Resizer state
  const [splitOffset, setSplitOffset] = useState(65); // Percentage for horizontal split (Library vs Selected)
  const [topHeight, setTopHeight] = useState(300); // Initial height for top row in pixels
  const [topSplitOffset, setTopSplitOffset] = useState(75); // Percentage for top row split (X-Ray vs Stats)

  const [isResizingH, setIsResizingH] = useState(false);
  const [isResizingV, setIsResizingV] = useState(false);
  const [isResizingTopH, setIsResizingTopH] = useState(false);
  const [localIp, setLocalIp] = useState<string | null>(null);

  useEffect(() => {
    getLocalIp().then(setLocalIp);
  }, []);

  const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const refreshTracks = useCallback(() => {
    if (!inTauri) return;
    setRefreshTrigger((prev) => prev + 1);
  }, [inTauri]);

  useEffect(() => {
    refreshTracks();
  }, [refreshTracks]);

  useEffect(() => {
    setSidecarUrl(baseUrl);
  }, [baseUrl]);

  // Handle stage view click (performance mode)
  const handleStageClick = () => {
    if (isLive) {
      setIsPerformanceMode(true);
    } else {
      setViewMode("stage");
    }
  };

  const isAnyResizing = isResizingH || isResizingV || isResizingTopH;

  const themeClass =
    settings["display.profile"] === "midnight"
      ? "theme-midnight"
      : settings["display.profile"] === "stealth"
        ? "theme-stealth"
        : "";

  return (
    <div
      className={`app-shell ${themeClass} ${isAnyResizing ? "select-none cursor-resizing" : ""}`}
    >
      {/* 1. Sidebar Navigation */}
      <nav className="pro-nav">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg mb-4">
            <span className="font-bold text-xl text-white">P!</span>
          </div>

          <button
            type="button"
            className={`pro-nav-item ${viewMode === "crate" ? "active" : ""}`}
            onClick={() => setViewMode("crate")}
            title="Digging & The Crate"
          >
            <LayoutGrid size={24} />
          </button>

          <button
            type="button"
            className={`pro-nav-item ${viewMode === "stage" ? "active" : ""}`}
            onClick={handleStageClick}
            title="The Stage & Performance"
          >
            <Maximize2 size={24} />
          </button>

          <button
            type="button"
            className={`pro-nav-item ${viewMode === "archive" ? "active" : ""}`}
            onClick={() => setViewMode("archive")}
            title="The Lab & Archives"
          >
            <HistoryIcon size={24} />
          </button>

          <button
            type="button"
            className={`pro-nav-item ${viewMode === "insights" ? "active" : ""}`}
            onClick={() => setViewMode("insights")}
            title="Analytics & Intelligence"
          >
            <Calendar size={24} />
          </button>
        </div>

        <div className="mt-auto flex flex-col items-center gap-4">
          <OfflineQueueIndicator />
          <button
            type="button"
            className="pro-nav-item"
            onClick={() => setIsSettingsOpen(true)}
            title="Settings"
          >
            <SettingsIcon size={24} />
          </button>
        </div>
      </nav>

      {/* 2. Unified Header */}
      <header className="pro-header">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-pika-accent leading-none mb-1">
              {viewMode === "crate" && "Digging"}
              {viewMode === "stage" && "Performance"}
              {viewMode === "archive" && "Archives"}
              {viewMode === "insights" && "Intelligence"}
            </span>
            <h1 className="text-xl font-bold tracking-tight text-white leading-none">
              {viewMode === "crate" && "The Crate"}
              {viewMode === "stage" && "The Stage"}
              {viewMode === "archive" && "The Lab"}
              {viewMode === "insights" && "Intelligence"}
            </h1>
          </div>
          <div className="h-8 w-[1px] bg-slate-800/50" />
        </div>

        <div className="flex items-center gap-6">
          <AnalyzerStatus baseUrl={baseUrl} onComplete={refreshTracks} />
          <div className="h-8 w-[1px] bg-slate-800" />
          <LiveControl />

          {isAuthenticated && djInfo && (
            <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
              <div className="text-right">
                <div className="text-sm font-semibold text-slate-200">{djInfo.displayName}</div>
                <div className="text-[10px] text-emerald-500 font-bold uppercase tracking-tighter">
                  Pro DJ
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                {djInfo.displayName[0]}
              </div>
            </div>
          )}
        </div>
      </header>

      {/* 3. Main Content Area */}
      <main className="pro-main">
        {status !== "ready" && status !== "browser" && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[2000] px-4 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full backdrop-blur-md animate-pulse shadow-2xl shadow-amber-500/5 pointer-events-none">
            <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] flex items-center gap-2">
              <span className="w-1 h-1 bg-amber-500 rounded-full animate-ping" />
              Engine Status: {status}
            </span>
          </div>
        )}

        {viewMode === "crate" && (
          <div className="flex flex-col h-full w-full p-4 gap-3 overflow-hidden select-none">
            {/* TOP ROW: X-RAY & STATS */}
            <div className="flex w-full gap-3 shrink-0" style={{ height: `${topHeight}px` }}>
              <div
                className="pro-table-container min-w-0 bg-pika-surface/40 rounded-3xl border border-slate-900 overflow-hidden relative"
                style={{ width: `${topSplitOffset}%` }}
              >
                <div className="absolute top-4 left-4 z-20">
                  <span className="px-2 py-1 bg-pika-accent/10 border border-pika-accent/20 rounded-md text-[9px] font-black text-pika-accent uppercase tracking-widest backdrop-blur-md">
                    Live Set X-Ray
                  </span>
                </div>
                <EnergyWave />
              </div>

              {/* Top Horizontal Resizer */}
              <div
                className={`pro-resizer-h ${isResizingTopH ? "active" : ""}`}
                onMouseDown={(e) => {
                  setIsResizingTopH(true);
                  const startX = e.clientX;
                  const startWidth = topSplitOffset;
                  const handleMouseMove = (mmE: MouseEvent) => {
                    const deltaX = mmE.clientX - startX;
                    const deltaPercent = (deltaX / window.innerWidth) * 100;
                    setTopSplitOffset(Math.min(90, Math.max(50, startWidth + deltaPercent)));
                  };
                  const handleMouseUp = () => {
                    setIsResizingTopH(false);
                    window.removeEventListener("mousemove", handleMouseMove);
                    window.removeEventListener("mouseup", handleMouseUp);
                  };
                  window.addEventListener("mousemove", handleMouseMove);
                  window.addEventListener("mouseup", handleMouseUp);
                }}
              >
                <div className="pro-resizer-grabber" />
              </div>

              <div
                className="min-w-0 bg-pika-surface/40 rounded-3xl border border-slate-900 overflow-hidden"
                style={{ flex: 1 }}
              >
                <CrateWorkspaceStats />
              </div>
            </div>

            {/* Vertical Resizer */}
            <div
              className={`pro-resizer-v ${isResizingV ? "active" : ""}`}
              onMouseDown={(e) => {
                setIsResizingV(true);
                const startY = e.clientY;
                const startHeight = topHeight;
                const handleMouseMove = (mmE: MouseEvent) => {
                  const deltaY = mmE.clientY - startY;
                  setTopHeight(Math.min(600, Math.max(120, startHeight + deltaY)));
                };
                const handleMouseUp = () => {
                  setIsResizingV(false);
                  window.removeEventListener("mousemove", handleMouseMove);
                  window.removeEventListener("mouseup", handleMouseUp);
                };
                window.addEventListener("mousemove", handleMouseMove);
                window.addEventListener("mouseup", handleMouseUp);
              }}
            >
              <div className="pro-resizer-grabber" />
            </div>

            {/* BOTTOM ROW: LIBRARY & TRACK LIST */}
            <div className="flex flex-1 w-full gap-3 min-h-0">
              <div className="min-w-0 h-full" style={{ width: `${splitOffset}%` }}>
                <LibraryBrowser refreshTrigger={refreshTrigger} />
              </div>

              {/* Main Horizontal Resizer */}
              <div
                className={`pro-resizer-h ${isResizingH ? "active" : ""}`}
                onMouseDown={(e) => {
                  setIsResizingH(true);
                  const startX = e.clientX;
                  const startWidth = splitOffset;
                  const handleMouseMove = (mmE: MouseEvent) => {
                    const deltaX = mmE.clientX - startX;
                    const deltaPercent = (deltaX / window.innerWidth) * 100;
                    setSplitOffset(Math.min(85, Math.max(15, startWidth + deltaPercent)));
                  };
                  const handleMouseUp = () => {
                    setIsResizingH(false);
                    window.removeEventListener("mousemove", handleMouseMove);
                    window.removeEventListener("mouseup", handleMouseUp);
                  };
                  window.addEventListener("mousemove", handleMouseMove);
                  window.addEventListener("mouseup", handleMouseUp);
                }}
              >
                <div className="pro-resizer-grabber" />
              </div>

              <div className="flex-1 min-w-0 h-full">
                <SetCanvas />
              </div>
            </div>
          </div>
        )}

        {viewMode === "archive" && (
          <div className="flex flex-col items-center justify-center h-full gap-6 text-slate-500 bg-slate-950/20 rounded-3xl border border-slate-900 mx-4">
            <div className="p-8 bg-pika-accent/5 rounded-full border border-pika-accent/10 shadow-2xl shadow-pika-accent/5">
              <HistoryIcon size={64} strokeWidth={1} className="text-pika-accent animate-pulse" />
            </div>
            <div className="text-center space-y-3 max-w-sm">
              <h2 className="text-2xl font-bold text-white tracking-tight">The Lab</h2>
              <p className="text-sm leading-relaxed text-slate-400">
                This is where you'll polish your **Performance Mixes** and analyze **Set
                Lineage**—comparing your planned energy levels with real-time dancer feedback from
                your session history.
              </p>
              <div className="pt-4">
                <span className="px-3 py-1 bg-slate-900 text-slate-500 text-[10px] font-bold uppercase tracking-widest rounded-full border border-slate-800">
                  Feature In Development
                </span>
              </div>
            </div>
          </div>
        )}

        {viewMode === "stage" && (
          <div className="flex flex-col items-center justify-center h-full gap-8 p-12">
            <div className="max-w-md text-center space-y-4">
              <div className="w-20 h-20 bg-indigo-500/10 rounded-full flex items-center justify-center mx-auto mb-6 text-indigo-500 shadow-[0_0_30px_rgba(99,102,241,0.2)]">
                <Maximize2 size={40} />
              </div>
              <h2 className="text-2xl font-bold text-slate-100">Performance Ready</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Connect your session to enter the heroic Stage Mode. Once live, you can trigger
                reactions, polls, and announcements.
              </p>
              {!isLive ? (
                <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 mt-8 space-y-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Quick Connect
                  </p>
                  <LiveControl />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsPerformanceMode(true)}
                  className="mt-8 px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-105"
                >
                  Enter Stage Mode
                </button>
              )}
            </div>
          </div>
        )}

        {viewMode === "insights" && (
          <div className="h-full w-full p-4">
            <Suspense fallback={<LazyFallback />}>
              <Logbook />
            </Suspense>
          </div>
        )}
      </main>

      {/* Overlays */}
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

      <Suspense fallback={<LazyFallback />}>
        <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      </Suspense>

      <Toaster theme="dark" position="top-right" richColors />
    </div>
  );
}

export default App;
