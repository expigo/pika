"use client";

import { MailX } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { getApiBaseUrl } from "@/lib/api";

/**
 * Unsubscribe confirm page (Slice C). Mail clients that don't speak RFC 8058 open the header
 * URL in a browser — the cloud 302s them here with the token in the query. A HUMAN TAP posts
 * it back; the page never auto-fires on load (mail scanners prefetch links).
 */
export default function UnsubscribePage() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  const handleUnsubscribe = async () => {
    setState("working");
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/email/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
      <ProCard className="relative max-w-md w-full rounded-[2.5rem] p-10 sm:p-14 text-center space-y-8">
        <div className="w-20 h-20 bg-purple-500/10 border border-purple-500/20 rounded-3xl flex items-center justify-center mx-auto">
          <MailX className="w-8 h-8 text-purple-400" />
        </div>

        {state === "done" ? (
          <>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
              You&apos;re unsubscribed
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed">
              No more of these emails. You can turn them back on anytime from your journal.
            </p>
            <Link
              href="/my-likes"
              className="inline-block px-8 py-3 bg-white text-slate-950 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all hover:scale-105 active:scale-95"
            >
              Open your journal
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
              Stop these emails?
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed">
              One tap and we stop sending this type of email to your address.
            </p>
            {state === "error" && (
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-widest">
                That link didn&apos;t work — it may be malformed. Manage emails from your journal
                instead.
              </p>
            )}
            <button
              type="button"
              onClick={() => void handleUnsubscribe()}
              disabled={state === "working" || token.length === 0}
              className="w-full py-5 px-8 bg-white text-slate-950 font-black uppercase text-[12px] tracking-[0.3em] rounded-2xl transition-all hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
            >
              {state === "working" ? "Working…" : "Unsubscribe"}
            </button>
          </>
        )}
      </ProCard>
    </div>
  );
}
