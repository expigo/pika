"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { getOrCreateClientId } from "@/lib/client";
import { trackEvent } from "@/lib/events";
import { FollowButton } from "./FollowButton";

interface SessionSummary {
  djName: string | null;
  djSlug: string | null;
  likedCount: number;
}

interface SessionEndedInterstitialProps {
  /** Pre-reset snapshot from useLiveListener — live state is wiped before `sessionEnded` flips. */
  summary: SessionSummary | null;
  /** Present only in targeted-session mode (gates the thanks + recap actions). */
  sessionId?: string;
}

/**
 * End-of-set interstitial (Slice C) — the conversion moment. Renders from the SNAPSHOT, never
 * live state (SESSION_ENDED nulls djName and empties likes before setting the ended flag).
 * Signed-in dancers get thank-the-DJ + Follow; signed-out dancers get the save CTA with the
 * follow intent riding the query string (it survives the sign-in round trip).
 */
export function SessionEndedInterstitial({ summary, sessionId }: SessionEndedInterstitialProps) {
  const { data: session } = authClient.useSession();
  const [thanked, setThanked] = useState(false);
  const shownFired = useRef(false);

  useEffect(() => {
    if (!shownFired.current) {
      shownFired.current = true;
      trackEvent("interstitial_shown", { likedCount: summary?.likedCount ?? 0 });
    }
  }, [summary]);

  const handleThanks = async () => {
    if (thanked || !sessionId) return;
    setThanked(true); // one-shot: optimistic + disables (the DB unique absorbs repeats anyway)
    try {
      const clientId = getOrCreateClientId();
      const res = await fetch(
        `${getApiBaseUrl()}/api/client/${encodeURIComponent(clientId)}/sessions/${encodeURIComponent(sessionId)}/thanks`,
        { method: "POST", headers: { "X-Pika-Client": "pika-web" } },
      );
      if (res.ok) trackEvent("thanks_sent", { at: "interstitial" });
    } catch {
      // best-effort — stays disabled; the recap page offers the same action
    }
  };

  const liked = summary?.likedCount ?? 0;
  const djName = summary?.djName ?? null;
  const djSlug = summary?.djSlug ?? null;

  return (
    <div className="text-center animate-in fade-in duration-500">
      <div className="w-20 h-20 bg-slate-900 border-2 border-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 shadow-2xl">
        <Heart className="w-10 h-10 text-purple-500" />
      </div>
      <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">
        Set&apos;s over
      </h2>
      <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] mb-8">
        {liked > 0
          ? `You loved ${liked} song${liked === 1 ? "" : "s"} tonight`
          : "Thanks for dancing!"}
      </p>

      <div className="flex flex-col items-center gap-3">
        {sessionId && (
          <button
            type="button"
            onClick={() => void handleThanks()}
            disabled={thanked}
            className="w-full max-w-[280px] py-4 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/20 rounded-2xl text-purple-400 text-[10px] font-black uppercase tracking-[0.3em] transition-all active:scale-[0.98] disabled:opacity-60 select-none"
          >
            {thanked ? "THANKS SENT! 🦄" : `THANK ${djName ? djName.toUpperCase() : "THE DJ"} 🦄`}
          </button>
        )}

        {/* Signed-in: direct Follow. Signed-out: the save CTA below carries the intent. */}
        {session && djSlug && djName && (
          <FollowButton slug={djSlug} djName={djName} source="interstitial" />
        )}

        {!session && (
          <Link
            href={`/my-likes/save?source=interstitial${djSlug ? `&follow=${encodeURIComponent(djSlug)}` : ""}`}
            className="px-8 py-3 bg-white text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
          >
            Save your night + get your recap
          </Link>
        )}

        {sessionId && (
          <Link
            href={`/recap/${sessionId}`}
            className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-purple-500/20 hover:scale-105 active:scale-95"
          >
            View Full Recap
          </Link>
        )}
      </div>
    </div>
  );
}
