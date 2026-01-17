/**
 * NoteEditor Component
 * Inline editor for DJ personal notes on a track
 */

import { Check, FileText, X } from "lucide-react";
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            <FileText size={16} />
            Track Notes
          </div>
          <button type="button" onClick={onClose} style={styles.closeButton}>
            <X size={18} />
          </button>
        </div>

        <div style={styles.trackInfo}>
          <strong>{track.title || "Untitled"}</strong>
          <span style={styles.artist}>{track.artist || "Unknown"}</span>
        </div>

        <div style={styles.editorSection}>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            placeholder="Add notes about this track... (e.g., crowd reaction, when to play, transitions)"
            style={styles.textarea}
            autoFocus
          />
          <div style={styles.charCount}>{notes.length}/500</div>
        </div>

        <div style={styles.actions}>
          {track.notes && (
            <button
              type="button"
              onClick={handleClear}
              disabled={saving}
              style={styles.clearButton}
            >
              Clear Notes
            </button>
          )}
          <div style={styles.spacer} />
          <button type="button" onClick={onClose} style={styles.cancelButton}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} disabled={saving} style={styles.saveButton}>
            <Check size={16} />
            {saving ? "Saving..." : "Save"}
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
    width: "450px",
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
  editorSection: {
    padding: "1rem",
    position: "relative",
  },
  textarea: {
    width: "100%",
    height: "120px",
    padding: "12px",
    background: "#0f172a",
    border: "1px solid #334155",
    borderRadius: "8px",
    color: "#e2e8f0",
    fontSize: "0.9rem",
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
    lineHeight: 1.5,
  },
  charCount: {
    position: "absolute",
    bottom: "1.5rem",
    right: "1.5rem",
    fontSize: "0.7rem",
    color: "#64748b",
  },
  actions: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "1rem",
    borderTop: "1px solid #334155",
  },
  clearButton: {
    padding: "8px 16px",
    background: "rgba(239, 68, 68, 0.1)",
    border: "1px solid rgba(239, 68, 68, 0.3)",
    borderRadius: "6px",
    color: "#ef4444",
    cursor: "pointer",
    fontSize: "0.85rem",
  },
  spacer: {
    flex: 1,
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
