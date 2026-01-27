/**
 * Live Performance Mode Component
 * Full-screen, high-contrast overlay for gig performance.
 */

import confetti from "canvas-confetti";
import { Megaphone, Snowflake, StickyNote, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getListenerUrl } from "../config";
import type { PlayReaction } from "../db/schema";
import { useActivePlay } from "../hooks/useActivePlay";
import { getStoredSettings } from "../hooks/useDjSettings";
import { subscribeToReactions, type LiveStatus } from "../hooks/useLiveSession";
import { LiveHUD } from "./LiveHUD";
import {
  LiveInteractions,
  type EndedPoll,
  type Announcement,
  PollCountdown,
} from "./LiveInteractions";
import { CrowdControlDrawer } from "./CrowdControlDrawer";

export interface TempoFeedback {
  slower: number;
  perfect: number;
  faster: number;
  total: number;
}

export interface ActivePoll {
  id: number;
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  endsAt?: string; // ISO timestamp for auto-close timer
}

interface Props {
  onExit: () => void;
  listenerCount?: number;
  tempoFeedback?: TempoFeedback | null;
  liveLikes?: number; // Real-time likes from cloud
  activePoll?: ActivePoll | null;
  endedPoll?: EndedPoll | null;
  onStartPoll?: (question: string, options: string[], durationSeconds?: number) => void;
  onEndPoll?: () => void;
  onSendAnnouncement?: (message: string, durationSeconds?: number, push?: boolean) => void;
  onCancelAnnouncement?: () => void;
  onClearEndedPoll?: () => void;
  activeAnnouncement?: Announcement | null;
  sessionId?: string | null;
  djName?: string;

  liveStatus?: LiveStatus;
  onForceSync?: () => void;
  baseUrl?: string | null;
  localIp?: string | null;
}

export function LivePerformanceMode({
  onExit,
  listenerCount = 0,
  liveStatus = "live",
  onForceSync,
  baseUrl = null,
  localIp = null,
  activePoll,
  endedPoll,
  onStartPoll,
  onEndPoll,
  onSendAnnouncement,
  onCancelAnnouncement,
  onClearEndedPoll,
  activeAnnouncement: activeAnnouncementProp,
  sessionId,
  djName,
  tempoFeedback,
  liveLikes = 0,
}: Props) {
  const settings = getStoredSettings();
  const domainText =
    settings.serverEnv === "prod"
      ? "pika.stream"
      : settings.serverEnv === "staging"
        ? "staging.pika.stream"
        : localIp
          ? `${localIp}:3002`
          : "localhost:3002";
  const qrUrl = sessionId ? getListenerUrl(sessionId, djName, localIp) : "";
  const { currentPlay, recentPlays, loading, updateReaction, updateNotes, playCount } =
    useActivePlay(1000); // Poll every 1 second for responsiveness

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState("");

  // Poll creation state
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  // Announcement creation state
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");

  // Crowd Control Drawer state
  const [showCrowdDrawer, setShowCrowdDrawer] = useState(false);

  // Use the prop-driven announcement for the drawer and logic
  const activeAnnouncement = activeAnnouncementProp;

  // Ref to track last shown toast for poll (avoid duplicates)
  const lastToastPollId = useRef<number | null>(null);

  // Toast notification when poll ends
  useEffect(() => {
    if (endedPoll && endedPoll.id !== lastToastPollId.current) {
      lastToastPollId.current = endedPoll.id;
      toast.success(`🏆 Poll ended! "${endedPoll.winner}" won with ${endedPoll.winnerPercent}%`, {
        duration: 5000,
        description: `${endedPoll.totalVotes} total votes on "${endedPoll.question}"`,
      });
    }
  }, [endedPoll]);

  // Confetti state refs
  // raf ref not needed as we just let it run/stop naturally based on time
  const confettiEndTimeRef = useRef(0); // Track when the current rain should stop
  const reactionTimestampsRef = useRef<number[]>([]); // Track reaction times for velocity

  // QR Code Modal
  const [showQrModal, setShowQrModal] = useState(false);

  // Constants for velocity detection
  const REACTION_WINDOW_MS = 3000;
  const CANNON_THRESHOLD = 5;

  // Cannon burst effect (one-shot from bottom)
  const fireCannon = useCallback(() => {
    console.log("🚀 CANNON MODE!");
    const count = 200;
    const defaults = {
      origin: { y: 1 }, // Bottom of screen
      startVelocity: 45,
      spread: 100,
      ticks: 100,
      zIndex: 99999,
    };

    // Left cannon
    confetti({
      ...defaults,
      particleCount: count,
      origin: { x: 0.1, y: 1 },
      angle: 60,
      colors: ["#a78bfa", "#f472b6", "#fbbf24", "#22c55e"],
    });
    // Right cannon
    confetti({
      ...defaults,
      particleCount: count,
      origin: { x: 0.9, y: 1 },
      angle: 120,
      colors: ["#a78bfa", "#f472b6", "#fbbf24", "#22c55e"],
    });
  }, []);

  // Gentle rain effect (continuous from top) - Optimized
  const ensureRainLoop = useCallback((rainDuration: number) => {
    const now = Date.now();

    // If already raining, just extend the time
    if (now < confettiEndTimeRef.current) {
      confettiEndTimeRef.current = now + rainDuration;
      return;
    }

    // Start new rain
    confettiEndTimeRef.current = now + rainDuration;

    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 99999 };
    const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

    const frame = () => {
      // 🛡️ Issue 25 Fix: Visibility check to pause animation
      if (document.hidden) {
        // If hidden, just check if we should stop purely based on time,
        // but don't render. Next visible frame will resume or stop.
        if (Date.now() > confettiEndTimeRef.current) return;
        requestAnimationFrame(frame);
        return;
      }

      const timeLeft = confettiEndTimeRef.current - Date.now();

      if (timeLeft <= 0) {
        return;
      }

      const particleCount = 40 * (timeLeft / rainDuration);

      // Throttling: only fire if particleCount > 0 to avoid wasted calls
      if (particleCount > 0.5) {
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          colors: ["#a78bfa", "#f472b6", "#fbbf24"],
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          colors: ["#a78bfa", "#f472b6", "#fbbf24"],
        });
      }

      requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }, []);

  // S0.2.4 Fix: Clean up is implicit with RAF (checking time)
  // but we can ensure no lingering state if needed.
  useEffect(() => {
    return () => {
      // Reset end time to stop the RAF loop on next frame
      confettiEndTimeRef.current = 0;
    };
  }, []);

  // Reaction Subscription (Confetti with Velocity Tracking)
  useEffect(() => {
    return subscribeToReactions((reaction) => {
      if (reaction === "thank_you") {
        const now = Date.now();
        const rainDuration = 3000;

        // Add timestamp and filter old ones
        reactionTimestampsRef.current.push(now);
        reactionTimestampsRef.current = reactionTimestampsRef.current.filter(
          (t) => t > now - REACTION_WINDOW_MS,
        );

        const velocity = reactionTimestampsRef.current.length;
        console.log(`🎉 Reaction received! Velocity: ${velocity}`);

        if (velocity >= CANNON_THRESHOLD) {
          // High intensity! Fire cannon AND extend rain
          fireCannon();
          ensureRainLoop(rainDuration);
          // Clear timestamps after cannon to require "re-building" heat
          reactionTimestampsRef.current = [];
        } else {
          // Low intensity - just gentle rain
          ensureRainLoop(rainDuration);
        }
      }
    });
    // REACTION_WINDOW_MS and CANNON_THRESHOLD are constants, subscribeToReactions is a stable import
  }, [fireCannon, ensureRainLoop]);

  const handleReaction = useCallback(
    async (reaction: PlayReaction) => {
      await updateReaction(reaction);
    },
    [updateReaction],
  );

  const handleSaveNote = async () => {
    if (noteText.trim()) {
      await updateNotes(noteText);
    }
    setShowNoteModal(false);
  };

  const openNoteModal = useCallback(() => {
    setNoteText(currentPlay?.notes || "");
    setShowNoteModal(true);
  }, [currentPlay?.notes]);

  // Handle exit: clean up announcements before leaving
  const handleExit = useCallback(() => {
    // Cancel any active announcement for dancers
    if (activeAnnouncementProp) {
      onCancelAnnouncement?.();
    }
    // Call the parent's exit handler
    onExit();
  }, [activeAnnouncementProp, onCancelAnnouncement, onExit]);

  // Keyboard shortcuts for quick DJ actions
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in a modal/input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key.toLowerCase()) {
        case "p":
          if (currentPlay) handleReaction("peak");
          break;
        case "b":
          if (currentPlay) handleReaction("brick");
          break;
        case "n":
          if (currentPlay) openNoteModal();
          break;
        case "escape":
          // Close any open modal first, then exit
          if (showNoteModal) {
            setShowNoteModal(false);
          } else if (showPollModal) {
            setShowPollModal(false);
          } else if (showAnnouncementModal) {
            setShowAnnouncementModal(false);
          } else if (showQrModal) {
            setShowQrModal(false);
          } else if (showCrowdDrawer) {
            setShowCrowdDrawer(false);
          } else {
            handleExit();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentPlay,
    handleExit,
    handleReaction,
    openNoteModal,
    showNoteModal,
    showPollModal,
    showAnnouncementModal,
    showQrModal,
    showCrowdDrawer,
  ]);

  return (
    <div className="fixed inset-0 z-[9999] bg-pika-bg flex flex-col text-slate-50 font-pika overflow-hidden perform-mode">
      <LiveHUD
        playCount={playCount}
        listenerCount={listenerCount}
        liveStatus={liveStatus}
        baseUrl={baseUrl ?? null}
        onExit={handleExit}
        onForceSync={onForceSync ?? undefined}
        onShowQr={() => setShowQrModal(true)}
        currentPlay={currentPlay ?? null}
        tempoFeedback={tempoFeedback}
        liveLikes={liveLikes}
        env={settings.serverEnv}
      />

      <main className="flex-1 flex flex-col items-center justify-center p-8 overflow-hidden relative">
        {loading ? (
          <div className="flex flex-col items-center gap-4 animate-pulse">
            <div className="w-16 h-16 rounded-full border-4 border-pika-purple border-t-transparent animate-spin" />
            <p className="text-xl font-black text-slate-700 uppercase tracking-widest">
              Warming Up
            </p>
          </div>
        ) : currentPlay ? (
          <div className="flex flex-col items-center text-center gap-6 max-w-7xl w-full max-h-full min-h-0 py-2">
            {/* Context Badge */}
            <div className="flex items-center gap-4 z-20 shrink-0">
              <div className="bg-pika-purple/10 backdrop-blur-3xl px-6 py-2 rounded-xl border border-pika-purple/30 shadow-2xl">
                <span className="text-pika-purple font-black text-lg tracking-[0.3em]">
                  TRACK {playCount}
                </span>
              </div>

              {/* Small, Subtle Reaction Badge */}
              {currentPlay.reaction && currentPlay.reaction !== "neutral" && (
                <div
                  key={`${currentPlay.reaction}-${playCount}`}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-black uppercase tracking-[0.2em] shadow-2xl animate-haptic ${
                    currentPlay.reaction === "peak"
                      ? "bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                      : "bg-blue-600/20 border-blue-500/50 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.2)]"
                  }`}
                >
                  {currentPlay.reaction === "peak" ? (
                    <Zap size={14} className="fill-amber-400" />
                  ) : (
                    <Snowflake size={14} className="fill-blue-400" />
                  )}
                  {currentPlay.reaction}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-8 relative shrink min-h-0">
              {/* Optimized Glow Effect */}
              <div className="absolute inset-0 bg-pika-purple/10 blur-[100px] rounded-full scale-125 animate-pulse-slow -z-10 pointer-events-none" />

              <h1 className="text-6xl md:text-7xl lg:text-8xl font-[1000] text-white leading-none tracking-tighter drop-shadow-2xl max-w-[90vw] whitespace-normal">
                {currentPlay.title || "Unknown Title"}
              </h1>
              <div className="flex flex-col gap-1">
                <span className="text-slate-600 text-[10px] font-black uppercase tracking-[0.5em] opacity-40">
                  Performed By
                </span>
                <p className="text-4xl md:text-5xl font-bold text-slate-400 tracking-tight whitespace-nowrap overflow-hidden text-ellipsis max-w-[80vw]">
                  {currentPlay.artist || "Unknown Artist"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-16 shrink-0">
              {currentPlay.bpm && (
                <div className="flex flex-col items-center">
                  <span className="text-slate-600 text-[10px] font-black uppercase tracking-[0.5em] mb-2 opacity-50">
                    BPM
                  </span>
                  <span className="text-7xl font-black text-white lining-nums">
                    {Math.round(currentPlay.bpm)}
                  </span>
                </div>
              )}

              <div className="w-px h-16 bg-white/10" />

              {currentPlay.key && (
                <div className="flex flex-col items-center">
                  <span className="text-slate-600 text-[10px] font-black uppercase tracking-[0.5em] mb-2 opacity-50">
                    KEY
                  </span>
                  <span className="text-7xl font-black text-pika-purple drop-shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                    {currentPlay.key}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-16 text-slate-800">
            <div className="relative">
              <div className="absolute inset-x-[-150%] inset-y-[-150%] bg-pika-purple/5 blur-[150px] rounded-full" />
              <div className="relative w-48 h-48 border-[12px] border-slate-900 rounded-full flex items-center justify-center bg-slate-950 shadow-inner">
                <div className="w-2 h-24 bg-pika-purple/40 rounded-full animate-spin-slow" />
              </div>
            </div>
            <div className="flex flex-col gap-6 text-center">
              <p className="text-7xl font-black tracking-tighter text-slate-900/50">
                PIKA OVERDRIVE
              </p>
              <p className="text-3xl text-slate-700/40 font-bold max-w-xl mx-auto leading-relaxed uppercase tracking-widest">
                Waiting for the first track from deck
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 px-8 py-5 bg-slate-950/80 backdrop-blur-2xl rounded-[3rem] border border-white/10 shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-50">
        <div className="flex gap-4 pr-6 border-r border-white/5">
          <button
            type="button"
            onClick={() => handleReaction("peak")}
            className={`flex items-center justify-center gap-5 px-12 py-6 rounded-3xl font-black text-2xl transition-all active:scale-90 hover:scale-[1.02] ${
              currentPlay?.reaction === "peak"
                ? "bg-amber-500 text-white ring-4 ring-amber-500/50 shadow-[0_0_50px_rgba(245,158,11,0.6)]"
                : "bg-white/5 text-amber-200 border border-white/5 hover:bg-white/10 hover:border-amber-500/30"
            }`}
            disabled={!currentPlay}
          >
            <Zap size={36} className={currentPlay?.reaction === "peak" ? "fill-white" : ""} />
            <span className="pt-1">PEAK</span>
          </button>

          <button
            type="button"
            onClick={() => handleReaction("brick")}
            className={`flex items-center justify-center gap-5 px-12 py-6 rounded-3xl font-black text-2xl transition-all active:scale-90 hover:scale-[1.02] ${
              currentPlay?.reaction === "brick"
                ? "bg-blue-600 text-white ring-4 ring-blue-500/50 shadow-[0_0_50px_rgba(37,99,235,0.6)]"
                : "bg-white/5 text-blue-200 border border-white/5 hover:bg-white/10 hover:border-blue-500/30"
            }`}
            disabled={!currentPlay}
          >
            <Snowflake
              size={36}
              className={currentPlay?.reaction === "brick" ? "fill-white" : ""}
            />
            <span className="pt-1">BRICK</span>
          </button>

          <button
            type="button"
            onClick={openNoteModal}
            className={`flex items-center gap-4 px-10 py-5 rounded-3xl font-black text-2xl transition-all active:scale-95 ${
              currentPlay?.notes
                ? "bg-pika-purple text-white ring-4 ring-pika-purple/20 shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                : "bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
            disabled={!currentPlay}
          >
            <StickyNote size={32} />
            <span>NOTE</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => setShowCrowdDrawer(true)}
          className={`relative flex items-center gap-4 px-10 py-5 rounded-3xl font-black text-2xl transition-all active:scale-95 ${
            activePoll || activeAnnouncement
              ? "bg-emerald-600 text-white ring-4 ring-emerald-400/20"
              : "bg-white/5 text-slate-400 hover:bg-white/10"
          }`}
        >
          <Megaphone size={32} />
          <span>CROWD</span>
          {(activePoll || activeAnnouncement) && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full border-4 border-slate-950 animate-pulse" />
          )}
        </button>
      </div>

      {/* Mini Timeline (Recent Plays) - Now Interactive */}
      {recentPlays.length > 1 && (
        <div className="fixed bottom-12 left-10 flex items-center gap-4 px-4 py-3 bg-black/60 backdrop-blur-2xl rounded-full border border-white/10 shadow-2xl z-40 hover:scale-105 transition-all group cursor-default">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-2 group-hover:text-slate-300 transition-colors">
            History
          </span>
          <div className="flex -space-x-2 overflow-hidden px-2">
            {recentPlays.slice(-5).map((play) => (
              <div
                key={play.id}
                className={`w-4 h-4 rounded-full border-2 border-slate-900 ring-2 ring-transparent transition-all hover:scale-125 hover:z-10 cursor-help ${
                  play.reaction === "peak"
                    ? "bg-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]"
                    : play.reaction === "brick"
                      ? "bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]"
                      : "bg-slate-700"
                }`}
                title={`${play.title} - ${play.artist}`}
              />
            ))}
          </div>
        </div>
      )}

      <LiveInteractions
        activePoll={activePoll ?? null}
        endedPoll={endedPoll ?? null}
        activeAnnouncement={activeAnnouncement ?? null}
        showNoteModal={showNoteModal}
        showPollModal={showPollModal}
        showAnnouncementModal={showAnnouncementModal}
        showQrModal={showQrModal}
        onCloseNoteModal={() => setShowNoteModal(false)}
        onClosePollModal={() => setShowPollModal(false)}
        onCloseAnnouncementModal={() => setShowAnnouncementModal(false)}
        onCloseQrModal={() => setShowQrModal(false)}
        noteText={noteText}
        setNoteText={setNoteText}
        onSaveNote={handleSaveNote}
        pollQuestion={pollQuestion}
        setPollQuestion={setPollQuestion}
        pollOptions={pollOptions}
        setPollOptions={setPollOptions}
        onStartPoll={(question, options, duration) => {
          onStartPoll?.(question, options, duration);
          setShowPollModal(false);
          setPollQuestion("");
          setPollOptions(["", ""]);
        }}
        onEndPoll={onEndPoll || (() => {})}
        announcementText={announcementText}
        setAnnouncementText={setAnnouncementText}
        onSendAnnouncement={(message, duration, push) => {
          onSendAnnouncement?.(message, duration, push);
          setShowAnnouncementModal(false);
          setAnnouncementText("");
        }}
        onCancelAnnouncement={onCancelAnnouncement || (() => {})}
        onClearEndedPoll={onClearEndedPoll || (() => {})}
        currentPlay={currentPlay ?? null}
        qrUrl={qrUrl}
        domainText={domainText}
      />

      <CrowdControlDrawer
        show={showCrowdDrawer}
        onClose={() => setShowCrowdDrawer(false)}
        activeAnnouncement={activeAnnouncement ?? null}
        activePoll={activePoll ?? null}
        endedPoll={endedPoll ?? null}
        onNewAnnouncement={() => {
          setShowCrowdDrawer(false);
          setShowAnnouncementModal(true);
        }}
        onCancelAnnouncement={() => {
          onCancelAnnouncement?.();
        }}
        onNewPoll={() => {
          setShowCrowdDrawer(false);
          setShowPollModal(true);
        }}
        onEndPoll={() => onEndPoll?.()}
        onClearEndedPoll={() => onClearEndedPoll?.()}
        renderCountdown={(endsAt) => <PollCountdown endsAt={endsAt} />}
      />
    </div>
  );
}
