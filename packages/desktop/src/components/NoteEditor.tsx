/**
 * NoteEditor Component
 * Modal for editing track notes
 * Overhauled for "Pro" look with Tailwind and glassmorphism.
 */

import { FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type Track, trackRepository } from "../db/repositories/trackRepository";

interface Props {
  track: Track;
  onClose: () => void;
  onSave: (notes: string | null) => void;
}

export function NoteEditor({ track, onClose, onSave }: Props) {
  const [notes, setNotes] = useState(track.notes || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setNotes(track.notes || "");
  }, [track]);

  const handleSave = async () => {
    setSaving(true);
    const trimmed = notes.trim() || null;
    const success = await trackRepository.updateTrackNotes(track.id, trimmed);
    setSaving(false);
    if (success) {
      onSave(trimmed);
      onClose();
    }
  };

  const handleClear = async () => {
    setSaving(true);
    const success = await trackRepository.updateTrackNotes(track.id, null);
    setSaving(false);
    if (success) {
      onSave(null);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[2000] animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-pika-surface-1 border border-white/5 rounded-3xl w-[480px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight leading-none">
                Track Intelligence
              </h2>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">
                Personal Notes & Field Guide
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:text-white hover:bg-white/5 transition-all"
          >
            <X size={20} />
          </button>
        </div>

        {/* Track Info Banner */}
        <div className="px-5 py-4 bg-slate-950/40 border-b border-white/5 space-y-0.5">
          <h3 className="text-sm font-bold text-slate-100 truncate">{track.title || "Untitled"}</h3>
          <p className="text-[11px] text-slate-500 font-medium truncate">
            {track.artist || "Unknown Artist"}
          </p>
        </div>

        <div className="p-5">
          <div className="relative group">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              placeholder="Add field notes... (e.g., transition energy, crowd reaction, specific phrasing tips)"
              className="w-full h-40 bg-slate-950 border border-white/10 rounded-2xl p-4 text-sm font-medium text-slate-200 focus:border-emerald-500/50 transition-all outline-none placeholder:text-slate-700 shadow-inner resize-none leading-relaxed"
              autoFocus
            />
            <div className="absolute bottom-4 right-4 text-[10px] font-bold text-slate-600 uppercase tracking-widest bg-slate-950/80 px-2 py-1 rounded border border-white/5">
              {notes.length} / 500
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-white/5 bg-white/5 flex items-center justify-between">
          <div className="flex gap-4">
            {track.notes && (
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] font-black text-red-500/70 hover:text-red-500 uppercase tracking-widest transition-colors"
              >
                Wipe Notes
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
            >
              Discard
            </button>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Intelligence"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default NoteEditor;
