"use client";

import { UserCheck, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { trackEvent } from "@/lib/events";

const JSON_CSRF = { "Content-Type": "application/json", "X-Pika-Client": "pika-web" } as const;

export type FollowSource = "live" | "recap" | "booth" | "interstitial";

interface FollowButtonProps {
  slug: string;
  djName: string;
  source: FollowSource;
  className?: string;
}

/**
 * Follow/unfollow a DJ (Slice C). Account-keyed: signed-in dancers toggle optimistically;
 * anonymous dancers route to the save-journal page with the intent riding the QUERY STRING —
 * it must survive the sign-in round trip (a magic link may open on another device), so
 * sessionStorage can never carry it.
 */
export function FollowButton({ slug, djName, source, className = "" }: FollowButtonProps) {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session) {
      setFollowing(null);
      return;
    }
    let cancelled = false;
    fetch(`${getApiBaseUrl()}/api/me/follows`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.follows) return;
        setFollowing((d.follows as { slug: string | null }[]).some((f) => f.slug === slug));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [session, slug]);

  const handleTap = async () => {
    trackEvent("follow_tapped", { source, following: following === true });
    if (!session) {
      router.push(`/my-likes/save?follow=${encodeURIComponent(slug)}&source=${source}`);
      return;
    }
    if (busy) return;
    const next = !(following === true);
    setFollowing(next); // optimistic
    setBusy(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/me/follows/${encodeURIComponent(slug)}`, {
        method: next ? "PUT" : "DELETE",
        credentials: "include",
        headers: JSON_CSRF,
        ...(next ? { body: JSON.stringify({ source }) } : {}),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      trackEvent(next ? "follow_completed" : "unfollowed", { source });
    } catch {
      setFollowing(!next); // roll back the optimistic flip
    } finally {
      setBusy(false);
    }
  };

  if (isPending) return null; // no flash of the wrong state while the session resolves

  const isFollowing = following === true;
  return (
    <button
      type="button"
      onClick={() => void handleTap()}
      aria-label={isFollowing ? `Unfollow ${djName}` : `Follow ${djName}`}
      aria-pressed={isFollowing}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
        isFollowing
          ? "bg-purple-500/20 border-purple-500/40 text-purple-300"
          : "bg-white/[0.03] border-white/10 text-slate-300 hover:text-white hover:bg-white/[0.06]"
      } ${className}`}
    >
      {isFollowing ? <UserCheck className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}
