"use client";

import { logger } from "@pika/shared";
import { useCallback, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { exportErrorCopy, getClientId } from "./journal-utils";
import type { ExportResponse, ExportState, JournalPlaylist } from "./types";

interface UseJournalExportArgs {
  isAccountMode: boolean;
  /** Fired with the fresh playlist on success — `useJournal.setPlaylist` stays the single writer. */
  onExported: (playlist: JournalPlaylist) => void;
}

interface UseJournalExportReturn {
  exportState: ExportState;
  handleExport: () => Promise<void>;
}

/** Journal → Spotify playlist export lifecycle (create/update + error copy). */
export function useJournalExport({
  isAccountMode,
  onExported,
}: UseJournalExportArgs): UseJournalExportReturn {
  const [exportState, setExportState] = useState<ExportState>({ phase: "idle" });

  const handleExport = useCallback(async () => {
    if (exportState.phase === "creating") return;
    const baseUrl = getApiBaseUrl();
    let url: string;
    if (isAccountMode) {
      url = `${baseUrl}/api/me/journal/playlist`;
    } else {
      const id = getClientId();
      if (!id) return;
      url = `${baseUrl}/api/client/${id}/likes/playlist`;
    }
    setExportState({ phase: "creating" });
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
      });

      if (response.ok) {
        const data: ExportResponse = await response.json();
        onExported({
          url: data.playlistUrl,
          trackCount: data.trackCount,
          updatedAt: new Date().toISOString(),
        });
        setExportState({ phase: "success", updated: data.updated });
        trackEvent(data.updated ? "journal_export_updated" : "journal_export_created", {
          trackCount: data.trackCount,
          matchedCount: data.matchedCount,
          totalLiked: data.totalLiked,
          account: isAccountMode,
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
  }, [exportState.phase, isAccountMode, onExported]);

  return { exportState, handleExport };
}
