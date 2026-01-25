/**
 * OfflineQueueIndicator Component
 * Shows pending updates count when connection is lost during a live session.
 */

import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { offlineQueueRepository } from "../db/repositories/offlineQueueRepository";
import { useLiveStore } from "../hooks/useLiveSession";

export function OfflineQueueIndicator() {
  const [pendingCount, setPendingCount] = useState(0);
  const status = useLiveStore((state) => state.status);

  // Poll for pending count when connecting/offline
  useEffect(() => {
    if (status === "offline") {
      setPendingCount(0);
      return;
    }

    const fetchCount = async () => {
      // 🛡️ Issue 24 Fix: Pause secondary UI polling when app is backgrounded
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;

      try {
        const count = await offlineQueueRepository.count();
        setPendingCount(count);
      } catch (e) {
        console.error("Failed to get queue count:", e);
      }
    };

    fetchCount();

    // Poll every 5 seconds when not fully connected
    if (status === "connecting" || status === "error") {
      const interval = setInterval(fetchCount, 5000);
      return () => clearInterval(interval);
    }

    // When live, check less frequently (every 10s)
    if (status === "live") {
      const interval = setInterval(fetchCount, 10000);
      return () => clearInterval(interval);
    }
  }, [status]);

  // Don't show anything if offline and no pending items
  if (status === "offline" || (status === "live" && pendingCount === 0)) {
    return null;
  }

  // Show syncing state when pending
  if (pendingCount > 0) {
    return (
      <div style={styles.container} title={`${pendingCount} updates pending sync`}>
        <RefreshCw size={14} style={styles.spinningIcon} />
        <span style={styles.count}>{pendingCount}</span>
      </div>
    );
  }

  // Show connection status
  if (status === "connecting") {
    return (
      <div style={styles.container} title="Reconnecting...">
        <CloudOff size={14} style={styles.warningIcon} />
      </div>
    );
  }

  // Connected and synced
  return (
    <div style={styles.containerSynced} title="Connected">
      <Cloud size={14} style={styles.successIcon} />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 8px",
    background: "rgba(251, 191, 36, 0.15)",
    border: "1px solid rgba(251, 191, 36, 0.4)",
    borderRadius: "6px",
    fontSize: "0.75rem",
    fontWeight: 600,
    color: "#fbbf24",
  },
  containerSynced: {
    display: "flex",
    alignItems: "center",
    padding: "4px 8px",
    background: "rgba(34, 197, 94, 0.1)",
    borderRadius: "6px",
  },
  count: {
    fontFamily: "monospace",
  },
  spinningIcon: {
    animation: "spin 1s linear infinite",
  },
  warningIcon: {
    color: "#fbbf24",
  },
  successIcon: {
    color: "#22c55e",
  },
};

// Inject CSS animation for spinning
if (typeof document !== "undefined") {
  const styleId = "offline-queue-indicator-styles";
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement("style");
    styleSheet.id = styleId;
    styleSheet.textContent = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(styleSheet);
  }
}
