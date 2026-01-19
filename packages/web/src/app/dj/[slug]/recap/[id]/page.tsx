"use client";

import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Heart,
  Music2,
  Radio,
  Share2,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ProCard, ProHeader } from "@/components/ui/ProCard";

import { getApiBaseUrl } from "@/lib/api";

interface RecapTrack {
  position: number;
  artist: string;
  title: string;
  bpm: number | null;
  key: string | null;
  // Fingerprint data
  energy: number | null;
  danceability: number | null;
  brightness: number | null;
  acousticness: number | null;
  groove: number | null;
  playedAt: string;
  likes: number;
  tempo: {
    slower: number;
    perfect: number;
    faster: number;
  } | null;
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

// Format date nicely
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Format time
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Calculate duration
function formatDuration(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "1 MIN";
  if (diffMins < 60) return `${diffMins} MIN`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}H ${mins}M` : `${hours}H`;
}

// Convert DJ name to slug
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface RecapPageProps {
  params: Promise<{ slug: string; id: string }>;
}

export default function DjRecapPage({ params }: RecapPageProps) {
  const { slug, id: sessionId } = use(params);

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
          if (response.status === 404) {
            setError("Session not found");
          } else {
            setError("Failed to load recap");
          }
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
      } catch {
        // User cancelled or error
      }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Show limited tracks initially
  const INITIAL_TRACK_COUNT = 15;
  const visibleTracks = showAllTracks ? recap?.tracks : recap?.tracks.slice(0, INITIAL_TRACK_COUNT);
  const hasMoreTracks = (recap?.tracks.length || 0) > INITIAL_TRACK_COUNT;

  // Get DJ slug from recap data (for the back link)
  const djSlug = recap ? slugify(recap.djName) : slug;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-black tracking-widest text-[10px] uppercase">
          Rewinding Tape...
        </div>
      </div>
    );
  }

  if (error || !recap) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
        </div>
        <div className="text-center relative">
          <Radio className="w-20 h-20 text-slate-800 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-white mb-2 italic uppercase tracking-tighter">
            Archive Missing
          </h1>
          <p className="text-slate-500 font-bold mb-8 uppercase tracking-widest text-[10px]">
            The requested session tape could not be recovered.
          </p>
          <Link
            href={`/dj/${slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all font-bold border border-slate-800 uppercase text-[10px] tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Archive
          </Link>
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
        {/* Header Card */}
        <ProCard glow className="mb-8 overflow-hidden">
          {/* Top Bar */}
          <div className="px-8 py-4 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/40">
            <div className="flex items-center gap-3">
              <Radio className="w-5 h-5 text-red-500" />
              <h1 className="text-sm font-black text-white italic uppercase tracking-tighter">
                Pika! <span className="text-red-500">Recap</span>
              </h1>
            </div>
            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-300 text-[10px] font-black uppercase tracking-widest transition-all border border-slate-700/50"
            >
              {copied ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Share2 className="w-3 h-3" />
              )}
              {copied ? "COPIED" : "SHARE"}
            </button>
          </div>

          {/* DJ Info */}
          <div className="px-8 py-12 text-center border-b border-slate-800/50">
            <Link
              href={`/dj/${djSlug}`}
              className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-[2rem] mb-6 hover:scale-105 transition-transform shadow-2xl shadow-purple-500/20"
            >
              <User className="w-10 h-10 text-white" />
            </Link>
            <Link href={`/dj/${djSlug}`}>
              <h2 className="text-3xl font-black text-white mb-2 italic uppercase tracking-tighter hover:text-purple-400 transition-colors">
                {recap.djName}
              </h2>
            </Link>
            <div className="flex items-center justify-center gap-3 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
              <Calendar className="w-4 h-4 text-purple-500/50" />
              {formatDate(recap.startedAt)}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 divide-x divide-slate-800/50 bg-slate-900/20">
            <div className="px-6 py-6 text-center">
              <div className="text-2xl font-black text-white italic tracking-tighter">
                {recap.trackCount}
              </div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                Tracks
              </div>
            </div>
            <div className="px-6 py-6 text-center">
              <div className="text-2xl font-black text-white italic tracking-tighter">
                {formatDuration(recap.startedAt, recap.endedAt)}
              </div>
              <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-1">
                Set Length
              </div>
            </div>
            <div className="px-6 py-6 text-center">
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

        {/* Analytics Link */}
        <Link
          href={`/dj/${slug}/recap/${sessionId}/analytics`}
          className="group block relative overflow-hidden rounded-3xl mb-12 p-1"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 opacity-20 group-hover:opacity-30 transition-opacity" />
          <div className="relative bg-slate-950 p-6 rounded-[1.4rem] border border-white/5 flex items-center justify-between transition-all group-hover:bg-slate-900/50">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <TrendingUp className="w-6 h-6" />
              </div>
              <div>
                <div className="font-black text-white italic uppercase tracking-tight text-lg leading-tight">
                  Deep Intelligence
                </div>
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">
                  View engagement charts & vibe analysis
                </div>
              </div>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 group-hover:text-white transition-all">
              →
            </div>
          </div>
        </Link>

        {/* Track List */}
        <ProCard className="overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/20">
            <div className="flex items-center gap-3">
              <Music2 className="w-5 h-5 text-purple-500" />
              <h3 className="font-black text-white italic uppercase tracking-tight">
                Timeline Archive
              </h3>
            </div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              {recap.trackCount} Total
            </span>
          </div>

          <div className="divide-y divide-slate-800/30">
            {visibleTracks?.map((track) => (
              <div
                key={track.position}
                className="px-8 py-5 flex items-center gap-5 hover:bg-slate-900/50 transition-all group"
              >
                <div className="flex-shrink-0 w-8 text-[11px] font-black text-slate-700 italic group-hover:text-purple-500/50 transition-colors">
                  {String(track.position).padStart(2, "0")}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black italic uppercase tracking-tight leading-tight group-hover:text-purple-400 transition-colors">
                    {track.title}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">
                    {track.artist}
                  </p>
                </div>

                {/* Tempo feedback */}
                {track.tempo &&
                  (track.tempo.slower > 0 || track.tempo.perfect > 0 || track.tempo.faster > 0) && (
                    <div className="flex items-center gap-2 mr-2">
                      {track.tempo.slower > 0 && (
                        <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] font-black text-blue-400 flex items-center gap-1">
                          🐢 {track.tempo.slower}
                        </span>
                      )}
                      {track.tempo.perfect > 0 && (
                        <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-[10px] font-black text-emerald-400 flex items-center gap-1">
                          👌 {track.tempo.perfect}
                        </span>
                      )}
                      {track.tempo.faster > 0 && (
                        <span className="px-2 py-1 bg-orange-500/10 border border-orange-500/20 rounded-lg text-[10px] font-black text-orange-400 flex items-center gap-1">
                          🐇 {track.tempo.faster}
                        </span>
                      )}
                    </div>
                  )}

                <div className="flex items-center gap-4 flex-shrink-0">
                  {track.likes > 0 && (
                    <span className="flex items-center gap-1.5 px-3 py-1 bg-red-500/5 border border-red-500/10 rounded-full text-red-500 font-black text-[10px]">
                      <Heart className="w-3.5 h-3.5 fill-current" />
                      {track.likes}
                    </span>
                  )}
                  <div className="text-slate-700 font-black text-[10px] uppercase w-16 text-right group-hover:text-slate-500 transition-colors">
                    {formatTime(track.playedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Show More/Less */}
          {hasMoreTracks && (
            <button
              onClick={() => setShowAllTracks(!showAllTracks)}
              className="w-full px-8 py-5 border-t border-slate-800/50 text-slate-500 hover:text-white hover:bg-slate-900/50 transition-all flex items-center justify-center gap-3 text-[10px] font-black uppercase tracking-[0.2em]"
            >
              {showAllTracks ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Close Archive
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Expand All {recap.trackCount} Cuts
                </>
              )}
            </button>
          )}
        </ProCard>

        {/* Back Link & Footer */}
        <div className="mt-12 text-center">
          <Link
            href={`/dj/${djSlug}`}
            className="inline-flex items-center gap-3 px-6 py-3 bg-slate-900/50 hover:bg-slate-900 rounded-2xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50"
          >
            <ArrowLeft className="w-4 h-4" />
            Full {recap.djName} Profile
          </Link>
        </div>

        <div className="text-center mt-20 opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-500">
            Powered by Pika! Deep Analytics Engine
          </p>
        </div>
      </div>
    </div>
  );
}
