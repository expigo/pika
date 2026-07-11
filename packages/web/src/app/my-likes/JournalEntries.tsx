"use client";

import { ArrowRight, Heart, User, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { TrackRow } from "@/components/ui/TrackRow";
import { trackEvent } from "@/lib/events";
import { formatDate, formatTime, groupBySession, slugify } from "./journal-utils";
import type { LikedTrack } from "./types";

interface JournalEntriesProps {
  entries: LikedTrack[];
  remaining: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRemove: (like: LikedTrack) => Promise<void>;
}

/** LOG ENTRIES — likes grouped by session, with two-tap removal and pagination. */
export function JournalEntries({
  entries,
  remaining,
  loadingMore,
  onLoadMore,
  onRemove,
}: JournalEntriesProps) {
  // Two-tap confirm for removal: a past-night like can't be re-liked, so removal is irreversible.
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<number | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armRemove = useCallback((likeId: number) => {
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    setConfirmingRemoveId(likeId);
    disarmTimer.current = setTimeout(() => setConfirmingRemoveId(null), 4000);
  }, []);

  useEffect(
    () => () => {
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
    },
    [],
  );

  const confirmRemove = (like: LikedTrack) => {
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    setConfirmingRemoveId(null);
    void onRemove(like);
  };

  const groupedLikes = groupBySession(entries);

  return (
    <>
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
                    {confirmingRemoveId === like.id ? (
                      <button
                        type="button"
                        onClick={() => confirmRemove(like)}
                        aria-label={`Confirm removing ${like.title} from journal`}
                        className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-colors"
                      >
                        Remove?
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => armRemove(like.id)}
                        aria-label={`Remove ${like.title} from journal`}
                        className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
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
            onClick={onLoadMore}
            disabled={loadingMore}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.03] border border-white/10 text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-[0.2em] hover:bg-white/[0.06] transition-all disabled:opacity-50"
          >
            {loadingMore ? "Loading…" : `Load more (${remaining} older)`}
          </button>
        </div>
      )}
    </>
  );
}
