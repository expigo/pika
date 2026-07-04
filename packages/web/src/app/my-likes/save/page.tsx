"use client";

import { AlertCircle, ArrowRight, BookHeart, Mail, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { authClient } from "@/lib/authClient";
import { trackEvent } from "@/lib/events";

/**
 * Dancer sign-in: one email, no password (magic link). The link must be opened on the device the
 * dancer wants their Journal on — the session cookie lands where the link is clicked.
 */
export default function SaveJournalPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // Already signed in → the journal page is the account surface.
  useEffect(() => {
    if (!isPending && session) router.replace("/my-likes");
  }, [isPending, session, router]);

  // Expired/reused link lands back here with ?error=link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "link") {
      setError("That link expired or was already used — send a fresh one.");
      window.history.replaceState(null, "", "/my-likes/save");
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { error: err } = await authClient.signIn.magicLink({
        email,
        callbackURL: `${origin}/my-likes?claimed=1`,
        newUserCallbackURL: `${origin}/my-likes?claimed=1&new=1`,
        errorCallbackURL: `${origin}/my-likes/save?error=link`,
      });
      if (err) {
        setError(err.message ?? "Couldn't send the link — try again in a minute.");
        return;
      }
      trackEvent("account_magic_link_requested");
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.12),transparent_70%)]" />
      </div>

      <ProCard className="relative max-w-md w-full rounded-[2.5rem]" glow glowColor="purple-500">
        {sent ? (
          <div className="p-10 sm:p-14 text-center space-y-8">
            <div className="w-20 h-20 bg-purple-500/10 border border-purple-500/20 rounded-3xl flex items-center justify-center mx-auto">
              <MailCheck className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
              Check your email
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed">
              We sent a sign-in link to
              <span className="block text-slate-300 normal-case mt-2">{email}</span>
            </p>
            <p className="text-[10px] font-black text-purple-400/80 uppercase tracking-[0.2em] leading-relaxed">
              Open the link on THIS device — your journal lives where the link is opened.
            </p>
            <button
              type="button"
              onClick={() => setSent(false)}
              className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-10 sm:p-14 space-y-10">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-purple-500/20">
                <BookHeart className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-3xl font-black text-white italic uppercase tracking-tighter">
                Save your journal
              </h1>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-[0.3em] leading-relaxed">
                One email, no password — your likes survive any device
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-4 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-bold uppercase tracking-[0.1em] backdrop-blur-xl">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="relative group">
              <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
              <input
                id="save-email"
                type="email"
                required
                placeholder="YOU@EXAMPLE.COM"
                aria-label="Email address"
                className="w-full bg-slate-950/80 border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-white placeholder-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/20 transition-all font-bold text-lg uppercase tracking-tight"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-6 px-8 bg-white text-slate-950 font-black uppercase text-[12px] tracking-[0.3em] rounded-2xl transition-all shadow-2xl hover:bg-slate-50 hover:scale-[1.01] transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-4"
            >
              {loading ? (
                "SENDING…"
              ) : (
                <>
                  Send my sign-in link
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </ProCard>
    </div>
  );
}
