"use client";

import { ArrowLeft, ArrowRight, Calendar, Heart, Radio, User, History, Music2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProCard, ProHeader } from "@/components/ui/ProCard";
import { VibeBadge } from "@/components/ui/VibeBadge";

// API base URL
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return process.env.NEXT_PUBLIC_CLOUD_API_URL || "http://localhost:3001";
}

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
    hour: "numeric",
    minute: "2-digit",
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
        console.error("Failed to fetch likes:", e);
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <ProCard className="max-w-md w-full p-12 text-center" glow>
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
        <ProCard className="mb-12 p-12 text-center" glow>
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-500 to-pink-600 rounded-[2.5rem] mb-6 shadow-2xl shadow-red-500/20">
            <Heart className="w-10 h-10 text-white fill-current" />
          </div>
          <h1 className="text-4xl font-black text-white mb-4 tracking-tighter italic uppercase">
            JOURNAL
          </h1>
          <div className="inline-flex items-center gap-2 px-4 py-1 bg-slate-900 border border-slate-800 rounded-full">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {likes?.totalLikes} TRACKS SYNCED
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
              <ProCard key={sessionId || "unknown"}>
                <ProHeader
                  title={djName}
                  icon={User}
                  subtitle={
                    firstLike?.sessionDate ? formatDate(firstLike.sessionDate) : "Historical Set"
                  }
                />

                <div className="divide-y divide-slate-800/30">
                  {sessionLikes.map((like) => (
                    <div
                      key={like.id}
                      className="px-8 py-5 flex items-center justify-between transition-colors active:bg-slate-900/80"
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-4">
                        <Heart className="w-4 h-4 text-red-500 fill-red-500/20 group-hover:fill-red-500 transition-all" />
                        <div>
                          <p className="text-white font-black text-sm tracking-tight uppercase italic truncate">
                            {like.title}
                          </p>
                          <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest truncate mt-1">
                            {like.artist}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0">
                        <span className="text-slate-700 font-black text-[10px]">
                          {formatTime(like.likedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {sessionId && (
                  <div className="px-8 py-4 bg-slate-900/30 flex justify-end border-t border-slate-800/30">
                    <Link
                      href={`/dj/${djSlug}/recap/${sessionId}`}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 hover:border-purple-500/30 hover:bg-purple-500/5 text-[9px] font-black text-slate-400 hover:text-purple-400 transition-all uppercase tracking-widest rounded-lg"
                    >
                      View Full Recap <ArrowRight className="w-3 h-3" />
                    </Link>
                  </div>
                )}
              </ProCard>
            );
          })}
        </div>

        <div className="mt-20 text-center opacity-30 pb-32">
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500">
            A personal record of your WCS journey
          </p>
          <p className="mt-2 text-[9px] font-bold text-slate-600 italic">
            Stored locally on this device
          </p>
        </div>
      </div>
    </div>
  );
}
