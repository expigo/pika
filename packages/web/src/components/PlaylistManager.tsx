"use client";

import { parseChosicCsv, parseExportifyCsv } from "@pika/shared";
import { Eye, EyeOff, FileUp, ListMusic, Trash2, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deleteCuratedPlaylist,
  getMyCuratedPlaylists,
  importPlaylist,
  type MyCuratedPlaylist,
  updateCuratedPlaylist,
} from "@/lib/djLive";
import { trackEvent } from "@/lib/events";

type CsvFormat = "exportify" | "chosic";

/** Sniff the CSV tool by its header (admin importer precedent) — no manual toggle needed. */
function detectCsvFormat(text: string): CsvFormat | null {
  const header = (text.split(/\r?\n/, 1)[0] ?? "").toLowerCase();
  if (header.includes("track uri")) return "exportify";
  if (header.includes("spotify track id") || header.includes("camelot")) return "chosic";
  return null;
}

function nameFromFile(fileName: string): string {
  return fileName
    .replace(/\.csv$/i, "")
    .replace(/_/g, " ")
    .trim();
}

/**
 * Slice D — the DJ's playlist importer + Booth promotion list (rendered on /dj/booth beside the
 * Booth manager). The CSV is parsed CLIENT-side (@pika/shared parsers; the server only ever sees
 * validated rows) and lands in the curated catalog with provenance 'csv' → the "DJ's pick"
 * badge. `Show on Booth` is the one dial: it gates both the public native list AND whether the
 * playlist feeds the Signature. Re-uploading the same name accretes (Exportify + Chosic merge).
 */
export function PlaylistManager() {
  const [playlists, setPlaylists] = useState<MyCuratedPlaylist[]>([]);
  const [name, setName] = useState("");
  const [pendingCsv, setPendingCsv] = useState<{ format: CsvFormat; text: string } | null>(null);
  const [pendingSummary, setPendingSummary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The just-imported playlist id — powers the "Show on Booth now" nudge at the moment of
  // intent (import ≠ publish; without this the DJ uploads and sees… nothing change publicly).
  const [justImportedId, setJustImportedId] = useState<number | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const load = useCallback(() => {
    getMyCuratedPlaylists()
      .then((r) => setPlaylists(r.playlists))
      .catch(() => {});
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const onFile = useCallback(async (file: File) => {
    setError(null);
    setNotice(null);
    setJustImportedId(null);
    const text = await file.text();
    const format = detectCsvFormat(text);
    if (!format) {
      setPendingCsv(null);
      setPendingSummary(null);
      setError("That doesn't look like an Exportify or Chosic CSV.");
      return;
    }
    const parsed = format === "chosic" ? parseChosicCsv(text) : parseExportifyCsv(text);
    if (parsed.tracks.length === 0) {
      setPendingCsv(null);
      setPendingSummary(null);
      setError("No importable tracks found in that CSV.");
      return;
    }
    setPendingCsv({ format, text });
    setPendingSummary(
      `${parsed.tracks.length} tracks · ${parsed.tracks.filter((t) => t.features).length} with features (${format})`,
    );
    setName((n) => (n.trim().length > 0 ? n : nameFromFile(file.name)));
  }, []);

  const doImport = useCallback(async () => {
    if (!pendingCsv || name.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const parsed =
        pendingCsv.format === "chosic"
          ? parseChosicCsv(pendingCsv.text)
          : parseExportifyCsv(pendingCsv.text);
      const res = await importPlaylist({
        name: name.trim(),
        featuresSource: pendingCsv.format,
        tracks: parsed.tracks,
      });
      trackEvent("playlist_imported", {
        format: pendingCsv.format,
        tracks: res.trackCount,
        features: res.featureCount,
      });
      setNotice(
        `Imported "${name.trim()}" — ${res.trackCount} tracks, ${res.featureCount} with features.`,
      );
      setJustImportedId(res.playlistId);
      setPendingCsv(null);
      setPendingSummary(null);
      setName("");
      if (fileInput.current) fileInput.current.value = "";
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }, [pendingCsv, name, load]);

  const togglePromote = useCallback(async (pl: MyCuratedPlaylist) => {
    const next = !pl.showOnBooth;
    setPlaylists((prev) => prev.map((p) => (p.id === pl.id ? { ...p, showOnBooth: next } : p))); // optimistic
    try {
      await updateCuratedPlaylist(pl.id, { showOnBooth: next });
      trackEvent("playlist_promoted", { on: next });
    } catch {
      setPlaylists((prev) =>
        prev.map((p) => (p.id === pl.id ? { ...p, showOnBooth: pl.showOnBooth } : p)),
      );
    }
  }, []);

  const saveLabel = useCallback(async (pl: MyCuratedPlaylist, label: string) => {
    setPlaylists((prev) => prev.map((p) => (p.id === pl.id ? { ...p, label } : p)));
    try {
      await updateCuratedPlaylist(pl.id, { label });
    } catch {
      /* best-effort; the list reloads on next mount */
    }
  }, []);

  const remove = useCallback(
    async (id: number) => {
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      try {
        await deleteCuratedPlaylist(id);
      } catch {
        load();
      }
    },
    [load],
  );

  // Derived from list state (single source of truth) — the optimistic promote flip is what
  // makes the nudge button swap to its "On your Booth ✓" confirmation.
  const justImported =
    justImportedId != null ? (playlists.find((p) => p.id === justImportedId) ?? null) : null;

  return (
    <section className="w-full rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4 flex items-center gap-2">
        <ListMusic size={14} className="text-purple-400" />
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-300">
          My playlists
        </h2>
      </div>

      {/* Import */}
      <div className="mb-6 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
          <FileUp size={12} /> Import an Exportify or Chosic CSV (auto-detected)
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          aria-label="Playlist CSV file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
          }}
          className="mb-2 block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-600 file:px-3 file:py-1.5 file:text-[10px] file:font-bold file:uppercase file:tracking-widest file:text-white hover:file:bg-purple-500"
        />
        {pendingSummary && (
          <p className="mb-2 text-[10px] font-bold text-emerald-400">{pendingSummary}</p>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            placeholder="Playlist name"
            aria-label="Playlist name"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-purple-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void doImport()}
            disabled={busy || !pendingCsv || name.trim().length === 0}
            className="rounded-lg bg-purple-600 px-4 text-xs font-bold text-white hover:bg-purple-500 disabled:opacity-40"
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>
        <p className="mt-2 text-[9px] text-slate-600">
          Re-uploading the same name merges (Exportify precision + Chosic ISRC/Camelot). Imports
          show as “DJ’s pick” — only live Pika sets earn the ⚡ badge.
        </p>
        {error && <p className="mt-2 text-[10px] italic text-red-400">{error}</p>}
        {notice && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-[10px] italic text-emerald-400">{notice}</p>
            {justImported && !justImported.showOnBooth && (
              <button
                type="button"
                onClick={() => void togglePromote(justImported)}
                className="rounded-full bg-emerald-600 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500"
              >
                Show on Booth now
              </button>
            )}
            {justImported?.showOnBooth && (
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                On your Booth ✓
              </span>
            )}
            {justImportedId == null && (
              <span className="text-[10px] italic text-emerald-400">
                Toggle it onto your Booth below.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Promotion list */}
      <ul className="space-y-1.5">
        {playlists.map((pl) => (
          <li key={pl.id} className="rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-slate-200">{pl.name}</span>
                  {pl.source === "profile" ? (
                    <span className="flex items-center gap-1 rounded-md bg-emerald-600/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-400">
                      <Zap size={8} /> Played live
                    </span>
                  ) : (
                    <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400">
                      DJ&apos;s pick
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-500">
                  {pl.trackCount} tracks · {pl.featureCount} with features
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void togglePromote(pl)}
                  aria-label={pl.showOnBooth ? "Hide from Booth" : "Show on Booth"}
                  className={`flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${
                    pl.showOnBooth
                      ? "bg-emerald-600/15 text-emerald-400 hover:bg-emerald-600/25"
                      : "bg-slate-800 text-slate-500 hover:bg-slate-700"
                  }`}
                >
                  {pl.showOnBooth ? <Eye size={12} /> : <EyeOff size={12} />}
                  {pl.showOnBooth ? "On Booth" : "Hidden"}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(pl.id)}
                  aria-label={`Remove playlist ${pl.name}`}
                  className="text-slate-500 hover:text-red-400"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
            {pl.showOnBooth && (
              <input
                type="text"
                defaultValue={pl.label ?? ""}
                maxLength={120}
                placeholder="Label shown on the Booth — e.g. Budafest 2026 · party set"
                aria-label={`Label for ${pl.name}`}
                onBlur={(e) => void saveLabel(pl, e.target.value.trim())}
                className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-[11px] text-slate-300 placeholder:text-slate-700 focus:border-purple-500 focus:outline-none"
              />
            )}
          </li>
        ))}
        {playlists.length === 0 && (
          <li className="text-[11px] text-slate-600">No playlists yet — import a CSV above.</li>
        )}
      </ul>
    </section>
  );
}
