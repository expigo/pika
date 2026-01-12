"use client";

import { AlertCircle, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConnectionStatus } from "../hooks/useLiveListener";

interface Props {
  status: ConnectionStatus;
}

export function ConnectionStatusIndicator({ status }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status === "connecting" || status === "disconnected") {
      // Show immediately on disconnect, or maybe small delay?
      // Let's show immediately for clarity
      setVisible(true);
    } else {
      // Hide after a brief moment to show "Connected" success?
      // For now just hide immediately
      setVisible(false);
    }
  }, [status]);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center p-2 pointer-events-none">
      <div className="bg-amber-500/90 backdrop-blur text-white px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-sm font-bold animate-in fade-in slide-in-from-top-4 duration-300">
        <WifiOff className="w-4 h-4 animate-pulse" />
        <span>Reconnecting...</span>
      </div>
    </div>
  );
}
