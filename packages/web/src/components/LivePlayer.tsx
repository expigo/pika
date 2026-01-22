"use client";

import { Activity, Check, Clock, Heart, Music2, Radio, Share2, Users, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type HistoryTrack, useLiveListener } from "@/hooks/useLiveListener";
import { ConnectionStatusIndicator } from "./ConnectionStatus";
import { SocialSignalsLayer } from "./SocialSignalsLayer";
import { StaleDataBanner } from "./StaleDataBanner";
import { ProCard } from "./ui/ProCard";

// Dynamic import for QR code (only loaded when sharing)
const QRCodeSVG = dynamic(() => import("qrcode.react").then((m) => m.QRCodeSVG), {
  ssr: false,
  loading: () => <div className="w-[220px] h-[220px] bg-slate-800 rounded-xl animate-pulse" />,
});

// Format relative time (e.g., "2m ago")
function formatRelativeTime(dateString?: string): string {
  if (!dateString) return "";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();

  if (Number.isNaN(diffMs)) return "";

  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "NOW";
  if (diffMins < 60) return `${diffMins}M`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}H`;

  return `${Math.floor(diffHours / 24)}D`;
}

// Poll countdown timer component
function PollCountdown({ endsAt }: { endsAt?: string | null }) {
  const [timeLeft, setTimeLeft] = useState<number>(0);

  useEffect(() => {
    if (!endsAt) return;
    const endTime = new Date(endsAt).getTime();
    if (Number.isNaN(endTime)) return;

    const updateCountdown = () => {
      const remaining = Math.max(0, endTime - Date.now());
      setTimeLeft(remaining);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [endsAt]);

  if (!endsAt || timeLeft <= 0) {
    return null;
  }

  const seconds = Math.floor(timeLeft / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const timeStr =
    minutes > 0 ? `${minutes}:${remainingSeconds.toString().padStart(2, "0")}` : `${seconds}s`;

  return <span className="text-purple-400 font-black tabular-nums font-mono">⏱️ {timeStr}</span>;
}

// History list component
function HistoryList({ tracks }: { tracks: HistoryTrack[] }) {
  if (tracks.length === 0) return null;

  return (
    <div className="border-t border-slate-800/50">
      <div className="px-8 py-6 flex items-center gap-3">
        <Clock className="w-4 h-4 text-slate-600" />
        <span className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em]">
          Pulse Stream
        </span>
      </div>
      <ul className="divide-y divide-slate-800/30">
        {tracks.map((track, index) => (
          <li
            key={`${track.artist}-${track.title}-${index}`}
            className="flex items-center justify-between px-8 py-5 hover:bg-slate-900/50 transition-colors group"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-300 font-bold truncate group-hover:text-white transition-colors uppercase italic">
                  {track.title}
                </p>
                {track.bpm && (
                  <span className="flex-shrink-0 px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-[9px] font-black text-purple-400 uppercase">
                    {Math.round(track.bpm)}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest mt-1">
                {track.artist}
              </p>
            </div>
            <span className="text-[9px] text-slate-700 font-black ml-4 flex-shrink-0 uppercase tracking-tighter">
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
    history,
    listenerCount,
    sendLike,
    hasLiked,
    sendTempoRequest,
    tempoVote,
    activePoll,
    hasVotedOnPoll,
    voteOnPoll,
    sendReaction,
    announcement,
    dismissAnnouncement,
    onLikeReceived,
    sessionEnded,
    lastHeartbeat,
  } = useLiveListener(targetSessionId);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [votingOption, setVotingOption] = useState<number | null>(null);
  const [thanksText, setThanksText] = useState("SEND THANKS 🦄");
  const [signalLost, setSignalLost] = useState(false);

  // Monitor heartbeat for signal loss - reset immediately when heartbeat updates
  useEffect(() => {
    if (!lastHeartbeat) return;

    // Immediately check on heartbeat change (resets signal lost)
    const timeSinceLastHeartbeat = Date.now() - lastHeartbeat;
    if (timeSinceLastHeartbeat < 30000) {
      setSignalLost(false);
    }

    // Also check periodically
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastHeartbeat;
      setSignalLost(elapsed > 30000);
    }, 5000);

    return () => clearInterval(interval);
  }, [lastHeartbeat]);

  const isConnected = status === "connected";
  // The DJ is "Live" if connected AND (we have a track OR a DJ name) AND signal is not lost
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
        setShowQR(true);
      }
    } else {
      setShowQR(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
      </div>

      <ConnectionStatusIndicator status={status} />

      {/* Social Signals Overlay (Canvas) */}
      <SocialSignalsLayer onLikeReceived={onLikeReceived} />

      {/* Stale Data Warning Banner (shows when disconnected for extended period) */}
      <StaleDataBanner
        lastHeartbeat={lastHeartbeat}
        isConnected={isConnected}
        sessionEnded={sessionEnded}
        staleThresholdMs={30000}
        hasData={hasTrack}
      />

      {/* Announcement Banner */}
      {announcement && (
        <div className="fixed top-0 left-0 right-0 z-50 animate-in slide-in-from-top duration-500">
          <div className="bg-gradient-to-r from-amber-600 via-orange-600 to-amber-600 px-6 py-4 shadow-2xl">
            <div className="max-w-md mx-auto flex items-start gap-4">
              <span className="text-2xl flex-shrink-0">📢</span>
              <div className="flex-1 min-w-0">
                <p className="text-white font-black text-xs uppercase tracking-tight leading-snug italic">
                  {announcement.message}
                </p>
                <div className="flex items-center gap-3 mt-2">
                  <p className="text-amber-200/50 text-[9px] font-black uppercase tracking-[0.2em]">
                    {announcement.djName && <span>BY {announcement.djName}</span>}
                  </p>
                  <span className="text-amber-200/30 text-[9px] font-black uppercase">
                    {formatRelativeTime(announcement.timestamp)}
                  </span>
                </div>
              </div>
              <button
                onClick={dismissAnnouncement}
                className="flex-shrink-0 p-1 text-white/50 hover:text-white transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div className="w-full max-w-md relative z-10">
        <ProCard glow className={`overflow-hidden ${announcement ? "mt-24" : ""}`}>
          {/* Header */}
          <div className="px-8 py-6 border-b border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Radio
                  className={`w-6 h-6 ${signalLost ? "text-amber-500" : isLive ? "text-red-500" : "text-slate-700"}`}
                />
                {isLive && !signalLost && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-lg shadow-red-500/50" />
                )}
                {signalLost && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse shadow-lg shadow-amber-500/50" />
                )}
              </div>
              <div>
                <h1 className="text-xl font-black text-white italic tracking-tighter uppercase leading-none">
                  Pika! <span className={signalLost ? "text-amber-500" : "text-red-500"}>Live</span>
                </h1>
                <p
                  className={`text-[9px] font-black uppercase tracking-widest mt-1 ${signalLost ? "text-amber-500 animate-pulse" : "text-slate-600"}`}
                >
                  {isConnected
                    ? signalLost
                      ? "SIGNAL WEAK - WAITING FOR DJ"
                      : "CONNECTED FLOOR"
                    : "SEARCHING FOR VIBE"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Show dancer count when we have data, even if temporarily reconnecting */}
              {(isConnected || hasTrack) && listenerCount > 0 && (
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 border rounded-xl transition-colors duration-500 ${
                    listenerCount >= 50
                      ? "bg-red-500/10 border-red-500/20"
                      : listenerCount >= 10
                        ? "bg-purple-500/10 border-purple-500/20"
                        : "bg-emerald-500/10 border-emerald-500/20"
                  }`}
                >
                  <Users
                    className={`w-3.5 h-3.5 ${
                      listenerCount >= 50
                        ? "text-red-500"
                        : listenerCount >= 10
                          ? "text-purple-500"
                          : "text-emerald-500"
                    }`}
                  />
                  <span
                    key={listenerCount}
                    className={`text-[11px] font-black tabular-nums animate-in fade-in zoom-in duration-300 ${
                      listenerCount >= 50
                        ? "text-red-500"
                        : listenerCount >= 10
                          ? "text-purple-500"
                          : "text-emerald-500"
                    }`}
                  >
                    {listenerCount}
                  </span>
                </div>
              )}
              {isLive && (
                <button
                  onClick={handleShare}
                  aria-label="Share session"
                  className="w-10 h-10 flex items-center justify-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500 hover:text-white transition-all shadow-xl"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="px-8 py-16 flex flex-col items-center justify-center min-h-[400px]">
            {hasTrack ? (
              <div className="w-full flex flex-col items-center">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-[2rem] flex items-center justify-center mb-8 shadow-2xl shadow-purple-500/20 animate-pulse">
                  <Music2 className="w-8 h-8 text-white" />
                </div>

                <h2 className="text-3xl font-black text-white text-center leading-none italic uppercase tracking-tighter mb-3">
                  {currentTrack.title}
                </h2>
                <p className="text-lg text-slate-500 font-bold text-center uppercase tracking-widest mb-6">
                  {currentTrack.artist}
                </p>

                {currentTrack.bpm && (
                  <div className="mb-10">
                    <span className="px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-full text-[10px] font-black text-purple-400 uppercase tracking-[0.2em]">
                      {Math.round(currentTrack.bpm)} BPM
                    </span>
                  </div>
                )}

                {/* Main Action: Pulse (Like) */}
                <div className="relative mb-12">
                  <button
                    onClick={handleLike}
                    disabled={isLiked}
                    aria-label={isLiked ? "Track already liked" : "Like this track"}
                    className={`w-28 h-28 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isLiked
                        ? "bg-red-500/20 border-2 border-red-500/50 scale-100 shadow-none"
                        : likeAnimating
                          ? "bg-red-500 border-none scale-125 shadow-2xl shadow-red-500/50"
                          : "bg-slate-900 border-2 border-slate-800 hover:border-red-500/50 hover:bg-red-500/5 hover:scale-110 active:scale-95 shadow-2xl shadow-black/50 group"
                    }`}
                  >
                    <Heart
                      className={`w-12 h-12 transition-all duration-500 ${
                        isLiked || likeAnimating
                          ? "text-red-500 fill-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.5)]"
                          : "text-slate-700 group-hover:text-red-500/50"
                      }`}
                    />
                  </button>
                  {isLiked && (
                    <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black text-red-500 uppercase tracking-[0.3em]">
                      SYNCED
                    </div>
                  )}
                </div>

                {/* Secondary Actions: Tempo */}
                <div className="flex items-center gap-3 w-full max-w-[320px] mb-12 select-none">
                  {[
                    {
                      id: "slower" as const,
                      label: "SLOWER",
                      icon: "🐢",
                      activeClass:
                        "bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-blue-500/10",
                    },
                    {
                      id: "perfect" as const,
                      label: "PERFECT",
                      icon: "👌",
                      activeClass:
                        "bg-emerald-500/20 border-emerald-500/50 text-emerald-400 shadow-emerald-500/10",
                    },
                    {
                      id: "faster" as const,
                      label: "FASTER",
                      icon: "🐇",
                      activeClass:
                        "bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-orange-500/10",
                    },
                  ].map((btn) => {
                    const isActive = tempoVote === btn.id;
                    return (
                      <button
                        key={btn.id}
                        onClick={() => sendTempoRequest(btn.id)}
                        aria-label={`Vote for tempo: ${btn.label}`}
                        aria-pressed={isActive}
                        className={`flex-1 py-3 rounded-2xl flex flex-col items-center justify-center transition-all border font-black text-[9px] uppercase tracking-widest gap-1 active:scale-90 ${
                          isActive
                            ? `${btn.activeClass} shadow-lg`
                            : "bg-slate-900 border-slate-800 text-slate-600"
                        }`}
                      >
                        <span className="text-sm">{btn.icon}</span>
                        {btn.label}
                        {isActive && <Check className="w-2 h-2 mt-1" />}
                      </button>
                    );
                  })}
                </div>

                {/* Reaction: Thanks */}
                <button
                  onClick={() => {
                    sendReaction("thank_you");
                    setThanksText("THANKS RECEIVED! 🦄");
                    setTimeout(() => setThanksText("SEND THANKS 🦄"), 2000);
                  }}
                  className="w-full max-w-[280px] py-4 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/20 rounded-2xl text-purple-400 text-[10px] font-black uppercase tracking-[0.3em] transition-all active:scale-[0.98] shadow-lg shadow-black/20 select-none"
                >
                  {thanksText}
                </button>
              </div>
            ) : sessionEnded ? (
              <div className="text-center animate-in fade-in duration-500">
                <div className="w-20 h-20 bg-slate-900 border-2 border-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
                  <Heart className="w-10 h-10 text-slate-700" />
                </div>
                <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">
                  Session Ended
                </h2>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-8">
                  Thanks for dancing!
                </p>
                {isTargetedSession && (
                  <div>
                    <Link
                      href={`/recap/${targetSessionId}`}
                      className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-purple-500/20 hover:scale-105 active:scale-95"
                    >
                      View Full Recap
                    </Link>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center">
                <div className="w-20 h-20 bg-slate-900 border-2 border-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse shadow-2xl">
                  <Radio className="w-10 h-10 text-slate-700" />
                </div>
                <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">
                  Searching...
                </h2>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">
                  {djName ? `WAITING FOR ${djName.toUpperCase()}` : "NO ACTIVE BROADCASTER"}
                </p>
                {isTargetedSession && !djName && (
                  <div className="mt-12">
                    <Link
                      href={`/recap/${targetSessionId}`}
                      className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 hover:text-white transition-colors border-b border-slate-800 hover:border-white pb-0.5"
                    >
                      View Recap Archive
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Active Poll Overlay within Content Area */}
            {activePoll && (
              <div className="w-full mt-12 bg-slate-900/90 border border-purple-500/30 rounded-3xl p-8 shadow-[0_0_40px_rgba(168,85,247,0.15)] relative overflow-hidden group">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 opacity-50" />

                <div className="flex items-center gap-3 mb-6">
                  <Activity className="w-4 h-4 text-purple-400 animate-pulse" />
                  <span className="text-[10px] font-black text-purple-400 uppercase tracking-[0.25em] drop-shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                    Live Governance
                  </span>
                </div>

                <h3 className="text-xl font-black text-white italic uppercase tracking-tight mb-8">
                  "{activePoll.question}"
                </h3>

                {hasVotedOnPoll ? (
                  <div className="space-y-6">
                    {activePoll.options.map((option, idx) => {
                      const votes = activePoll.votes[idx] ?? 0;
                      const total = activePoll.totalVotes || 1;
                      const percent = Math.round((votes / total) * 100);
                      const isWinner = votes === Math.max(...activePoll.votes) && votes > 0;
                      return (
                        <div key={idx} className="relative">
                          <div className="flex justify-between text-[11px] font-black uppercase tracking-widest mb-3">
                            <span
                              className={
                                isWinner
                                  ? "text-emerald-400"
                                  : activePoll.userChoice === idx
                                    ? "text-white"
                                    : "text-slate-500"
                              }
                            >
                              {isWinner && "🏆 "}
                              {option}
                              {activePoll.userChoice === idx && (
                                <span className="ml-2 bg-purple-500/10 text-purple-400 text-[8px] border border-purple-500/20 rounded px-1.5 py-0.5 align-middle">
                                  YOUR VOTE
                                </span>
                              )}
                            </span>
                            <span className="text-slate-500">{percent}%</span>
                          </div>
                          <div className="h-2 bg-black rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${isWinner ? "bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" : "bg-purple-600"}`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {activePoll.options.map((option, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setVotingOption(idx);
                          voteOnPoll(idx);
                          setTimeout(() => setVotingOption(null), 500);
                        }}
                        disabled={votingOption !== null}
                        className={`w-full py-5 px-6 rounded-2xl font-black text-[11px] border text-left transition-all uppercase tracking-widest ${
                          votingOption === idx
                            ? "bg-purple-600 border-purple-500 text-white scale-[0.98]"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:border-purple-500/50 hover:text-white"
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                )}

                {/* Shared Poll Footer: Timer */}
                {activePoll.endsAt && (
                  <div className="pt-8 text-center border-t border-slate-800/30 mt-8 animate-in fade-in slide-in-from-bottom-2 duration-700">
                    <PollCountdown endsAt={activePoll.endsAt} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* History List */}
          <HistoryList tracks={history} />

          {/* Footer */}
          <div className="px-8 py-5 border-t border-slate-800/50 flex items-center justify-between">
            <Link
              href="/my-likes"
              className="text-[10px] font-black text-red-500/70 hover:text-red-500 transition-colors flex items-center gap-2 uppercase tracking-widest"
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              Pulse Archive
            </Link>
            <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
              POWERED BY PIKA! <span className="text-slate-800">PRO</span>
            </p>
          </div>
        </ProCard>
      </div>

      {/* QR Code Share Modal */}
      {showQR && (
        <div
          className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[100] p-6"
          onClick={() => setShowQR(false)}
        >
          <div
            className="bg-slate-900/90 backdrop-blur-xl rounded-[2.5rem] border border-slate-800 p-10 max-w-sm w-full relative shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowQR(false)}
              className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="text-center mb-10">
              <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">
                Share the Vibe
              </h3>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Broadcast Invitation
              </p>
            </div>

            <div className="flex justify-center mb-10">
              <div className="bg-white p-6 rounded-[2rem] shadow-2xl">
                <QRCodeSVG value={shareUrl} size={220} level="M" />
              </div>
            </div>

            <button
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl);
                setThanksText("LINK COPIED! 🔗");
                setTimeout(() => setThanksText("SEND THANKS 🦄"), 2000);
              }}
              className="w-full py-5 bg-white text-slate-950 rounded-2xl font-black uppercase text-xs tracking-[0.2em] shadow-lg shadow-white/10 hover:shadow-white/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Copy Invitation Link
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
