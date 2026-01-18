/**
 * StaleDataBanner - Visual indicator when data may be outdated
 *
 * Shows when the connection has been lost for an extended period,
 * warning dancers that the displayed track may not be current.
 *
 * IMPORTANT: Only shows AFTER we've had a successful connection,
 * not on initial page load.
 */

"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface StaleDataBannerProps {
  /**
   * Timestamp of last successful heartbeat (PONG) from server
   */
  lastHeartbeat: number;

  /**
   * Whether the WebSocket is currently connected
   */
  isConnected: boolean;

  /**
   * Threshold in ms after which to show stale warning (default: 30000 = 30s)
   */
  staleThresholdMs?: number;

  /**
   * Whether the session has ended (don't show stale banner for ended sessions)
   */
  sessionEnded?: boolean;

  /**
   * Whether we have received data (track playing)
   */
  hasData?: boolean;
}

export function StaleDataBanner({
  lastHeartbeat,
  isConnected,
  staleThresholdMs = 30000,
  sessionEnded = false,
  hasData = false,
}: StaleDataBannerProps) {
  const [isStale, setIsStale] = useState(false);
  const [staleSeconds, setStaleSeconds] = useState(0);
  const hasEverConnectedRef = useRef(false);

  // Track if we've ever been connected
  useEffect(() => {
    if (isConnected) {
      hasEverConnectedRef.current = true;
    }
  }, [isConnected]);

  useEffect(() => {
    // Don't show if session explicitly ended
    if (sessionEnded) {
      setIsStale(false);
      return;
    }

    // Don't show on initial load - only after we've connected at least once
    if (!hasEverConnectedRef.current && !hasData) {
      setIsStale(false);
      return;
    }

    // Immediately clear stale if heartbeat is fresh
    const elapsed = Date.now() - lastHeartbeat;
    if (elapsed < staleThresholdMs) {
      setIsStale(false);
      setStaleSeconds(Math.floor(elapsed / 1000));
    }

    // Check staleness every second
    const interval = setInterval(() => {
      // Only show stale if we've been connected before
      if (!hasEverConnectedRef.current && !hasData) {
        return;
      }

      const now = Date.now() - lastHeartbeat;
      const stale = now > staleThresholdMs;

      setIsStale(stale);
      setStaleSeconds(Math.floor(now / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [lastHeartbeat, staleThresholdMs, sessionEnded, hasData]);

  // Don't render if not stale
  if (!isStale) {
    return null;
  }

  // Different message based on connection state
  const message = isConnected
    ? "Server not responding - data may be outdated"
    : "Connection lost - waiting to reconnect";

  return (
    <div
      className="fixed top-0 left-0 right-0 z-40 animate-in slide-in-from-top duration-300"
      role="alert"
      aria-live="polite"
    >
      <div className="bg-amber-500/95 backdrop-blur-sm text-black px-4 py-2 flex items-center justify-center gap-3">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider">{message}</span>
        <span className="text-xs opacity-75">({formatDuration(staleSeconds)})</span>
        {!isConnected && <RefreshCw className="w-3 h-3 animate-spin opacity-75" />}
      </div>
    </div>
  );
}

/**
 * Format seconds into human-readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
}
