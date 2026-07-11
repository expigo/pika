"use client";

import { ListMusic } from "lucide-react";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";
import type { ExportState, JournalPlaylist } from "./types";

interface ExportCardProps {
  playlist: JournalPlaylist | null;
  exportState: ExportState;
  isAccountMode: boolean;
  onExport: () => void;
}

/** EXPORT CARD — turn the journal into a Spotify playlist (create/update + status copy). */
export function ExportCard({ playlist, exportState, isAccountMode, onExport }: ExportCardProps) {
  return (
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
            onClick={onExport}
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
          {!isAccountMode && (
            <>
              {" · "}
              <Link
                href="/my-likes/save"
                className="underline decoration-emerald-400/40 hover:decoration-emerald-400"
              >
                save your journal so you never lose it
              </Link>
            </>
          )}
        </p>
      )}
    </ProCard>
  );
}
