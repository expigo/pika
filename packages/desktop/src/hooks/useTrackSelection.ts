import { useCallback, useEffect, useState } from "react";
import type { Track } from "../db/repositories/trackRepository";

/**
 * Hook for managing multi-track selection logic
 * Handles single-select, cmd/ctrl-toggle, shift-range selection, and select-all
 */
export function useTrackSelection(visibleTracks: Track[]) {
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);

  const clearSelection = useCallback(() => {
    setSelectedTrackIds(new Set());
    setLastSelectedIndex(null);
  }, []);

  const handleRowClick = useCallback(
    (e: React.MouseEvent, trackId: number, currentIndex: number) => {
      const isMetaKey = e.metaKey || e.ctrlKey;
      const isShiftKey = e.shiftKey;

      if (isMetaKey) {
        // Cmd/Ctrl+Click: Toggle individual selection
        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          if (next.has(trackId)) {
            next.delete(trackId);
          } else {
            next.add(trackId);
          }
          return next;
        });
        setLastSelectedIndex(currentIndex);
      } else if (isShiftKey && lastSelectedIndex !== null) {
        // Shift+Click: Range selection
        const start = Math.min(lastSelectedIndex, currentIndex);
        const end = Math.max(lastSelectedIndex, currentIndex);
        const rangeIds = visibleTracks.slice(start, end + 1).map((t) => t.id);
        setSelectedTrackIds((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => {
            next.add(id);
          });
          return next;
        });
      } else {
        // Plain click: Single select (clear others)
        setSelectedTrackIds(new Set([trackId]));
        setSelectedTrackId(trackId);
        setLastSelectedIndex(currentIndex);
      }
    },
    [visibleTracks, lastSelectedIndex],
  );

  // Keyboard shortcuts (Select All, Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Clear selection
      if (e.key === "Escape" && selectedTrackIds.size > 0) {
        clearSelection();
      }
      // Cmd/Ctrl+A: Select all visible tracks
      if ((e.metaKey || e.ctrlKey) && e.key === "a") {
        const activeEl = document.activeElement;
        const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA";
        if (!isInput && visibleTracks.length > 0) {
          e.preventDefault();
          const allIds = new Set(visibleTracks.map((t) => t.id));
          setSelectedTrackIds(allIds);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedTrackIds.size, visibleTracks, clearSelection]);

  return {
    selectedTrackIds,
    setSelectedTrackIds,
    selectedTrackId,
    setSelectedTrackId,
    clearSelection,
    handleRowClick,
  };
}
