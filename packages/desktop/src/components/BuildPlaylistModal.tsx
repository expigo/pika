/**
 * Build Spotify Playlist modal (B3) — the DJ-assist tool. For a past session, resolve each played
 * track to a Spotify recording (remembered match → recommended, else cloud search), let the DJ
 * verify / pick among candidates / skip, then create the playlist on the shared Pika account.
 * Confirmed matches are written back to the local library (`dj_confirmed`) and the playlist is
 * remembered on the session so it isn't re-created on reopen.
 *
 * Rendering-only: all state + async flows live in useBuildPlaylist; rows render via PlaylistRow.
 */

import { Check, ExternalLink, ListMusic, X } from "lucide-react";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { useBuildPlaylist } from "../hooks/useBuildPlaylist";
import { useSpotifyFeaturesBatch } from "../hooks/useSpotifyFeatures";
import { openExternal, PlaylistRow } from "./PlaylistRow";

interface Props {
  session: { id: number; name: string | null };
  onClose: () => void;
}

export function BuildPlaylistModal({ session, onClose }: Props) {
  const {
    rows,
    loading,
    name,
    setName,
    note,
    setNote,
    creating,
    resultUrl,
    doneUrl,
    error,
    authError,
    expandedRow,
    setExpandedRow,
    syncState,
    syncing,
    syncError,
    selectedCount,
    choose,
    pasteLink,
    rematch,
    handleCreate,
    handleSync,
    handleUnsync,
    startRebuild,
  } = useBuildPlaylist(session);

  // Canonical Spotify features for each row's currently-selected candidate (shown as a small badge).
  const selectedSpotifyIds = useMemo(
    () =>
      rows.map((r) => (r.selectedIndex !== null ? r.candidates[r.selectedIndex]?.spotifyId : null)),
    [rows],
  );
  const { features: featureMap } = useSpotifyFeaturesBatch(selectedSpotifyIds);

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-3xl border border-slate-700/50 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3 text-pika-accent">
            <ListMusic size={24} />
            <h3 className="text-xl font-bold text-white">Build Spotify Playlist</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white"
          >
            <X size={22} />
          </button>
        </div>

        {doneUrl ? (
          <div className="flex flex-col items-center gap-4 px-6 py-12 text-center">
            <p className="text-lg font-semibold text-white">
              {resultUrl ? "Playlist created 🎉" : "This set already has a playlist"}
            </p>
            <button
              type="button"
              onClick={() => openExternal(doneUrl)}
              className="inline-flex items-center gap-2 rounded-full bg-[#1DB954] px-6 py-2.5 font-semibold text-black"
            >
              <ExternalLink size={16} /> Open in Spotify
            </button>

            {/* Share this set's playlist on the DJ's public Pika profile (embeds on the recap). */}
            {syncState && (
              <div className="mt-2 w-full max-w-sm border-t border-slate-800 pt-4">
                {!syncState.cloudSessionId ? (
                  <p className="text-xs text-slate-500">
                    Go live with a set to share its playlist on your Pika profile.
                  </p>
                ) : syncState.syncedAt ? (
                  <div className="flex flex-col items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400">
                      <Check size={16} /> On your Pika profile
                    </span>
                    <button
                      type="button"
                      onClick={handleUnsync}
                      disabled={syncing}
                      className="text-xs text-slate-500 hover:text-red-400 disabled:opacity-50"
                    >
                      {syncing ? "Updating…" : "Remove from profile"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={handleSync}
                    disabled={syncing || !syncState.playlistId}
                    className="inline-flex items-center gap-2 rounded-full border border-pika-accent/40 bg-pika-accent/10 px-5 py-2 text-sm font-semibold text-pika-accent hover:bg-pika-accent/20 disabled:opacity-50"
                  >
                    <ListMusic size={16} /> {syncing ? "Sharing…" : "Share on my Pika profile"}
                  </button>
                )}
                {syncError && <p className="mt-2 text-xs italic text-red-400">{syncError}</p>}
              </div>
            )}

            {!resultUrl && (
              <button
                type="button"
                onClick={startRebuild}
                className="text-sm text-slate-400 hover:text-white"
              >
                Build a new playlist instead
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-slate-500 hover:text-white"
            >
              Done
            </button>
          </div>
        ) : authError ? (
          <div className="px-6 py-10 text-center">
            <p className="mb-2 text-base font-semibold text-amber-300">This app isn't signed in</p>
            <p className="mx-auto max-w-sm text-sm text-slate-400">
              Building a playlist needs your DJ account. Open <strong>Settings</strong> and paste a
              fresh token from <strong>/dj/login</strong> on the web app (for the same server
              environment), then reopen this dialog.
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-slate-800 px-6 py-3">
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Playlist name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 100))}
                aria-label="Playlist name"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-pika-accent focus:outline-none"
              />
              <input
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, 180))}
                aria-label="Playlist note"
                placeholder="Optional note for the description (skipped tracks are listed automatically)"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-pika-accent focus:outline-none"
              />
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading set…</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  No matchable tracks in this set.
                </p>
              ) : (
                <ul className="space-y-2">
                  {rows.map((row, i) => {
                    const sel =
                      row.selectedIndex !== null ? row.candidates[row.selectedIndex] : null;
                    return (
                      <PlaylistRow
                        key={row.trackId}
                        row={row}
                        features={sel ? (featureMap.get(sel.spotifyId) ?? null) : null}
                        expanded={expandedRow === i}
                        onToggle={() => setExpandedRow((cur) => (cur === i ? null : i))}
                        onChoose={(v) => choose(i, v)}
                        onRematch={() => rematch(i)}
                        onPaste={(v) => pasteLink(i, v)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>

            {error && (
              <div role="alert" className="px-6 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 border-t border-slate-800 px-6 py-4">
              <span className="text-xs text-slate-500">{selectedCount} tracks selected</span>
              <button
                type="button"
                disabled={creating || selectedCount === 0}
                onClick={handleCreate}
                className="rounded-full bg-pika-accent px-6 py-2 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                {creating ? "Creating…" : "Create playlist"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
