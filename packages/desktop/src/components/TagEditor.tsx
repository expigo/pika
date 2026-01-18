/**
 * TagEditor Component
 * Modal for editing track tags with preset suggestions
 * Overhauled for "Pro" look with Tailwind and glassmorphism.
 */

import { Plus, Tag, X } from "lucide-react";
import { useEffect, useState } from "react";
import { type Track, trackRepository } from "../db/repositories/trackRepository";
import { TagPill } from "./TagPill";

// Preset tags for quick selection
const PRESET_TAGS = [
  "Blues",
  "Pop",
  "Slow",
  "Fast",
  "Opener",
  "Closer",
  "Competition",
  "Crowd-Pleaser",
];

interface Props {
  track: Track;
  onClose: () => void;
  onSave: (tags: string[]) => void;
}

export function TagEditor({ track, onClose, onSave }: Props) {
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Parse existing tags from track
  useEffect(() => {
    setTags(track.tags || []);

    // Load all existing tags for suggestions
    trackRepository.getAllTags().then(setExistingTags).catch(console.error);
  }, [track]);

  const handleAddTag = (tag: string) => {
    const normalized = tag.trim();
    if (normalized && !tags.includes(normalized)) {
      setTags([...tags, normalized]);
    }
    setNewTag("");
  };

  const handleRemoveTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  const handleSave = async () => {
    setSaving(true);
    const success = await trackRepository.updateTrackTags(track.id, tags);
    setSaving(false);
    if (success) {
      onSave(tags);
      onClose();
    }
  };

  // Suggestions: presets + existing tags not already selected
  const suggestions = [...PRESET_TAGS, ...existingTags]
    .filter((t, i, arr) => arr.indexOf(t) === i) // unique
    .filter((t) => !tags.some((existing) => existing.toLowerCase() === t.toLowerCase()));

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-[2000] animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-pika-surface-1 border border-white/5 rounded-3xl w-[440px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-pika-accent/10 flex items-center justify-center text-pika-accent border border-pika-accent/20">
              <Tag size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight leading-none">
                Curation Tags
              </h2>
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">
                Metadata Editor
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

        <div className="p-5 space-y-6">
          {/* Current Tags */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">
              Selected Tags
            </label>
            <div className="flex flex-wrap gap-2 min-h-[40px] p-3 bg-slate-950/30 rounded-2xl border border-white/5">
              {tags.length === 0 ? (
                <span className="text-xs text-slate-600 italic">No tags assigned yet</span>
              ) : (
                tags.map((tag) => (
                  <TagPill key={tag} tag={tag} onRemove={() => handleRemoveTag(tag)} />
                ))
              )}
            </div>
          </div>

          {/* Add Custom Tag */}
          <div className="space-y-3">
            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">
              Custom Addition
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag(newTag);
                  }
                }}
                placeholder="Type tag name..."
                className="flex-1 bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-200 focus:border-pika-accent transition-all outline-none placeholder:text-slate-700 shadow-inner"
              />
              <button
                type="button"
                onClick={() => handleAddTag(newTag)}
                disabled={!newTag.trim()}
                className="w-10 h-10 rounded-xl bg-pika-accent/10 flex items-center justify-center text-pika-accent border border-pika-accent/20 hover:bg-pika-accent hover:text-white transition-all disabled:opacity-30 disabled:pointer-events-none"
              >
                <Plus size={20} />
              </button>
            </div>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-none">
                Quick Suggestions
              </label>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 10).map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => handleAddTag(tag)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900/50 hover:bg-slate-800 border border-white/5 rounded-full text-[11px] font-bold text-slate-400 hover:text-slate-200 transition-all"
                  >
                    <Plus size={10} className="text-pika-accent" />
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-5 border-t border-white/5 bg-white/5 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-3 bg-white hover:bg-slate-100 text-slate-950 text-xs font-black rounded-2xl transition-all shadow-xl active:scale-95 disabled:opacity-50"
          >
            {saving ? "Commiting..." : "Sync Metadata"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TagEditor;
