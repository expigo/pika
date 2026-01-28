import { logger } from "@pika/shared";
import { useEffect, useRef } from "react";
import { useSWRConfig } from "swr";

interface UseWakeupSyncProps {
  forceReconnect: () => void;
  isEnabled?: boolean;
}

/**
 * HOOK: useWakeupSync
 * PURPOSE: Solves iOS "Sleep" issues where sockets die but state remains stale.
 * STRATEGY:
 * 1. Listen for 'visibilitychange' (User unlocks phone / switches tab back)
 * 2. Check time elapsed since last active
 * 3. If > 60s (STALE_THRESHOLD), force a "Hard Refresh":
 *    - Reconnect WebSocket
 *    - Re-fetch critical SWR keys (Polls, Tracks)
 */
export function useWakeupSync({ forceReconnect, isEnabled = true }: UseWakeupSyncProps) {
  const { mutate } = useSWRConfig();
  const lastVisibleRef = useRef<number>(Date.now());

  useEffect(() => {
    if (!isEnabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        const timeSinceLastActive = now - lastVisibleRef.current;
        const STALE_THRESHOLD_MS = 60000; // 60 seconds

        logger.debug("[WakeupSync] App foregrounded", {
          timeSinceLastActiveMs: timeSinceLastActive,
        });

        if (timeSinceLastActive > STALE_THRESHOLD_MS) {
          logger.info("[WakeupSync] Stale state detected (>60s sleep). Triggering Wake-up Sync.");

          // 1. Force Socket Reconnect (Race-guarded internally)
          forceReconnect();

          // 2. Invalidate Critical Data
          // We use a glob-like pattern or specific keys.
          // For now, listing specific critical endpoints.
          mutate(
            (key) => {
              // Match API endpoints that need freshness
              if (typeof key === "string") {
                return (
                  key.includes("/api/poll/active") ||
                  key.includes("/api/track/current") ||
                  key.includes("/api/sessions/")
                );
              }
              return false;
            },
            undefined,
            { revalidate: true },
          );
        }

        // Update ref
        lastVisibleRef.current = now;
      } else {
        // App went background
        lastVisibleRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isEnabled, forceReconnect, mutate]);
}
