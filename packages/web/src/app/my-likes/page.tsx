"use client";

import { logger } from "@pika/shared";
import { ArrowRight, Heart, Radio, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { getApiBaseUrl } from "@/lib/api";

// Get or create a stable client ID
function getClientId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("pika_client_id");
}

interface LikedTrack {
  id: number;
  sessionId: string | null;
  djName: string | null;
  sessionDate: string | null;
  artist: string;
  title: string;
  likedAt: string;
}

interface LikesResponse {
  clientId: string;
  totalLikes: number;
  likes: LikedTrack[];
}

// Format date nicely
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Format time
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Group likes by session
function groupBySession(likes: LikedTrack[]): Map<string | null, LikedTrack[]> {
  const groups = new Map<string | null, LikedTrack[]>();
  for (const like of likes) {
    const key = like.sessionId;
    const existing = groups.get(key) || [];
    groups.set(key, [...existing, like]);
  }
  return groups;
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

export default function MyLikesPage() {
  const [likes, setLikes] = useState<LikesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = getClientId();

    if (!id) {
      setLoading(false);
      setError("no_likes");
      return;
    }

    async function fetchLikes() {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/client/${id}/likes`);

        if (!response.ok) {
          setError("fetch_failed");
          return;
        }

        const data: LikesResponse = await response.json();
        setLikes(data);
      } catch (e) {
        logger.error("Failed to fetch likes", e);
        setError("network_error");
      } finally {
        setLoading(false);
      }
    }

    fetchLikes();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-bold tracking-widest text-xs uppercase">
          Opening Your Journal...
        </div>
      </div>
    );
  }

  if (error === "no_likes" || (likes && likes.totalLikes === 0)) {
    return (
      <div className="h-[100dvh] w-full bg-slate-950 flex flex-col items-center justify-center p-4 overflow-hidden">
        <ProCard className="max-w-md w-full p-12 text-center" glow align="center">
          <div className="w-20 h-20 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 shadow-xl">
            <Heart className="w-8 h-8 text-slate-700" />
          </div>
          <h1 className="text-2xl font-black text-white mb-4 italic uppercase tracking-tighter">
            The Pages are Blank
          </h1>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed mb-10">
            You haven't liked any songs yet. Head to the floor and start syncing!
          </p>
          <Link
            href="/live"
            className="inline-flex items-center gap-3 px-8 py-4 bg-white text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] hover:scale-105 active:scale-95 transition-all shadow-xl"
          >
            <Radio className="w-4 h-4" />
            Find a Room
          </Link>
        </ProCard>
      </div>
    );
  }

  const groupedLikes = groupBySession(likes?.likes || []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-red-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-12">
        {/* HEADER CARD */}
        <ProCard className="mb-12 p-12 text-center" glow align="center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-500 to-pink-600 rounded-[2.5rem] mb-6 shadow-2xl shadow-red-500/20">
            <Heart className="w-10 h-10 text-white fill-current" />
          </div>
          <h1 className="text-4xl font-black text-white mb-4 tracking-tighter italic uppercase">
            JOURNAL.
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-[10px] mb-8">
            Personal Connection Archive
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-1 bg-white/[0.03] border border-white/10 rounded-full">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {likes?.totalLikes} MOMENTS CAPTURED
            </span>
          </div>
        </ProCard>

        {/* LOG ENTRIES */}
        <div className="space-y-8">
          {Array.from(groupedLikes.entries()).map(([sessionId, sessionLikes]) => {
            const firstLike = sessionLikes[0];
            const djName = firstLike?.djName || "Live Set";
            const djSlug = slugify(djName);

            return (
              <ProCard key={sessionId || "unknown"} className="overflow-hidden">
                <div className="px-6 sm:px-8 py-5 border-b border-white/[0.03] flex items-center justify-between bg-white/[0.02]">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                      <User className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-black text-white uppercase text-xs tracking-wider leading-none mb-1">
                        {djName}
                      </h3>
                      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                        {firstLike?.sessionDate
                          ? formatDate(firstLike.sessionDate)
                          : "Historical Set"}
                      </p>
                    </div>
                  </div>

                  {sessionId && (
                    <Link
                      href={`/dj/${djSlug}/recap/${sessionId}`}
                      className="p-2 hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-all group/link"
                    >
                      <ArrowRight className="w-4 h-4 group-hover/link:translate-x-0.5 transition-transform" />
                    </Link>
                  )}
                </div>

                <div className="divide-y divide-white/[0.03]">
                  {sessionLikes.map((like) => (
                    <div
                      key={like.id}
                      className="px-6 sm:px-8 py-4 flex items-center justify-between group/row hover:bg-white/[0.01] transition-colors"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-4">
                        <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500/20 group-hover/row:fill-red-500 transition-all" />
                        <div className="min-w-0">
                          <p className="text-slate-100 font-extrabold text-[13px] tracking-tight uppercase italic truncate leading-none">
                            {like.title}
                          </p>
                          <p className="text-slate-500 text-[9px] font-bold uppercase tracking-[0.2em] truncate mt-1.5 opacity-60">
                            {like.artist}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-4">
                        <span className="text-slate-700 font-black text-[9px] tabular-nums uppercase">
                          {formatTime(like.likedAt).split(" ")[0]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </ProCard>
            );
          })}
        </div>

        <div className="mt-24 text-center pb-32">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-2">
            The Neural Fiber of the Handshake
          </p>
          <p className="text-[9px] font-bold text-slate-700 italic uppercase tracking-widest opacity-60">
            Your Synchronized Dance History
          </p>
        </div>
      </div>
    </div>
  );
}
