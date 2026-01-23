import {
  Battery as BatteryIcon,
  BatteryCharging,
  QrCode,
  RefreshCcw,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { PlayWithTrack } from "../db/repositories/sessionRepository";
import { NetworkHealthIndicator } from "./NetworkHealthIndicator";
import type { LiveStatus } from "../hooks/useLiveSession";

interface BatteryManager extends EventTarget {
  level: number;
  charging: boolean;
  onlevelchange: ((this: BatteryManager, ev: Event) => void) | null;
  onchargingchange: ((this: BatteryManager, ev: Event) => void) | null;
}

declare global {
  interface Navigator {
    getBattery(): Promise<BatteryManager>;
  }
}

interface Props {
  loading?: boolean;
  playCount: number;
  currentPlay?: PlayWithTrack | null;
  listenerCount: number;
  liveStatus: LiveStatus;
  baseUrl: string | null;
  localIp?: string | null;
  onExit: () => void;
  onForceSync?: () => void;
  onShowQr: () => void;
  tempoFeedback?: { slower: number; perfect: number; faster: number; total: number } | null;
  liveLikes?: number;
  env?: string;
}

export function LiveHUD({
  playCount,
  currentPlay,
  listenerCount,
  liveStatus,
  baseUrl,
  onExit,
  onForceSync,
  onShowQr,
  tempoFeedback,
  liveLikes = 0,
  env,
}: Omit<Props, "loading" | "localIp">) {
  const [time, setTime] = useState(new Date());
  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  const [elapsed, setElapsed] = useState<number>(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
      if (currentPlay?.playedAt) {
        setElapsed(Math.max(0, Math.floor(Date.now() / 1000) - currentPlay.playedAt));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [currentPlay?.playedAt]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "getBattery" in navigator) {
      navigator
        .getBattery()
        .then((batt) => {
          const update = () => setBattery({ level: batt.level, charging: batt.charging });
          update();
          batt.onlevelchange = update;
          batt.onchargingchange = update;
        })
        .catch(() => {
          setBattery(null);
        });
    } else {
      setBattery(null);
    }
  }, []);

  const formatElapsed = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };
  return (
    <>
      <div className="fixed top-6 left-6 flex items-center gap-4 h-14 px-5 bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/10 shadow-2xl z-50">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.7)]" />
          <span className="font-black tracking-[0.2em] text-[10px] text-white">LIVE</span>
        </div>
        <div className="w-px h-6 bg-white/10" />
        <span className="text-slate-400 font-extrabold text-[10px] uppercase tracking-[0.2em] leading-none lining-nums">
          {playCount} PLAYED
        </span>
        {onForceSync && (
          <>
            <div className="w-px h-6 bg-white/10" />
            <button
              type="button"
              onClick={onForceSync}
              className="p-2 text-slate-500 hover:text-white transition-colors active:scale-90 group"
              title="Panic Sync"
            >
              <RefreshCcw
                size={16}
                className="group-hover:rotate-180 transition-transform duration-700"
              />
            </button>
          </>
        )}
      </div>

      <div className="fixed top-6 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50 h-14">
        {/* Performance Cluster: Connectivity + Stats */}
        <div className="flex items-center gap-6 px-6 h-full bg-slate-900/60 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-2xl">
          <NetworkHealthIndicator
            status={
              liveStatus === "live"
                ? "connected"
                : liveStatus === "connecting"
                  ? "connecting"
                  : "disconnected"
            }
            pingEndpoint={baseUrl ? `${baseUrl}/health` : undefined}
            env={env}
          />

          {(listenerCount > 0 || liveLikes > 0) && (
            <>
              <div className="w-px h-6 bg-white/10" />
              <div className="flex items-center gap-6">
                {listenerCount > 0 && (
                  <div className="flex items-center gap-3">
                    <Users size={18} className="text-blue-400" />
                    <span className="font-black text-xl text-blue-50 tracking-tighter tabular-nums">
                      {listenerCount}
                    </span>
                  </div>
                )}
                {liveLikes > 0 && (
                  <div className="flex items-center gap-3">
                    <span className="text-2xl animate-pulse">❤️</span>
                    <span className="font-black text-xl text-rose-100 tracking-tighter tabular-nums">
                      {liveLikes}
                    </span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Tempo Feedback Island - Persistent Cluster */}
        <div
          className={`flex items-center gap-5 px-6 h-full bg-slate-900/40 backdrop-blur-3xl rounded-2xl border border-white/5 shadow-2xl transition-opacity ${tempoFeedback?.total ? "opacity-100" : "opacity-30 hover:opacity-100"}`}
        >
          <div className="flex flex-col items-center min-w-[45px] justify-center">
            <span className="text-[8px] font-black text-slate-500 leading-none mb-1.5 tracking-[0.1em]">
              SLOWER
            </span>
            <span
              className={`text-base font-black transition-colors tabular-nums ${tempoFeedback?.slower ? "text-orange-400" : "text-slate-800"}`}
            >
              {tempoFeedback?.slower || 0}
            </span>
          </div>
          <div className="w-px h-6 bg-white/5" />
          <div className="flex flex-col items-center min-w-[45px] justify-center">
            <span className="text-[8px] font-black text-slate-500 leading-none mb-1.5 tracking-[0.1em]">
              PERFECT
            </span>
            <span
              className={`text-base font-black transition-colors tabular-nums ${tempoFeedback?.perfect ? "text-emerald-400" : "text-slate-800"}`}
            >
              {tempoFeedback?.perfect || 0}
            </span>
          </div>
          <div className="w-px h-6 bg-white/5" />
          <div className="flex flex-col items-center min-w-[45px] justify-center">
            <span className="text-[8px] font-black text-slate-500 leading-none mb-1.5 tracking-[0.1em]">
              FASTER
            </span>
            <span
              className={`text-base font-black transition-colors tabular-nums ${tempoFeedback?.faster ? "text-blue-400" : "text-slate-800"}`}
            >
              {tempoFeedback?.faster || 0}
            </span>
          </div>
        </div>

        {/* Track Timer Island */}
        {currentPlay && (
          <div className="flex items-center px-6 h-full bg-slate-900/40 backdrop-blur-3xl rounded-2xl border border-white/5 shadow-2xl overflow-hidden relative group">
            <div className="flex flex-col items-center justify-center z-10 min-w-[60px]">
              <span className="text-[8px] font-[1000] text-slate-500 uppercase tracking-[0.2em] mb-0.5">
                ELAPSED
              </span>
              <span className="text-xl font-black text-white tabular-nums transition-transform group-hover:scale-110">
                {formatElapsed(elapsed)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="fixed top-6 right-6 flex items-center gap-3 z-50 h-14">
        {/* Battery Meter - More Robust */}
        {battery && (
          <div
            className={`flex items-center gap-2 px-4 h-full bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-2xl transition-all ${battery.level < 0.2 && !battery.charging ? "border-red-500/50 animate-battery-low bg-red-500/10" : ""}`}
          >
            {battery.charging ? (
              <BatteryCharging size={16} className="text-emerald-400" />
            ) : battery.level < 0.2 ? (
              <BatteryIcon size={16} className="text-red-500" />
            ) : (
              <BatteryIcon size={16} className="text-slate-400" />
            )}
            <span className="text-xs font-black text-slate-300 tabular-nums">
              {Math.round(battery.level * 100)}%
            </span>
          </div>
        )}

        {/* Real-time Clock */}
        <div className="flex items-center px-5 h-full bg-slate-900/40 backdrop-blur-2xl rounded-2xl border border-white/5 shadow-2xl font-black text-xl tracking-tight text-slate-300 tabular-nums">
          {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>

        <button
          type="button"
          onClick={onShowQr}
          className="flex items-center gap-3 px-6 h-full bg-slate-800/80 hover:bg-slate-700 text-white rounded-2xl font-black transition-all border border-white/10 shadow-2xl active:scale-95 group"
        >
          <QrCode size={18} className="group-hover:rotate-12 transition-transform" />
          <span className="text-sm">QR</span>
        </button>

        <button
          type="button"
          onClick={onExit}
          className="flex items-center justify-center w-14 h-14 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl font-bold transition-all border border-red-500/20 active:scale-95"
          title="Exit Live Mode"
        >
          <X size={20} />
        </button>
      </div>
    </>
  );
}
