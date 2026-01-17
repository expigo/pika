/**
 * TagEditor Component
 * Modal for editing track tags with preset suggestions
 */

import { Check, Plus, Tag, X } from "lucide-react";
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <Tag size={16} />
            Edit Tags
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.trackInfo}>
          <strong>{track.title || "Untitled"}</strong>
          <span style={styles.artist}>{track.artist || "Unknown"}</span>
        </div>

        {/* Current Tags */}
        <div style={styles.section}>
          <label style={styles.label}>Current Tags</label>
          <div style={styles.tagList}>
            {tags.length === 0 ? (
              <span style={styles.emptyText}>No tags yet</span>
            ) : (
              tags.map((tag) => (
                <TagPill key={tag} tag={tag} onRemove={() => handleRemoveTag(tag)} />
              ))
            )}
          </div>
        </div>

        {/* Add Custom Tag */}
        <div style={styles.section}>
          <label style={styles.label}>Add Custom Tag</label>
          <div style={styles.inputRow}>
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
              placeholder="Type a tag name..."
              style={styles.input}
            />
            <button
              type="button"
              onClick={() => handleAddTag(newTag)}
              disabled={!newTag.trim()}
              style={{
                ...styles.addButton,
                opacity: newTag.trim() ? 1 : 0.5,
              }}
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div style={styles.section}>
            <label style={styles.label}>Quick Add</label>
            <div style={styles.suggestionList}>
              {suggestions.slice(0, 8).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => handleAddTag(tag)}
                  style={styles.suggestionButton}
                >
                  <Plus size={12} />
                  {tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button type="button" onClick={onClose} style={styles.cancelButton}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={styles.saveButton}>
            <Check size={16} />
            {saving ? "Saving..." : "Save Tags"}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modal: {
    background: "#1e293b",
    borderRadius: "12px",
    border: "1px solid #334155",
    width: "400px",
    maxWidth: "90vw",
    overflow: "hidden",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "1rem",
    borderBottom: "1px solid #334155",
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    fontWeight: 600,
    fontSize: "1rem",
  },
  closeButton: {
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    cursor: "pointer",
    padding: "4px",
    display: "flex",
  },
  trackInfo: {
    padding: "0.75rem 1rem",
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    fontSize: "0.9rem",
  },
  artist: {
    color: "#64748b",
    fontSize: "0.8rem",
  },
  section: {
    padding: "1rem",
    borderBottom: "1px solid #334155",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    color: "#94a3b8",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  tagList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
    minHeight: "32px",
    alignItems: "center",
  },
  emptyText: {
    color: "#64748b",
    fontSize: "0.8rem",
    fontStyle: "italic",
  },
  inputRow: {
    display: "flex",
    gap: "8px",
  },
  input: {
    flex: 1,
    padding: "8px 12px",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "6px",
    color: "#e2e8f0",
    fontSize: "0.85rem",
    outline: "none",
  },
  addButton: {
    padding: "8px 12px",
    background: "rgba(99, 102, 241, 0.2)",
    border: "1px solid rgba(99, 102, 241, 0.4)",
    borderRadius: "6px",
    color: "#a5b4fc",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
  },
  suggestionList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  suggestionButton: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "9999px",
    color: "#94a3b8",
    fontSize: "0.75rem",
    cursor: "pointer",
    transition: "all 0.15s",
  },
  actions: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    padding: "1rem",
  },
  cancelButton: {
    padding: "8px 16px",
    background: "transparent",
    border: "1px solid #475569",
    borderRadius: "6px",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  saveButton: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
    border: "none",
    borderRadius: "6px",
    color: "#fff",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: "0.85rem",
  },
};
