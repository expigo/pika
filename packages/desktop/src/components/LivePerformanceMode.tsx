/**
 * Live Performance Mode Component
 * Full-screen, high-contrast overlay for gig performance.
 */

import confetti from "canvas-confetti";
import { Clock, Flame, Megaphone, Square, StickyNote } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getListenerUrl } from "../config";
import type { PlayReaction } from "../db/schema";
import { useActivePlay } from "../hooks/useActivePlay";
import { getStoredSettings } from "../hooks/useDjSettings";
import { subscribeToReactions, type LiveStatus } from "../hooks/useLiveSession";
import { LiveHUD } from "./LiveHUD";
import { LiveInteractions, type EndedPoll } from "./LiveInteractions";
import { CrowdControlDrawer } from "./CrowdControlDrawer";

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
    return <span style={{ color: "#fbbf24" }}>⏰ Closing...</span>;
  }

  const seconds = Math.floor(timeLeft / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  const timeStr =
    minutes > 0 ? `${minutes}:${remainingSeconds.toString().padStart(2, "0")}` : `${seconds}s`;

  return (
    <span
      style={{
        color: "#a78bfa",
        fontFamily: "monospace",
        display: "flex",
        alignItems: "center",
        gap: "4px",
      }}
    >
      <Clock size={14} />
      {timeStr}
    </span>
  );
}

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
  endedPoll?: {
    id: number;
    question: string;
    options: string[];
    votes: number[];
    totalVotes: number;
    winner: string;
    winnerPercent: number;
  } | null;
  onStartPoll?: (question: string, options: string[], durationSeconds?: number) => void;
  onEndPoll?: () => void;
  onSendAnnouncement?: (message: string, durationSeconds?: number) => void;
  onCancelAnnouncement?: () => void;
  onClearEndedPoll?: () => void;
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
  tempoFeedback,
  liveLikes = 0,
  activePoll,
  endedPoll,
  onStartPoll,
  onEndPoll,
  onSendAnnouncement,
  onCancelAnnouncement,
  onClearEndedPoll,
  sessionId,
  djName,
  liveStatus = "live",
  onForceSync,
  baseUrl = null,
  localIp = null,
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

  // Announcement state
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false);
  const [announcementText, setAnnouncementText] = useState("");

  // Crowd Control Drawer state
  const [showCrowdDrawer, setShowCrowdDrawer] = useState(false);
  const [activeAnnouncement, setActiveAnnouncement] = useState<{
    message: string;
    endsAt?: string;
  } | null>(null);

  // Auto-dismiss announcement when timer expires (Desktop drawer)
  useEffect(() => {
    if (!activeAnnouncement?.endsAt) return;

    const endTime = new Date(activeAnnouncement.endsAt).getTime();
    const delay = endTime - Date.now();

    // Already expired - dismiss immediately
    if (delay <= 0) {
      setActiveAnnouncement(null);
      return;
    }

    // Set timeout to dismiss when timer expires
    const timeout = setTimeout(() => {
      setActiveAnnouncement(null);
    }, delay);

    return () => clearTimeout(timeout);
  }, [activeAnnouncement?.endsAt]);

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
  const confettiIntervalRef = useRef(null as unknown as ReturnType<typeof setInterval> | null);
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

  // Gentle rain effect (continuous from top)
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

    // Clear any existing interval just in case
    if (confettiIntervalRef.current) clearInterval(confettiIntervalRef.current);

    confettiIntervalRef.current = setInterval(() => {
      const timeLeft = confettiEndTimeRef.current - Date.now();

      if (timeLeft <= 0) {
        if (confettiIntervalRef.current) {
          clearInterval(confettiIntervalRef.current);
          confettiIntervalRef.current = null;
        }
        return;
      }

      const particleCount = 40 * (timeLeft / rainDuration);

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
    }, 250);
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
  }, [fireCannon, ensureRainLoop]);

  const handleReaction = async (reaction: PlayReaction) => {
    await updateReaction(reaction);
  };

  const handleSaveNote = async () => {
    if (noteText.trim()) {
      await updateNotes(noteText);
    }
    setShowNoteModal(false);
    setNoteText("");
  };

  const openNoteModal = () => {
    setNoteText(currentPlay?.notes || "");
    setShowNoteModal(true);
  };

  // Handle exit: clean up announcements before leaving
  const handleExit = () => {
    // Cancel any active announcement for dancers
    if (activeAnnouncement) {
      onCancelAnnouncement?.();
      setActiveAnnouncement(null);
    }
    // Call the parent's exit handler
    onExit();
  };

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
    <div className="fixed inset-0 z-[9999] bg-pika-bg flex flex-col text-slate-50 font-sans overflow-hidden">
      <LiveHUD
        loading={loading}
        playCount={playCount}
        currentPlay={currentPlay}
        liveLikes={liveLikes}
        listenerCount={listenerCount}
        tempoFeedback={tempoFeedback ?? null}
        liveStatus={liveStatus}
        baseUrl={baseUrl ?? null}
        localIp={localIp ?? null}
        onExit={handleExit}
        onForceSync={onForceSync ?? undefined}
        onShowQr={() => setShowQrModal(true)}
      />

      {/* Footer - Reaction Controls */}
      <footer className="flex justify-center gap-8 p-10 border-t border-white/5 bg-slate-900/20 backdrop-blur-sm">
        <div className="flex gap-4">
          <button
            type="button"
            onClick={() => handleReaction("peak")}
            className={`flex flex-col items-center gap-3 px-12 py-6 rounded-3xl font-black text-xl transition-all active:scale-95 shadow-2xl ${
              currentPlay?.reaction === "peak"
                ? "bg-orange-600 text-white border-2 border-white/20 scale-105"
                : "bg-orange-950/40 text-orange-200 hover:bg-orange-900/40 border border-orange-500/20"
            }`}
            disabled={!currentPlay}
          >
            <Flame size={40} />
            <span>Peak</span>
          </button>

          <button
            type="button"
            onClick={() => handleReaction("brick")}
            className={`flex flex-col items-center gap-3 px-12 py-6 rounded-3xl font-black text-xl transition-all active:scale-95 shadow-2xl ${
              currentPlay?.reaction === "brick"
                ? "bg-blue-600 text-white border-2 border-white/20 scale-105"
                : "bg-blue-950/40 text-blue-200 hover:bg-blue-900/40 border border-blue-500/20"
            }`}
            disabled={!currentPlay}
          >
            <Square size={40} />
            <span>Brick</span>
          </button>

          <button
            type="button"
            onClick={openNoteModal}
            className={`flex flex-col items-center gap-3 px-12 py-6 rounded-3xl font-black text-xl transition-all active:scale-95 shadow-2xl ${
              currentPlay?.notes
                ? "bg-pika-purple text-white border-2 border-white/20 scale-105 shadow-[0_0_30px_rgba(168,85,247,0.3)]"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-white/5"
            }`}
            disabled={!currentPlay}
          >
            <StickyNote size={40} />
            <span>Note</span>
          </button>
        </div>

        <div className="w-px bg-white/5 mx-4" />

        <div>
          <button
            type="button"
            onClick={() => setShowCrowdDrawer(true)}
            className={`relative flex flex-col items-center gap-3 px-12 py-6 rounded-3xl font-black text-xl transition-all active:scale-95 shadow-2xl ${
              activePoll || activeAnnouncement
                ? "bg-pika-bg border-pika-purple text-pika-purple shadow-[0_0_40px_rgba(168,85,247,0.15)] ring-2 ring-pika-purple/50"
                : "bg-slate-800 text-slate-400 hover:bg-slate-700 border border-white/5"
            }`}
          >
            <Megaphone size={40} />
            <span>Crowd</span>
            {(activePoll || activeAnnouncement) && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full border-4 border-[#030711] animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]" />
            )}
          </button>
        </div>
      </footer>

      {/* Mini Timeline (Recent Plays) */}
      {recentPlays.length > 1 && (
        <div className="fixed bottom-4 left-6 flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/5 shadow-2xl pointer-events-none">
          {recentPlays.slice(-6, -1).map((play, idx, arr) => (
            <div
              key={play.id}
              className={`text-sm transition-all duration-700 ${
                idx === arr.length - 1 ? "opacity-100 scale-110" : "opacity-40"
              }`}
            >
              {play.reaction === "peak" ? "🔥" : play.reaction === "brick" ? "🧱" : "○"}
            </div>
          ))}
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
        onStartPoll={onStartPoll || (() => {})}
        onEndPoll={onEndPoll || (() => {})}
        announcementText={announcementText}
        setAnnouncementText={setAnnouncementText}
        onSendAnnouncement={onSendAnnouncement || (() => {})}
        onCancelAnnouncement={onCancelAnnouncement || (() => {})}
        onClearEndedPoll={onClearEndedPoll || (() => {})}
        currentPlay={currentPlay}
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
          setActiveAnnouncement(null);
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
