"use client";

import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { WifiOff, Cloud } from "lucide-react";
import { useEffect, useState } from "react";

interface OfflineStatusProps {
  pendingCount: number;
  isSaving?: boolean;
}

/**
 * Subtle, non-intrusive offline status indicator
 * Shows when navigator is offline or when there are pending actions in the queue.
 */
export function OfflineStatus({ pendingCount, isSaving }: OfflineStatusProps) {
  const isOnline = useOnlineStatus();
  const [showSyncing, setShowSyncing] = useState(false);

  // Show a brief "Syncing..." state when going back online if there were pending items
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      setShowSyncing(true);
      const timer = setTimeout(() => setShowSyncing(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, pendingCount]);

  if (isOnline && pendingCount === 0 && !showSyncing && !isSaving) return null;

  return (
    <div
      className={`fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full border shadow-2xl backdrop-blur-md animate-in slide-in-from-top duration-500 flex items-center gap-3 ${
        !isOnline
          ? "bg-amber-500/10 border-amber-500/20 text-amber-500"
          : showSyncing
            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
            : isSaving
              ? "bg-purple-500/10 border-purple-500/20 text-purple-400"
              : "bg-slate-900/90 border-slate-800 text-slate-400"
      }`}
    >
      {!isOnline ? (
        <>
          <WifiOff className="w-4 h-4 animate-pulse" />
          <span className="text-[10px] font-black uppercase tracking-widest italic">
            Offline • {pendingCount} Queued
          </span>
        </>
      ) : showSyncing ? (
        <>
          <Cloud className="w-4 h-4 animate-bounce" />
          <span className="text-[10px] font-black uppercase tracking-widest italic">
            Syncing likes...
          </span>
        </>
      ) : isSaving ? (
        <>
          <div className="w-1 h-1 bg-purple-400 rounded-full animate-ping" />
          <span className="text-[10px] font-black uppercase tracking-widest italic">Saving...</span>
        </>
      ) : (
        <>
          <Cloud className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-widest italic">
            Likes Synced
          </span>
        </>
      )}
    </div>
  );
}
