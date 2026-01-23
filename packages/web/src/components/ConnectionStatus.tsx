"use client";

import { WifiOff } from "lucide-react";
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
    <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
      <div className="bg-slate-900/40 backdrop-blur-2xl border border-amber-500/20 text-amber-500 px-6 py-3 rounded-[2rem] shadow-2xl flex items-center gap-3 text-xs font-black uppercase tracking-widest animate-in fade-in slide-in-from-top-4 duration-500 overflow-hidden relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-amber-500/5" />
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
        <WifiOff className="w-4 h-4 animate-pulse relative z-10" />
        <span className="relative z-10 italic">SIGNAL LOST - TUNING...</span>
      </div>
    </div>
  );
}
