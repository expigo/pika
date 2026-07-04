"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOutAndRotate } from "@/lib/identity";

/**
 * Ends the Better Auth session: clears the cookie AND invalidates the server-side session row
 * (so a copied token dies too), then sends the user to a logged-out view. Matters most on shared
 * venue/booth machines where a user shouldn't leave an open session behind — which is also why
 * this rotates the device's anonymous clientId (Slice B): post-logout likes on a shared machine
 * must not keep feeding the departed account's journal.
 */
export function LogoutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      await signOutAndRotate();
    } catch {
      // Even if the network call fails, fall through to the logged-out view.
    } finally {
      router.replace("/");
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={className ?? "text-sm text-slate-400 hover:text-slate-200 disabled:opacity-50"}
    >
      {busy ? "Logging out…" : "Log out"}
    </button>
  );
}
