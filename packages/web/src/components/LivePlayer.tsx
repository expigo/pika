"use client";

import {
  ArrowRight,
  Check,
  Clock,
  Heart,
  Music2,
  Radio,
  Share2,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { type HistoryTrack, useLiveListener } from "@/hooks/useLiveListener";

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

// Poll countdown timer component
function PollCountdown({ endsAt }: { endsAt: string }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    const endTime = new Date(endsAt).getTime();

    const updateCountdown = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (timeLeft <= 0) {
    return <span className="text-amber-400">⏰ Closing...</span>;
  }

  const seconds = Math.floor(timeLeft / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const timeStr =
    minutes > 0 ? `${minutes}:${remainingSeconds.toString().padStart(2, "0")}` : `${seconds}s`;

  return <span className="text-purple-400 font-mono">⏱️ {timeStr}</span>;
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
              <div className="flex items-center gap-2">
                <p className="text-sm text-slate-300 truncate">{track.title}</p>
                {track.bpm && (
                  <span className="flex-shrink-0 px-1.5 py-0.5 bg-purple-500/20 rounded text-xs text-purple-400">
                    {Math.round(track.bpm)}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 truncate">{track.artist}</p>
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

interface LivePlayerProps {
  targetSessionId?: string;
}

export function LivePlayer({ targetSessionId }: LivePlayerProps) {
  const {
    status,
    currentTrack,
    djName,
    // sessionId, // Unused

    history,
    listenerCount,
    sendLike,
    hasLiked,
    sendTempoRequest,
    tempoVote,
    activePoll,
    hasVotedOnPoll,
    voteOnPoll,
  } = useLiveListener(targetSessionId);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [votingOption, setVotingOption] = useState<number | null>(null);

  const isConnected = status === "connected";
  const hasTrack = currentTrack !== null;
  const isLive = isConnected && (hasTrack || djName);
  const isTargetedSession = !!targetSessionId;

  // Get current page URL for sharing
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  // Check if current track has been liked
  const isLiked = currentTrack ? hasLiked(currentTrack) : false;

  const handleLike = () => {
    if (!currentTrack || isLiked) return;

    const sent = sendLike(currentTrack);
    if (sent) {
      setLikeAnimating(true);
      setTimeout(() => setLikeAnimating(false), 1000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Pika! Live - ${djName || "DJ"}`,
          text: currentTrack
            ? `Now playing: ${currentTrack.artist} - ${currentTrack.title}`
            : `Join the live session with ${djName}!`,
          url: shareUrl,
        });
      } catch (_e) {
        // User cancelled or error, show QR as fallback
        setShowQR(true);
      }
    } else {
      // No native share, show QR code
      setShowQR(true);
    }
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
          <div className="flex items-center gap-3">
            {/* Share button - only when live */}
            {isLive && (
              <button
                onClick={handleShare}
                className="p-2 bg-slate-700/50 hover:bg-slate-600/50 rounded-lg transition-colors"
                title="Share this session"
              >
                <Share2 className="w-4 h-4 text-slate-300" />
              </button>
            )}
            {/* Listener count */}
            {isConnected && listenerCount > 0 && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/15 rounded-lg border border-emerald-500/30">
                <Users className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400 font-medium">{listenerCount}</span>
              </div>
            )}
            {/* Connection status */}
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-400" />
                <span className="text-xs text-green-400 font-medium">Live</span>
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
              <p className="text-lg text-slate-400 text-center">{currentTrack.artist}</p>
              {/* BPM Badge */}
              {currentTrack.bpm && (
                <div className="flex items-center gap-2 mt-3">
                  <span className="px-3 py-1 bg-purple-500/20 border border-purple-500/30 rounded-full text-sm font-medium text-purple-300">
                    {Math.round(currentTrack.bpm)} BPM
                  </span>
                </div>
              )}
              {djName && (
                <p className="text-sm text-slate-500 mt-4">
                  Live with <span className="text-red-400 font-medium">{djName}</span>
                </p>
              )}

              {/* Like Button */}
              <button
                onClick={handleLike}
                disabled={isLiked}
                className={`mt-6 p-4 rounded-full transition-all duration-300 ${
                  isLiked
                    ? "bg-red-500/30 cursor-default"
                    : likeAnimating
                      ? "bg-red-500 scale-125"
                      : "bg-slate-700/50 hover:bg-red-500/20 hover:scale-110 active:scale-95"
                }`}
              >
                <Heart
                  className={`w-8 h-8 transition-all duration-300 ${
                    isLiked || likeAnimating ? "text-red-400 fill-red-400" : "text-red-400"
                  }`}
                />
              </button>
              <p className="text-xs text-slate-500 mt-2">{isLiked ? "Liked! ❤️" : "Tap to like"}</p>

              {/* Tempo Preference Buttons */}
              <div className="mt-6 flex items-center gap-2">
                <button
                  onClick={() => sendTempoRequest("slower")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    tempoVote === "slower"
                      ? "bg-blue-500/30 text-blue-400 border border-blue-500/50"
                      : "bg-slate-700/50 text-slate-400 hover:bg-blue-500/20 hover:text-blue-300"
                  }`}
                >
                  {tempoVote === "slower" && <Check className="w-3 h-3" />}🐢 Slower
                </button>
                <button
                  onClick={() => sendTempoRequest("perfect")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    tempoVote === "perfect"
                      ? "bg-green-500/30 text-green-400 border border-green-500/50"
                      : "bg-slate-700/50 text-slate-400 hover:bg-green-500/20 hover:text-green-300"
                  }`}
                >
                  {tempoVote === "perfect" && <Check className="w-3 h-3" />}👌 Perfect
                </button>
                <button
                  onClick={() => sendTempoRequest("faster")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                    tempoVote === "faster"
                      ? "bg-orange-500/30 text-orange-400 border border-orange-500/50"
                      : "bg-slate-700/50 text-slate-400 hover:bg-orange-500/20 hover:text-orange-300"
                  }`}
                >
                  {tempoVote === "faster" && <Check className="w-3 h-3" />}🐇 Faster
                </button>
              </div>

              {/* Active Poll */}
              {activePoll && (
                <div className="mt-6 w-full max-w-md bg-gradient-to-br from-indigo-900/50 to-purple-900/50 rounded-2xl p-4 border border-indigo-500/30">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-lg">📊</span>
                    <span className="text-sm font-bold text-indigo-300 uppercase tracking-wide">
                      Live Poll
                    </span>
                  </div>
                  <p className="text-lg font-semibold text-white mb-4">{activePoll.question}</p>

                  {hasVotedOnPoll ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center gap-2 text-emerald-400 mb-4">
                        <Check className="w-4 h-4" />
                        <span className="text-sm font-medium">Voted! Watching results...</span>
                        <span className="text-slate-400 text-sm">
                          ({activePoll.totalVotes} votes)
                        </span>
                      </div>
                      {activePoll.options.map((option, idx) => {
                        const votes = activePoll.votes[idx] ?? 0;
                        const percentage =
                          activePoll.totalVotes > 0
                            ? Math.round((votes / activePoll.totalVotes) * 100)
                            : 0;
                        const isWinning = votes === Math.max(...activePoll.votes) && votes > 0;
                        return (
                          <div key={idx} className="relative">
                            <div className="flex justify-between text-sm mb-1">
                              <span
                                className={`font-medium ${isWinning ? "text-emerald-300" : "text-slate-300"}`}
                              >
                                {isWinning && "🏆 "}
                                {option}
                              </span>
                              <span className="text-slate-400">{percentage}%</span>
                            </div>
                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${isWinning ? "bg-emerald-500" : "bg-indigo-500"}`}
                                style={{ width: `${percentage}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {activePoll.options.map((option, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            setVotingOption(idx);
                            voteOnPoll(idx);
                            setTimeout(() => setVotingOption(null), 500);
                          }}
                          disabled={votingOption !== null}
                          className={`w-full py-3 px-4 rounded-xl font-medium text-left transition-all duration-200 ${
                            votingOption === idx
                              ? "bg-indigo-500 text-white scale-[0.98]"
                              : "bg-slate-800/80 text-slate-200 hover:bg-indigo-600/50 hover:text-white hover:scale-[1.02]"
                          }`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}

                  {activePoll.endsAt && (
                    <p className="text-sm mt-3 text-center">
                      <PollCountdown endsAt={activePoll.endsAt} />
                    </p>
                  )}
                </div>
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
          ) : isTargetedSession ? (
            // Session Ended - Show Recap
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                <Check className="w-8 h-8 text-green-400" />
              </div>
              <p className="text-xl font-bold text-white text-center">Session Ended</p>
              <p className="text-sm text-slate-500 mt-2 mb-6 text-center max-w-xs">
                Catch up on what you missed in the recap!
              </p>

              <Link
                href={`/recap/${targetSessionId}`}
                className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-semibold transition-colors shadow-lg shadow-purple-900/20"
              >
                View Recap
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mb-4">
                <Radio className="w-8 h-8 text-slate-500" />
              </div>
              <p className="text-lg text-slate-400 text-center animate-pulse">Waiting for DJ...</p>
              <p className="text-sm text-slate-500 mt-2">No live session active</p>
            </>
          )}
        </div>

        {/* History List */}
        <HistoryList tracks={history} />

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700/50 flex items-center justify-between">
          <a
            href="/my-likes"
            className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1"
          >
            <Heart className="w-3 h-3 fill-current" />
            My Likes
          </a>
          <p className="text-xs text-slate-500">
            Powered by <span className="font-semibold text-slate-400">Pika!</span>
          </p>
        </div>
      </div>

      {/* QR Code Share Modal */}
      {showQR && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-slate-800 rounded-3xl border border-slate-700 p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Share Session</h3>
              <button
                onClick={() => setShowQR(false)}
                className="p-1 text-slate-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex justify-center mb-4">
              <div className="bg-white p-4 rounded-2xl">
                <QRCodeSVG value={shareUrl} size={200} level="M" />
              </div>
            </div>

            <p className="text-center text-slate-400 text-sm mb-4">Scan to join the party! 🎧</p>

            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                // Could add toast notification here
              }}
              className="w-full py-3 bg-gradient-to-r from-red-500 to-pink-500 rounded-xl text-white font-semibold hover:opacity-90 transition-opacity"
            >
              Copy Link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
