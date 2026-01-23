"use client";

import {
  Activity,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Heart,
  Radio,
  Share2,
  User,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ProCard, ProHeader } from "@/components/ui/ProCard";
import { VibeBadge } from "@/components/ui/VibeBadge";

import { getApiBaseUrl } from "@/lib/api";

interface RecapTrack {
  position: number;
  artist: string;
  title: string;
  bpm: number | null;
  key: string | null;
  playedAt: string;
  likes: number;
}

interface SessionRecap {
  sessionId: string;
  djName: string;
  startedAt: string;
  endedAt: string;
  trackCount: number;
  totalLikes: number;
  tracks: RecapTrack[];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "1 min";
  if (diffMins < 60) return `${diffMins} min`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export default function RecapPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [recap, setRecap] = useState<SessionRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAllTracks, setShowAllTracks] = useState(false);

  useEffect(() => {
    async function fetchRecap() {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/session/${sessionId}/recap`);

        if (!response.ok) {
          setError(response.status === 404 ? "Session not found" : "Failed to load recap");
          return;
        }

        const data = await response.json();
        setRecap(data);
      } catch (e) {
        console.error("Failed to fetch recap:", e);
        setError("Failed to connect to server");
      } finally {
        setLoading(false);
      }
    }

    if (sessionId) {
      fetchRecap();
    }
  }, [sessionId]);

  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Set Recap - ${recap?.djName || "DJ"}`,
          text: `Check out this DJ set: ${recap?.trackCount} tracks played!`,
          url,
        });
      } catch (_e) {}
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Peak of the night logic (Safety Check)
  const peakTrack =
    recap?.tracks && recap.tracks.length > 0
      ? recap.tracks.reduce((prev, current) =>
          (prev.likes || 0) > (current.likes || 0) ? prev : current,
        )
      : null;

  const INITIAL_TRACK_COUNT = 10;
  const visibleTracks = showAllTracks ? recap?.tracks : recap?.tracks.slice(0, INITIAL_TRACK_COUNT);
  const hasMoreTracks = (recap?.tracks.length || 0) > INITIAL_TRACK_COUNT;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-bold tracking-widest text-sm uppercase">
          Generating Recap...
        </div>
      </div>
    );
  }

  if (error || !recap) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center">
        <div>
          <Radio className="w-16 h-16 text-slate-800 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-white mb-2 italic uppercase">
            The waves went flat
          </h1>
          <p className="text-slate-500 font-bold max-w-xs mx-auto">
            This recap isn't available right now. It might still be processing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-12">
          <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-full">
            <Radio className="w-3.5 h-3.5 text-red-500 animate-pulse" />
            <span className="font-bold text-slate-300 text-[10px] uppercase tracking-widest leading-none">
              Pika! <span className="text-white">Recap</span>
            </span>
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2 hover:bg-slate-900 text-[10px] font-black text-slate-500 hover:text-white rounded-lg transition-all border border-transparent hover:border-slate-800 uppercase tracking-widest active:scale-95"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Share2 className="w-3.5 h-3.5" />
            )}
            {copied ? "Link Copied" : "Share Recap"}
          </button>
        </div>

        {/* HERO CARD */}
        <ProCard className="p-8 sm:p-12 mb-10 text-center" glow variant="hero" align="center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-[2rem] mb-8 shadow-2xl shadow-purple-500/20">
            <User className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-black text-white mb-2 tracking-tighter italic uppercase leading-none">
            {recap.djName}
          </h2>
          <div className="flex items-center justify-center gap-3 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mb-12">
            <Calendar className="w-4 h-4 text-purple-500/50" />
            {formatDate(recap.startedAt)}
          </div>

          <div className="grid grid-cols-3 divide-x divide-slate-800/50 border-t border-slate-800/50 pt-10">
            <div>
              <div className="text-2xl font-black text-white italic tracking-tighter">
                {recap.trackCount}
              </div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                Tracks
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-white italic tracking-tighter">
                {formatDuration(recap.startedAt, recap.endedAt)}
              </div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                Length
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-red-500 italic tracking-tighter flex items-center justify-center gap-2">
                <Heart className="w-5 h-5 fill-current" />
                {recap.totalLikes}
              </div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                Total Syncs
              </div>
            </div>
          </div>
        </ProCard>

        {/* PEAK MOMENT SECTION */}
        {peakTrack && peakTrack.likes > 0 && (
          <ProCard className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent p-10 mb-10 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <div className="flex items-center gap-2 text-amber-500 text-[9px] font-black uppercase tracking-[0.3em] mb-4">
                <Flame className="w-4 h-4" />
                Peak of the Night
              </div>
              <h3 className="text-2xl sm:text-3xl font-black text-white mb-1 tracking-tight italic uppercase leading-tight">
                {peakTrack.title}
              </h3>
              <p className="text-amber-500/70 font-black uppercase italic tracking-widest text-[10px]">
                {peakTrack.artist}
              </p>
              <div className="mt-8">
                <VibeBadge variant="amber" icon={Heart}>
                  {peakTrack.likes} INSTANT FAVORITES
                </VibeBadge>
              </div>
            </div>
          </ProCard>
        )}

        {/* TRACKLIST / PULSE CHRONOLOGY */}
        <ProCard className="overflow-hidden">
          <ProHeader
            title="Pulse Chronology"
            icon={Activity}
            subtitle={`Total Archives: ${recap.trackCount}`}
          />

          {recap.tracks.length > 0 ? (
            <div className="divide-y divide-slate-800/30">
              {visibleTracks?.map((track) => (
                <div
                  key={track.position}
                  className="px-8 py-5 flex items-center gap-6 transition-colors active:bg-slate-900"
                >
                  <span className="text-slate-800 font-black text-xs w-6 italic">
                    {String(track.position).padStart(2, "0")}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-black italic truncate tracking-tight uppercase text-sm leading-tight">
                      {track.title}
                    </p>
                    <p className="text-slate-500 text-[10px] font-black uppercase truncate tracking-widest mt-1">
                      {track.artist}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {track.likes > 0 && (
                      <VibeBadge variant="red" icon={Heart} className="px-2 py-0.5">
                        {track.likes}
                      </VibeBadge>
                    )}
                    <span className="text-slate-700 font-black text-[10px] uppercase">
                      {formatTime(track.playedAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-700 font-black uppercase italic tracking-widest text-[10px]">
              No recorded syncs for this time period.
            </div>
          )}

          {hasMoreTracks && (
            <button
              onClick={() => setShowAllTracks(!showAllTracks)}
              className="w-full px-8 py-5 border-t border-slate-800/50 text-slate-500 hover:text-white active:bg-slate-900 transition-all font-black text-[10px] uppercase tracking-[0.3em] flex items-center justify-center gap-3 active:scale-[0.99]"
            >
              {showAllTracks ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Close Log
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Expand {recap.trackCount} Syncs
                </>
              )}
            </button>
          )}
        </ProCard>

        <div className="mt-16 text-center pt-8 opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.6em] text-slate-500 mb-6">
            Powered by Pika! Network Intelligence
          </p>
          <Link
            href="/live"
            className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900/50 hover:bg-slate-900 rounded-2xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50 active:scale-95"
          >
            ← Back to Lobby
          </Link>
        </div>
      </div>
    </div>
  );
}
