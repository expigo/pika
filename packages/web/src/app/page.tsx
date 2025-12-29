"use client";

import { useState } from "react";
import { useLiveListener, type HistoryTrack } from "@/hooks/useLiveListener";
import { Radio, Music2, Wifi, WifiOff, Heart, Clock } from "lucide-react";

// Format relative time (e.g., "2m ago")
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return `${Math.floor(diffHours / 24)}d ago`;
}

// History list component
function HistoryList({ tracks }: { tracks: HistoryTrack[] }) {
  if (tracks.length === 0) return null;

  return (
    <div className="px-6 py-4 border-t border-slate-700/50">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-slate-500" />
        <span className="text-xs text-slate-500 font-medium uppercase tracking-wide">
          Recently Played
        </span>
      </div>
      <ul className="space-y-2">
        {tracks.map((track, index) => (
          <li
            key={`${track.artist}-${track.title}-${index}`}
            className="flex items-center justify-between opacity-70 hover:opacity-100 transition-opacity"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-300 truncate">
                {track.title}
              </p>
              <p className="text-xs text-slate-500 truncate">
                {track.artist}
              </p>
            </div>
            <span className="text-xs text-slate-600 ml-2 flex-shrink-0">
              {formatRelativeTime(track.playedAt)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  const { status, currentTrack, djName, history, sendLike } = useLiveListener();
  const [liked, setLiked] = useState(false);
  const [cooldown, setCooldown] = useState(false);

  const isConnected = status === "connected";
  const hasTrack = currentTrack !== null;
  const isLive = isConnected && (hasTrack || djName);

  const handleLike = () => {
    if (!currentTrack || cooldown) return;

    sendLike(currentTrack);
    setLiked(true);
    setCooldown(true);

    setTimeout(() => setLiked(false), 1000);
    setTimeout(() => setCooldown(false), 2000);
  };

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

              {/* Like Button */}
              <button
                onClick={handleLike}
                disabled={cooldown}
                className={`mt-6 p-4 rounded-full transition-all duration-300 ${liked
                  ? "bg-red-500 scale-125"
                  : cooldown
                    ? "bg-slate-700/50 cursor-not-allowed"
                    : "bg-slate-700/50 hover:bg-red-500/20 hover:scale-110 active:scale-95"
                  }`}
              >
                <Heart
                  className={`w-8 h-8 transition-all duration-300 ${liked
                    ? "text-white fill-white"
                    : "text-red-400"
                    }`}
                />
              </button>
              <p className="text-xs text-slate-500 mt-2">
                {liked ? "Liked! ❤️" : "Tap to like"}
              </p>
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

        {/* History List */}
        <HistoryList tracks={history} />

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
