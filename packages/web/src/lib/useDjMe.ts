"use client";

import { useEffect, useState } from "react";
import { type DjUser, getMe } from "@/lib/djLive";

export type DjGatePhase = "loading" | "anon" | "pending" | "ready";

/**
 * The DJ-workspace gate (extracted from /dj/live in D.1, shared with /dj/booth): resolves the
 * signed-in DJ via getMe() and phases loading → anon | pending | ready. `beforeReady` (a
 * render-stable callback) runs before the ready flip so a page can prefetch its state without
 * flashing the wrong UI (the live page awaits its first status poll this way).
 */
export function useDjMe(beforeReady?: () => Promise<void>): {
  phase: DjGatePhase;
  user: DjUser | null;
} {
  const [phase, setPhase] = useState<DjGatePhase>("loading");
  const [user, setUser] = useState<DjUser | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const me = await getMe().catch(() => null);
      if (!active) return;
      if (!me) return setPhase("anon");
      setUser(me);
      if (me.status === "pending") return setPhase("pending");
      if (beforeReady) await beforeReady();
      if (active) setPhase("ready");
    })();
    return () => {
      active = false;
    };
  }, [beforeReady]);

  return { phase, user };
}
