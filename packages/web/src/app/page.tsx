"use client";

import { useLiveListener } from "@/hooks/useLiveListener";
import { Radio, Music2, Wifi, WifiOff } from "lucide-react";

export default function Home() {
  const { status, currentTrack, djName } = useLiveListener();

  const isConnected = status === "connected";
  const hasTrack = currentTrack !== null;
  const isLive = isConnected && (hasTrack || djName);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Main Card */}
      <div className="w-full max-w-md bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Radio className="w-6 h-6 text-red-500" />
              {isLive && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              )}
            </div>
            <h1 className="text-xl font-bold text-white">
              Pika! <span className="text-red-500">Live</span>
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-xs text-green-400 font-medium">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-slate-500" />
                <span className="text-xs text-slate-500 font-medium">
                  {status === "connecting" ? "Connecting..." : "Offline"}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-12 min-h-[200px] flex flex-col items-center justify-center">
          {hasTrack ? (
            <>
              <Music2 className="w-12 h-12 text-green-400 mb-4 animate-pulse" />
              <p className="text-2xl font-bold text-white text-center mb-2 leading-tight">
                {currentTrack.title}
              </p>
              <p className="text-lg text-slate-400 text-center">
                {currentTrack.artist}
              </p>
              {djName && (
                <p className="text-sm text-slate-500 mt-4">
                  Live with <span className="text-red-400 font-medium">{djName}</span>
                </p>
              )}
            </>
          ) : djName ? (
            <>
              <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                <Music2 className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-lg text-slate-400 text-center animate-pulse">
                Waiting for track...
              </p>
              <p className="text-sm text-slate-500 mt-2">
                <span className="text-red-400 font-medium">{djName}</span> is live
              </p>
            </>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                <Radio className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-lg text-slate-400 text-center animate-pulse">
                Waiting for DJ...
              </p>
              <p className="text-sm text-slate-500 mt-2">
                No live session active
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700/50 flex items-center justify-center">
          <p className="text-xs text-slate-500">
            Powered by <span className="font-semibold text-slate-400">Pika!</span>
          </p>
        </div>
      </div>
    </div>
  );
}
