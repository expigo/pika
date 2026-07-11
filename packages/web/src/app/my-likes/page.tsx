"use client";

import { BookHeart, Heart } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ProCard } from "@/components/ui/ProCard";
import { getApiBaseUrl } from "@/lib/api";
import { authClient } from "@/lib/authClient";
import { isStandalone } from "@/lib/client";
import { trackEvent } from "@/lib/events";
import { clearAccountHint, setAccountHint, signOutAndRotate } from "@/lib/identity";
import { AccountCard } from "./AccountCard";
import { EmptyState } from "./EmptyState";
import { ExportCard } from "./ExportCard";
import { JournalEntries } from "./JournalEntries";
import { getClientId, isIosBrowser } from "./journal-utils";
import type { FollowedDj } from "./types";
import { useJournal } from "./useJournal";
import { useJournalExport } from "./useJournalExport";

export default function MyLikesPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const isAccountMode = !!session;
  const [showNudge, setShowNudge] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Shared refetch bus: the landing-intent writes and device unlink bump it to silently
  // re-run the journal fetch (useJournal) and the prefs/follows fetch below.
  const [reloadTick, setReloadTick] = useState(0);
  const refetch = useCallback(() => setReloadTick((t) => t + 1), []);
  // Slice C — account-card extras: marketing-email consent + the followed-DJ list.
  const [prefs, setPrefs] = useState<{ recapEmails: boolean } | null>(null);
  const [follows, setFollows] = useState<FollowedDj[]>([]);
  const nudgeFired = useRef(false);
  const saveCardFired = useRef(false);

  // Magic-link landing / account deletion callbacks (?claimed=1 / ?deleted=1) + Slice C intent
  // params (?follow= / ?consent=1) that survived the sign-in round trip via the callbackURL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const claimed = params.get("claimed");
    const deleted = params.get("deleted");
    const follow = params.get("follow");
    const source = params.get("source");
    const consent = params.get("consent");
    if (claimed) {
      setAccountHint();
      trackEvent("account_linked", { newUser: params.get("new") === "1" });
      toast("Journal saved to your account ✓");
    }
    if (deleted) {
      clearAccountHint();
      toast("Account deleted — likes on this device are anonymous again");
    }
    // Intent params may arrive WITHOUT claimed=1 (already-signed-in redirect from /save).
    // Both writes are idempotent and best-effort — the account card offers manual paths.
    //
    // On `?consent=1` driving a consent write from a URL param: this is deliberate and load-
    // bearing — the magic link may be opened on a DIFFERENT device, so the checkbox choice can't
    // ride in sessionStorage; it survives the round trip as a query param instead. It's safe to
    // leave as-is: the write is self-scoped (requireAuth — only ever affects the caller's own
    // account), fully reversible (one-click unsubscribe + the card toggle), and the param is
    // stripped from the URL below so it can't re-fire on refresh/bookmark. Do NOT "harden" this
    // into a confirm step without a replacement for the cross-device consent path.
    if (consent === "1") {
      fetch(`${getApiBaseUrl()}/api/me/preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
        body: JSON.stringify({ recapEmails: true }),
      })
        .then((r) => {
          if (r.ok) {
            trackEvent("email_prefs_updated", { recapEmails: true, via: "signin" });
            setReloadTick((t) => t + 1); // refresh the card's toggle state
          }
        })
        .catch(() => {});
    }
    if (follow) {
      fetch(`${getApiBaseUrl()}/api/me/follows/${encodeURIComponent(follow)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
        body: JSON.stringify({ source: "signin" }),
      })
        .then((r) => {
          if (r.ok) {
            trackEvent("follow_completed", { via: "signin", ...(source ? { source } : {}) });
            toast("Following ✓ — your DJs live on this page");
            setReloadTick((t) => t + 1);
          }
        })
        .catch(() => {});
    }
    if (claimed || deleted || follow || consent) {
      window.history.replaceState(null, "", "/my-likes");
    }
  }, []);

  const sessionUserId = session?.user?.id ?? null;

  // Slice C: the account card's consent toggle + "Your DJs" list (account mode only).
  useEffect(() => {
    void reloadTick; // the landing-effect intent writes bump this to refresh
    if (!sessionUserId) {
      setPrefs(null);
      setFollows([]);
      return;
    }
    let cancelled = false;
    const base = getApiBaseUrl();
    fetch(`${base}/api/me/preferences`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d) setPrefs({ recapEmails: !!d.recapEmails });
      })
      .catch(() => {});
    fetch(`${base}/api/me/follows`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.follows) setFollows(d.follows as FollowedDj[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionUserId, reloadTick]);

  const handleToggleRecapEmails = async () => {
    if (!prefs) return;
    const next = !prefs.recapEmails;
    setPrefs({ recapEmails: next }); // optimistic
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/me/preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
        body: JSON.stringify({ recapEmails: next }),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      trackEvent("email_prefs_updated", { recapEmails: next });
    } catch {
      setPrefs({ recapEmails: !next });
      toast("Couldn't update email preferences — try again");
    }
  };

  const handleUnfollow = async (slug: string | null) => {
    if (!slug) return;
    const prev = follows;
    setFollows(prev.filter((f) => f.slug !== slug)); // optimistic
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/me/follows/${encodeURIComponent(slug)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-Pika-Client": "pika-web" },
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      trackEvent("unfollowed", { source: "journal" });
    } catch {
      setFollows(prev);
      toast("Couldn't unfollow — try again");
    }
  };

  const {
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
  } = useJournal({ sessionPending, sessionUserId, isAccountMode, reloadTick, refetch });

  const { exportState, handleExport } = useJournalExport({
    isAccountMode,
    onExported: setPlaylist,
  });

  // ITP mitigation: a non-installed browser can evict this device's journal identity —
  // surface the install nudge (the interactive InstallPrompt is mounted globally).
  useEffect(() => {
    if (!isStandalone()) {
      setShowNudge(true);
      if (!nudgeFired.current) {
        nudgeFired.current = true;
        trackEvent("install_nudge_shown");
      }
    }
  }, []);

  // Upsell telemetry: the save card is the primary account funnel entry — fire once per view.
  useEffect(() => {
    if (!sessionPending && !isAccountMode && !loading && total > 0 && !saveCardFired.current) {
      saveCardFired.current = true;
      trackEvent("account_save_card_shown");
    }
  }, [sessionPending, isAccountMode, loading, total]);

  const handleSignOut = useCallback(async () => {
    trackEvent("account_signed_out");
    await signOutAndRotate();
    window.location.reload(); // full state reset back to the device view
  }, []);

  // GDPR: email-confirmed deletion (dancers have no password; 30d sessions are never "fresh").
  const handleDeleteAccount = useCallback(async () => {
    setConfirmingDelete(false);
    trackEvent("account_deletion_requested");
    try {
      const { error: err } = await authClient.deleteUser({
        callbackURL: `${window.location.origin}/my-likes?deleted=1`,
      });
      if (err) toast.error("Couldn't start deletion — try again");
      else toast("Check your email to confirm deletion");
    } catch {
      toast.error("Couldn't start deletion — try again");
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-bold tracking-widest text-xs uppercase">
          Opening Your Journal...
        </div>
      </div>
    );
  }

  if (error === "no_likes" || (!loading && total === 0 && entries.length === 0)) {
    return (
      <EmptyState
        email={session ? session.user.email : null}
        confirmingDelete={confirmingDelete}
        onSignOut={handleSignOut}
        onArmDelete={() => setConfirmingDelete(true)}
        onDeleteAccount={handleDeleteAccount}
      />
    );
  }

  const currentClientId = getClientId();
  const remaining = Math.max(0, total - entries.length);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-[800px] h-[800px] bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.15),transparent_70%)] opacity-70" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-12">
        {/* HEADER CARD */}
        <ProCard className="mb-8 p-12 text-center" glow align="center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-500 to-pink-600 rounded-[2.5rem] mb-6 shadow-2xl shadow-red-500/20">
            <Heart className="w-10 h-10 text-white fill-current" />
          </div>
          <h1 className="text-4xl font-black text-white mb-4 tracking-tighter italic uppercase">
            JOURNAL.
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-[10px] mb-8">
            Personal Connection Archive
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-1 bg-white/[0.03] border border-white/10 rounded-full">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {total} MOMENTS CAPTURED
            </span>
          </div>
        </ProCard>

        {session && (
          <AccountCard
            email={session.user.email}
            claimedCount={claimedCount}
            devices={devices}
            currentClientId={currentClientId}
            follows={follows}
            prefs={prefs}
            confirmingDelete={confirmingDelete}
            onSignOut={handleSignOut}
            onArmDelete={() => setConfirmingDelete(true)}
            onDeleteAccount={handleDeleteAccount}
            onUnlinkDevice={unlinkDevice}
            onToggleRecapEmails={handleToggleRecapEmails}
            onUnfollow={handleUnfollow}
          />
        )}

        {/* SAVE-JOURNAL CARD (signed out) — the account upsell at the moment of value */}
        {!session && !sessionPending && (
          <ProCard className="mb-8 p-6" glow glowColor="purple-500">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center shrink-0">
                  <BookHeart className="w-5 h-5 text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h2 className="font-black text-white uppercase text-xs tracking-wider leading-none mb-1">
                    Never lose this
                  </h2>
                  <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter">
                    Your journal lives only on this device — save it to an account
                  </p>
                </div>
              </div>
              <Link
                href="/my-likes/save"
                className="inline-flex items-center gap-2 px-5 py-3 bg-white text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] hover:scale-105 active:scale-95 transition-all shrink-0"
              >
                Save my journal
              </Link>
            </div>
          </ProCard>
        )}

        <ExportCard
          playlist={playlist}
          exportState={exportState}
          isAccountMode={isAccountMode}
          onExport={handleExport}
        />

        <JournalEntries
          entries={entries}
          remaining={remaining}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onRemove={removeLike}
        />

        {/* KEEP-IT-SAFE NUDGE (ITP: non-installed browsers can evict this device's journal id).
            Suppressed when signed in — the HttpOnly session cookie is the ITP-exempt anchor and
            this device's likes are claimed. */}
        {showNudge && !isAccountMode && (
          <ProCard className="mt-12 p-6 text-center" align="center">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.3em] mb-2">
              📌 Keep your journal safe
            </p>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
              Best protection:{" "}
              <Link href="/my-likes/save" className="text-purple-400 underline">
                save your journal to an account
              </Link>
              {isIosBrowser()
                ? ". Also: add Pika to your Home Screen (Share → Add to Home Screen) — Safari clears data for sites you haven't visited in a while."
                : ". Also: install Pika from your browser menu so this device keeps your journal between events."}
            </p>
          </ProCard>
        )}

        <div className="mt-24 text-center pb-32">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-2">
            The Neural Fiber of the Handshake
          </p>
          <p className="text-[9px] font-bold text-slate-700 italic uppercase tracking-widest opacity-60">
            Your Synchronized Dance History
          </p>
        </div>
      </div>
    </div>
  );
}
