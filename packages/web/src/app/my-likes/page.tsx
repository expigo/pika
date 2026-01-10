"use client";

import { ArrowLeft, Calendar, Heart, Music2, Radio, User } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

// API base URL
function getApiBaseUrl(): string {
  // In production, use the configured environment variable
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }
  // Fallback for local development
  return "http://localhost:3001";
}

// Get or create a stable client ID
function getClientId(): string | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("pika_client_id");
  return stored;
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
    year: "numeric",
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
  const [clientId, setClientId] = useState<string | null>(null);

  useEffect(() => {
    const id = getClientId();
    setClientId(id);

    if (!id) {
      setLoading(false);
      setError("no_likes_yet");
      return;
    }

    async function fetchLikes() {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/client/${id}/likes`);

        if (!response.ok) {
          if (response.status === 400) {
            setError("invalid_client");
          } else {
            setError("fetch_failed");
          }
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
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-slate-400 animate-pulse">Loading your likes...</div>
      </div>
    );
  }

  if (error === "no_likes_yet" || (likes && likes.totalLikes === 0)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Heart className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-300 mb-2">No Liked Songs Yet</h1>
          <p className="text-slate-500 mb-6">
            Join a live DJ session and tap the heart to like songs you enjoy!
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back Home
          </Link>
        </div>
      </div>
    );
  }

  if (error || !likes) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <Radio className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-300 mb-2">Something went wrong</h1>
          <p className="text-slate-500 mb-6">
            We couldn&apos;t load your liked songs. Please try again later.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back Home
          </Link>
        </div>
      </div>
    );
  }

  const groupedLikes = groupBySession(likes.likes);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header Card */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden mb-6">
          {/* Top Bar */}
          <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="w-6 h-6 text-red-500 fill-current" />
              <h1 className="text-xl font-bold text-white">
                My <span className="text-red-500">Liked Songs</span>
              </h1>
            </div>
            <Link href="/" className="text-slate-400 hover:text-white transition-colors text-sm">
              ← Back
            </Link>
          </div>

          {/* Stats */}
          <div className="px-6 py-6 text-center">
            <div className="text-4xl font-bold text-red-400 flex items-center justify-center gap-2">
              <Heart className="w-8 h-8 fill-current" />
              {likes.totalLikes}
            </div>
            <div className="text-sm text-slate-500 uppercase tracking-wide mt-1">Songs Liked</div>
          </div>
        </div>

        {/* Likes by Session */}
        {Array.from(groupedLikes.entries()).map(([sessionId, sessionLikes]) => {
          const firstLike = sessionLikes[0];
          const djName = firstLike?.djName || "Unknown DJ";
          const sessionDate = firstLike?.sessionDate;
          const djSlug = slugify(djName);

          return (
            <div
              key={sessionId || "unknown"}
              className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden mb-6"
            >
              {/* Session Header */}
              <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
                <div>
                  <Link
                    href={`/dj/${djSlug}`}
                    className="flex items-center gap-2 text-white font-medium hover:text-purple-400 transition-colors"
                  >
                    <User className="w-4 h-4" />
                    {djName}
                  </Link>
                  {sessionDate && (
                    <div className="flex items-center gap-1.5 text-slate-500 text-sm mt-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(sessionDate)}
                    </div>
                  )}
                </div>
                {sessionId && (
                  <Link
                    href={`/dj/${djSlug}/recap/${sessionId}`}
                    className="text-xs text-slate-400 hover:text-white transition-colors"
                  >
                    View Recap →
                  </Link>
                )}
              </div>

              {/* Track List */}
              <div className="divide-y divide-slate-700/30">
                {sessionLikes.map((like) => (
                  <div
                    key={like.id}
                    className="px-6 py-3 flex items-center gap-4 hover:bg-slate-700/20 transition-colors"
                  >
                    <Heart className="w-4 h-4 text-red-400 fill-current flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{like.title}</p>
                      <p className="text-slate-500 text-sm truncate">{like.artist}</p>
                    </div>
                    <span className="text-slate-600 text-xs">{formatTime(like.likedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div className="text-center mt-6 text-slate-600 text-sm">
          <p>Powered by Pika! 🎧</p>
          <p className="mt-2 text-xs">
            Your likes are saved in this browser. Different device = different history.
          </p>
        </div>
      </div>
    </div>
  );
}
