"use client";

import { logger } from "@pika/shared";
import { ArrowRight, Heart, ListMusic, Radio, User } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { TrackRow } from "@/components/ui/TrackRow";
import { getApiBaseUrl } from "@/lib/api";
import { trackEvent } from "@/lib/events";

const PAGE_SIZE = 100;

// Get a stable client ID — READ-ONLY: the journal never mints an identity
// (an id is only created when the dancer actually interacts on /live).
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
  albumArtUrl: string | null;
  spotifyUrl: string | null;
  likedAt: string;
}

interface JournalPlaylist {
  url: string;
  trackCount: number;
  updatedAt: string;
}

interface LikesResponse {
  clientId: string;
  totalLikes: number;
  limit: number;
  offset: number;
  likes: LikedTrack[];
  playlist: JournalPlaylist | null;
}

interface ExportResponse {
  playlistUrl: string;
  trackCount: number;
  matchedCount: number;
  totalLiked: number;
  updated: boolean;
}

type ExportState =
  | { phase: "idle" }
  | { phase: "creating" }
  | { phase: "success"; updated: boolean }
  | { phase: "error"; message: string };

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

/** Installed-PWA check (guarded for happy-dom + older Safari's legacy flag). */
function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const viaMediaQuery =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const viaLegacyFlag = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return viaMediaQuery || viaLegacyFlag;
}

function isIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function exportErrorCopy(status: number, retryAfterSec?: number): string {
  switch (status) {
    case 409:
      return "Playlist export isn't set up yet — try again after the next update";
    case 429:
      return retryAfterSec
        ? `Hold on — try again in ${retryAfterSec}s`
        : "Hold on — try again in a minute";
    case 422:
      return "None of your likes have a Spotify match yet";
    case 503:
      return "Spotify is busy — try again in a minute";
    default:
      return "Export failed — try again";
  }
}

export default function MyLikesPage() {
  const [entries, setEntries] = useState<LikedTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [playlist, setPlaylist] = useState<JournalPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportState, setExportState] = useState<ExportState>({ phase: "idle" });
  const [showNudge, setShowNudge] = useState(false);
  const openedFired = useRef(false);
  const nudgeFired = useRef(false);

  useEffect(() => {
    const id = getClientId();

    if (!id) {
      setLoading(false);
      setError("no_likes");
      if (!openedFired.current) {
        openedFired.current = true;
        trackEvent("journal_opened", { totalLikes: 0 });
      }
      return;
    }

    async function fetchLikes() {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(
          `${baseUrl}/api/client/${id}/likes?limit=${PAGE_SIZE}&offset=0`,
        );

        if (!response.ok) {
          setError("fetch_failed");
          return;
        }

        const data: LikesResponse = await response.json();
        setEntries(data.likes);
        setTotal(data.totalLikes);
        setPlaylist(data.playlist ?? null);
        if (!openedFired.current) {
          openedFired.current = true;
          trackEvent("journal_opened", { totalLikes: data.totalLikes });
        }
      } catch (e) {
        logger.error("Failed to fetch likes", e);
        setError("network_error");
      } finally {
        setLoading(false);
      }
    }

    fetchLikes();
  }, []);

  // ITP mitigation: a non-installed browser can evict this device's journal identity —
  // surface the install nudge (the interactive InstallPrompt is mounted globally).
  useEffect(() => {
    if (!isStandalone()) {
      setShowNudge(true);
      if (!nudgeFired.current) {
        nudgeFired.current = true;
        trackEvent("install_nudge_shown");
      }
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    const id = getClientId();
    if (!id || loadingMore) return;
    setLoadingMore(true);
    trackEvent("journal_load_more", { offset: entries.length });
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(
        `${baseUrl}/api/client/${id}/likes?limit=${PAGE_SIZE}&offset=${entries.length}`,
      );
      if (!response.ok) return;
      const data: LikesResponse = await response.json();
      setTotal(data.totalLikes);
      setEntries((prev) => {
        // New likes shift DESC offsets between pages — dedupe by like id on append.
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...data.likes.filter((l) => !seen.has(l.id))];
      });
    } catch (e) {
      logger.error("Failed to load more likes", e);
    } finally {
      setLoadingMore(false);
    }
  }, [entries.length, loadingMore]);

  const handleExport = useCallback(async () => {
    const id = getClientId();
    if (!id || exportState.phase === "creating") return;
    setExportState({ phase: "creating" });
    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/client/${id}/likes/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
      });

      if (response.ok) {
        const data: ExportResponse = await response.json();
        setPlaylist({
          url: data.playlistUrl,
          trackCount: data.trackCount,
          updatedAt: new Date().toISOString(),
        });
        setExportState({ phase: "success", updated: data.updated });
        trackEvent(data.updated ? "journal_export_updated" : "journal_export_created", {
          trackCount: data.trackCount,
          matchedCount: data.matchedCount,
          totalLiked: data.totalLiked,
        });
        return;
      }

      const body = (await response.json().catch(() => ({}))) as { retryAfterSec?: number };
      setExportState({
        phase: "error",
        message: exportErrorCopy(response.status, body.retryAfterSec),
      });
      trackEvent("journal_export_failed", { status: response.status });
    } catch (e) {
      logger.error("Journal export failed", e);
      setExportState({
        phase: "error",
        message: "Export failed — check your connection and try again",
      });
      trackEvent("journal_export_failed", { status: 0 });
    }
  }, [exportState.phase]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-bold tracking-widest text-xs uppercase">
          Opening Your Journal...
        </div>
      </div>
    );
  }

  if (error === "no_likes" || (!loading && total === 0 && entries.length === 0)) {
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

  const groupedLikes = groupBySession(entries);
  const remaining = Math.max(0, total - entries.length);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.15),transparent_70%)] opacity-70" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-12">
        {/* HEADER CARD */}
        <ProCard className="mb-8 p-12 text-center" glow align="center">
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
              {total} MOMENTS CAPTURED
            </span>
          </div>
        </ProCard>

        {/* EXPORT CARD */}
        <ProCard className="mb-12 p-6 sm:p-8" glow glowColor="emerald-500">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#1DB954]/10 border border-[#1DB954]/30 flex items-center justify-center shrink-0">
                <ListMusic className="w-5 h-5 text-[#1DB954]" />
              </div>
              <div className="min-w-0">
                <h2 className="font-black text-white uppercase text-xs tracking-wider leading-none mb-1">
                  Take It Home
                </h2>
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                  {playlist
                    ? `${playlist.trackCount} tracks on your Spotify playlist`
                    : "Turn your journal into a Spotify playlist"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {playlist && (
                <a
                  href={playlist.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 bg-[#1DB954]/10 border border-[#1DB954]/40 text-[#1DB954] rounded-xl font-black text-[10px] uppercase tracking-[0.15em] hover:bg-[#1DB954]/20 transition-all"
                >
                  Open my playlist
                </a>
              )}
              <button
                type="button"
                onClick={handleExport}
                disabled={exportState.phase === "creating"}
                className="inline-flex items-center gap-2 px-5 py-3 bg-white text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
              >
                {exportState.phase === "creating"
                  ? "Syncing…"
                  : playlist
                    ? "Update playlist"
                    : "Create my Spotify playlist"}
              </button>
            </div>
          </div>
          {exportState.phase === "error" && (
            <p className="mt-4 text-[10px] font-black text-red-400 uppercase tracking-widest">
              {exportState.message}
            </p>
          )}
          {exportState.phase === "success" && (
            <p className="mt-4 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
              {exportState.updated ? "Playlist updated ✓" : "Playlist created ✓"}
            </p>
          )}
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
                    <TrackRow
                      key={like.id}
                      title={like.title}
                      artist={like.artist}
                      albumArtUrl={like.albumArtUrl}
                      spotifyUrl={like.spotifyUrl}
                      onSpotifyClick={() =>
                        trackEvent("journal_spotify_click", {
                          sessionId: like.sessionId ?? undefined,
                        })
                      }
                    >
                      <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500/20" />
                      <span className="text-slate-700 font-black text-[9px] tabular-nums uppercase">
                        {formatTime(like.likedAt).split(" ")[0]}
                      </span>
                    </TrackRow>
                  ))}
                </div>
              </ProCard>
            );
          })}
        </div>

        {/* LOAD MORE */}
        {remaining > 0 && (
          <div className="mt-10 text-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.03] border border-white/10 text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white/[0.06] transition-all disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : `Load more (${remaining} older)`}
            </button>
          </div>
        )}

        {/* KEEP-IT-SAFE NUDGE (ITP: non-installed browsers can evict this device's journal id) */}
        {showNudge && (
          <ProCard className="mt-12 p-6 text-center" align="center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">
              📌 Keep your journal safe
            </p>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
              {isIosBrowser()
                ? "Add Pika to your Home Screen (Share → Add to Home Screen) — Safari clears data for sites you haven't visited in a while, and your journal lives on this device."
                : "Install Pika from your browser menu so this device keeps your journal between events."}
            </p>
          </ProCard>
        )}

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
