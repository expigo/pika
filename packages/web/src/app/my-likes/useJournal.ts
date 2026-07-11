"use client";

import { logger } from "@pika/shared";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { getApiBaseUrl } from "@/lib/api";
import { trackEvent } from "@/lib/events";
import { ensureClientIdClaimed } from "@/lib/identity";
import { getClientId } from "./journal-utils";
import type { ClaimedDevice, JournalPlaylist, LikedTrack, LikesResponse } from "./types";

const PAGE_SIZE = 100;

interface UseJournalArgs {
  sessionPending: boolean;
  sessionUserId: string | null;
  isAccountMode: boolean;
  /** Shared refetch bus — the page owns the tick (landing-intent writes bump it too). */
  reloadTick: number;
  refetch: () => void;
}

interface UseJournalReturn {
  entries: LikedTrack[];
  total: number;
  claimedCount: number;
  devices: ClaimedDevice[];
  playlist: JournalPlaylist | null;
  /** Export success writes the fresh playlist through this (single-writer stays here). */
  setPlaylist: Dispatch<SetStateAction<JournalPlaylist | null>>;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  removeLike: (like: LikedTrack) => Promise<void>;
  unlinkDevice: (clientId: string) => Promise<void>;
}

/** Journal data: the union/device fetch, pagination, like removal, and linked devices. */
export function useJournal({
  sessionPending,
  sessionUserId,
  isAccountMode,
  reloadTick,
  refetch,
}: UseJournalArgs): UseJournalReturn {
  const [entries, setEntries] = useState<LikedTrack[]>([]);
  const [total, setTotal] = useState(0);
  const [claimedCount, setClaimedCount] = useState(0);
  const [playlist, setPlaylist] = useState<JournalPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<ClaimedDevice[]>([]);
  const openedFired = useRef(false);

  useEffect(() => {
    void reloadTick; // refetch trigger — device unlink bumps it to re-run this effect
    if (sessionPending) return; // gate the initial fetch — never double-fetch the device view
    let cancelled = false;

    async function load() {
      const baseUrl = getApiBaseUrl();

      // ACCOUNT MODE: bind this device's id to the account, then read the union journal.
      if (sessionUserId) {
        const claim = await ensureClientIdClaimed();
        if (claim === "rotated_and_claimed" && !cancelled) {
          toast("New device identity minted — your journal is safe on your account");
        }
        try {
          const response = await fetch(`${baseUrl}/api/me/journal?limit=${PAGE_SIZE}&offset=0`, {
            credentials: "include",
          });
          if (cancelled) return;
          if (!response.ok) {
            setError("fetch_failed");
            return;
          }
          const data: LikesResponse = await response.json();
          setEntries(data.likes);
          setTotal(data.totalLikes);
          setClaimedCount(data.claimedCount ?? 0);
          setDevices(data.devices ?? []);
          setPlaylist(data.playlist ?? null);
          if (!openedFired.current) {
            openedFired.current = true;
            trackEvent("journal_opened", { totalLikes: data.totalLikes, account: true });
          }
        } catch (e) {
          if (!cancelled) {
            logger.error("Failed to fetch account journal", e);
            setError("network_error");
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      // DEVICE MODE (signed out) — unchanged read-only clientId flow.
      const id = getClientId();
      if (!id) {
        setLoading(false);
        setError("no_likes");
        if (!openedFired.current) {
          openedFired.current = true;
          trackEvent("journal_opened", { totalLikes: 0 });
        }
        return;
      }
      try {
        const response = await fetch(
          `${baseUrl}/api/client/${id}/likes?limit=${PAGE_SIZE}&offset=0`,
        );
        if (cancelled) return;
        if (!response.ok) {
          setError("fetch_failed");
          return;
        }
        const data: LikesResponse = await response.json();
        setEntries(data.likes);
        setTotal(data.totalLikes);
        setPlaylist(data.playlist ?? null);
        if (!openedFired.current) {
          openedFired.current = true;
          trackEvent("journal_opened", { totalLikes: data.totalLikes });
        }
      } catch (e) {
        if (!cancelled) {
          logger.error("Failed to fetch likes", e);
          setError("network_error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [sessionPending, sessionUserId, reloadTick]);

  const loadMore = useCallback(async () => {
    if (loadingMore) return;
    const baseUrl = getApiBaseUrl();
    let url: string;
    if (isAccountMode) {
      url = `${baseUrl}/api/me/journal?limit=${PAGE_SIZE}&offset=${entries.length}`;
    } else {
      const id = getClientId();
      if (!id) return;
      url = `${baseUrl}/api/client/${id}/likes?limit=${PAGE_SIZE}&offset=${entries.length}`;
    }
    setLoadingMore(true);
    trackEvent("journal_load_more", { offset: entries.length, account: isAccountMode });
    try {
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) return;
      const data: LikesResponse = await response.json();
      setTotal(data.totalLikes);
      setEntries((prev) => {
        // New likes shift DESC offsets between pages — dedupe by like id on append.
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...data.likes.filter((l) => !seen.has(l.id))];
      });
    } catch (e) {
      logger.error("Failed to load more likes", e);
    } finally {
      setLoadingMore(false);
    }
  }, [entries.length, loadingMore, isAccountMode]);

  const removeLike = useCallback(
    async (like: LikedTrack) => {
      const baseUrl = getApiBaseUrl();
      let url: string;
      if (isAccountMode) {
        url = `${baseUrl}/api/me/journal/likes/${like.id}`;
      } else {
        const id = getClientId();
        if (!id) return;
        url = `${baseUrl}/api/client/${id}/likes/${like.id}`;
      }
      try {
        const response = await fetch(url, {
          method: "DELETE",
          credentials: "include",
          headers: { "X-Pika-Client": "pika-web" },
        });
        if (!response.ok) {
          toast.error("Couldn't remove — try again");
          return;
        }
        const data = (await response.json()) as { totalLikes: number };
        setEntries((prev) => prev.filter((e) => e.id !== like.id));
        setTotal(data.totalLikes);
        trackEvent("journal_removed_like", { sessionId: like.sessionId ?? undefined });
        toast(
          playlist
            ? "Removed from Journal 💔 — update your playlist to sync"
            : "Removed from Journal 💔",
        );
      } catch (e) {
        logger.error("Failed to remove like", e);
        toast.error("Couldn't remove — try again");
      }
    },
    [playlist, isAccountMode],
  );

  const unlinkDevice = useCallback(
    async (clientId: string) => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/me/journal/devices/${clientId}`, {
          method: "DELETE",
          credentials: "include",
          headers: { "X-Pika-Client": "pika-web" },
        });
        if (!response.ok) {
          toast.error("Couldn't unlink — try again");
          return;
        }
        trackEvent("account_device_unlinked");
        toast("Device unlinked — its likes stay on that device");
        refetch(); // union + device list changed → silent refetch
      } catch {
        toast.error("Couldn't unlink — try again");
      }
    },
    [refetch],
  );

  return {
    entries,
    total,
    claimedCount,
    devices,
    playlist,
    setPlaylist,
    loading,
    loadingMore,
    error,
    loadMore,
    removeLike,
    unlinkDevice,
  };
}
