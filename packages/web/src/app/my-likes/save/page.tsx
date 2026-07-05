"use client";

import { AlertCircle, ArrowRight, BookHeart, KeyRound, Mail, MailCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { authClient } from "@/lib/authClient";
import { isStandalone } from "@/lib/client";
import { trackEvent } from "@/lib/events";

/**
 * Dancer sign-in: one email, no password. Two mechanisms for one reason — cookie jars:
 *  - magic LINK: browsers. The session lands where the link is opened.
 *  - email CODE: the installed PWA. Mail links always open in the browser, and an installed
 *    app's cookie jar is unreachable from there (iOS partitions them) — a code typed inside
 *    the app mints the session in the right jar. Standalone display-mode defaults to code.
 */
export default function SaveJournalPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [mode, setMode] = useState<"link" | "code">("link");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // Slice C: follow intent arrives as query params and must survive the sign-in round trip via
  // the callbackURL query string — a magic link may be opened on a DIFFERENT device, so
  // sessionStorage can never carry it. Consent is an unticked checkbox (pre-ticked ≠ consent).
  const [intent, setIntent] = useState<{ follow: string | null; source: string | null }>({
    follow: null,
    source: null,
  });
  const [recapConsent, setRecapConsent] = useState(false);

  // Effect-set (not useState init) — isStandalone() differs between SSR and client render.
  useEffect(() => {
    if (isStandalone()) setMode("code");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const follow = params.get("follow");
    const source = params.get("source");
    if (follow || source) setIntent({ follow, source });
  }, []);

  /** The landing-page query string: base params + whatever intent must survive sign-in. */
  const landingQuery = (base: Record<string, string>): string => {
    const q = new URLSearchParams(base);
    if (intent.follow) q.set("follow", intent.follow);
    if (intent.source) q.set("source", intent.source);
    if (recapConsent) q.set("consent", "1");
    return q.toString();
  };

  // Already signed in → the journal page is the account surface. Forward any intent params —
  // dropping them here would silently lose a follow tapped by a signed-in-elsewhere dancer.
  useEffect(() => {
    if (!isPending && session) {
      const params = new URLSearchParams(window.location.search);
      const forward = new URLSearchParams();
      for (const k of ["follow", "source", "consent"]) {
        const v = params.get(k);
        if (v) forward.set(k, v);
      }
      const qs = forward.toString();
      router.replace(qs.length > 0 ? `/my-likes?${qs}` : "/my-likes");
    }
  }, [isPending, session, router]);

  // Expired/reused link lands back here with ?error=link.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "link") {
      setError("That link expired or was already used — send a fresh one.");
      window.history.replaceState(null, "", "/my-likes/save");
    }
  }, []);

  const sendCode = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await authClient.emailOtp.sendVerificationOtp({
        email,
        type: "sign-in",
      });
      if (err) {
        setError(err.message ?? "Couldn't send the code — try again in a minute.");
        return;
      }
      trackEvent("account_otp_requested");
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const sendLink = async () => {
    setError(null);
    setLoading(true);
    try {
      const origin = window.location.origin;
      const { error: err } = await authClient.signIn.magicLink({
        email,
        callbackURL: `${origin}/my-likes?${landingQuery({ claimed: "1" })}`,
        newUserCallbackURL: `${origin}/my-likes?${landingQuery({ claimed: "1", new: "1" })}`,
        errorCallbackURL: `${origin}/my-likes/save?${landingQuery({ error: "link" })}`,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await (mode === "code" ? sendCode() : sendLink());
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await authClient.signIn.emailOtp({ email, otp: code.trim() });
      if (err) {
        setError(err.message ?? "That code didn't work — check it or send a new one.");
        return;
      }
      router.replace(`/my-likes?${landingQuery({ claimed: "1" })}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const startOver = () => {
    setSent(false);
    setCode("");
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[700px] h-[700px] bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.12),transparent_70%)]" />
      </div>

      <ProCard className="relative max-w-md w-full rounded-[2.5rem]" glow glowColor="purple-500">
        {sent && mode === "link" ? (
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
              onClick={startOver}
              className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : sent ? (
          <form onSubmit={handleVerifyCode} className="p-10 sm:p-14 space-y-8 text-center">
            <div className="w-20 h-20 bg-purple-500/10 border border-purple-500/20 rounded-3xl flex items-center justify-center mx-auto">
              <KeyRound className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter">
              Enter your code
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest leading-relaxed">
              We emailed a 6-digit code to
              <span className="block text-slate-300 normal-case mt-2">{email}</span>
            </p>

            {error && (
              <div className="flex items-center gap-4 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-bold uppercase tracking-[0.1em] backdrop-blur-xl text-left">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                {error}
              </div>
            )}

            <input
              id="save-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              placeholder="••••••"
              aria-label="Sign-in code"
              className="w-full bg-slate-950/80 border border-white/5 rounded-2xl py-5 px-6 text-white text-center placeholder-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/20 transition-all font-black text-3xl tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full py-6 px-8 bg-white text-slate-950 font-black uppercase text-[12px] tracking-[0.3em] rounded-2xl transition-all shadow-2xl hover:bg-slate-50 hover:scale-[1.01] transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-4"
            >
              {loading ? "SIGNING IN…" : "Sign in"}
            </button>

            <div className="flex items-center justify-center gap-6">
              <button
                type="button"
                onClick={() => void sendCode()}
                className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors"
              >
                Send a new code
              </button>
              <button
                type="button"
                onClick={startOver}
                className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors"
              >
                Different email
              </button>
            </div>
          </form>
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
              {intent.follow && (
                <p className="text-[10px] font-black text-purple-400/80 uppercase tracking-[0.2em]">
                  We'll follow the DJ for you right after you sign in
                </p>
              )}
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

            <label className="flex items-start gap-3 text-left cursor-pointer select-none">
              <input
                type="checkbox"
                checked={recapConsent}
                onChange={(e) => setRecapConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-white/10 bg-slate-950 accent-purple-500"
              />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                Email me my night recaps — one per night out, unsubscribe anytime
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-6 px-8 bg-white text-slate-950 font-black uppercase text-[12px] tracking-[0.3em] rounded-2xl transition-all shadow-2xl hover:bg-slate-50 hover:scale-[1.01] transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-4"
            >
              {loading ? (
                "SENDING…"
              ) : (
                <>
                  {mode === "code" ? "Email me a sign-in code" : "Send my sign-in link"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode(mode === "code" ? "link" : "code");
                setError(null);
              }}
              className="w-full text-center text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-400 transition-colors"
            >
              {mode === "code"
                ? "Prefer an emailed link instead?"
                : "Using the installed app? Get a code instead"}
            </button>
          </form>
        )}
      </ProCard>
    </div>
  );
}
