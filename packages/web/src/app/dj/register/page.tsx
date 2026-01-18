"use client";

import { AlertCircle, ArrowRight, Lock, Mail, ShieldCheck, User, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { getApiBaseUrl } from "@/lib/api";

interface RegisterResponse {
  success: boolean;
  user?: {
    id: number;
    email: string;
    displayName: string;
    slug: string;
  };
  token?: string;
  error?: string;
}

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RegisterResponse | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pika-Client": "pika-web", // CSRF protection
        },
        body: JSON.stringify({ email, password, displayName }),
      });

      const data: RegisterResponse = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Registration failed");
        return;
      }

      setSuccess(data);
    } catch (e) {
      console.error("Registration error:", e);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyToken = async () => {
    if (success?.token) {
      await navigator.clipboard.writeText(success.token);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30 flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
      </div>

      {/* Back Button */}
      <Link
        href="/"
        className="absolute top-4 left-4 sm:top-8 sm:left-8 inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50 z-20"
      >
        <ArrowRight className="w-4 h-4 rotate-180" />
        Back to Home
      </Link>

      <div className="w-full max-w-md relative z-10">
        {success ? (
          <ProCard glow className="overflow-hidden">
            <div className="px-8 py-10 text-center border-b border-slate-800/50">
              <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-emerald-500/20">
                <ShieldCheck className="w-10 h-10 text-white" />
              </div>
              <h1 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-2">
                Identity Verified
              </h1>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                WELCOME TO THE NETWORK, {success.user?.displayName}
              </p>
            </div>

            <div className="p-8">
              <div className="mb-6">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Your DJ Access Token
                </label>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 font-mono text-sm text-purple-400 break-all leading-relaxed shadow-inner">
                  {success.token}
                </div>
              </div>

              <button
                type="button"
                onClick={copyToken}
                className="w-full py-4 px-6 bg-white text-slate-950 font-black uppercase text-[10px] tracking-widest rounded-2xl transition-all shadow-2xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
              >
                {tokenCopied ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    COPIED TO CLIPBOARD
                  </>
                ) : (
                  <>COPY TOKEN</>
                )}
              </button>

              <div className="mt-8 space-y-3">
                {[
                  { n: 1, t: "Open Desktop Sidecar", d: "Launch Pika! on your mix machine" },
                  { n: 2, t: "Sync Identity", d: "Paste token in ⚙️ Settings → DJ Auth" },
                ].map((step) => (
                  <div
                    key={step.n}
                    className="flex gap-4 p-4 bg-slate-900/50 rounded-2xl border border-white/5"
                  >
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center flex-shrink-0 text-purple-400 font-black italic">
                      {step.n}
                    </div>
                    <div>
                      <h4 className="text-[11px] font-black text-white uppercase tracking-tight">
                        {step.t}
                      </h4>
                      <p className="text-[10px] text-slate-500 font-medium">{step.d}</p>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href={`/dj/${success.user?.slug}`}
                className="mt-8 w-full py-4 bg-slate-900 border border-slate-800 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-xl"
              >
                Go to Profile
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </ProCard>
        ) : (
          <div className="space-y-8">
            <div className="text-center">
              <h1 className="text-5xl font-black text-white italic tracking-tighter uppercase leading-none mb-3">
                Recruit
              </h1>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
                Join the Pulse Network
              </p>
            </div>

            <ProCard glow className="overflow-hidden">
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                {error && (
                  <div className="flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl text-red-400 text-xs font-black uppercase tracking-widest">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Display Name
                  </label>
                  <div className="relative group">
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                    <input
                      type="text"
                      required
                      placeholder="DJ NAME"
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all font-medium text-base italic uppercase font-black"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                    Uplink Email
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                    <input
                      type="email"
                      required
                      placeholder="DJ@EXAMPLE.COM"
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all font-medium text-base uppercase"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Access Key
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all font-medium text-base"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                      Confirm Key
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        className="w-full bg-slate-950/50 border border-slate-800 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all font-medium text-base"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 px-6 bg-white text-slate-950 font-black uppercase text-[11px] tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-white/5 flex items-center justify-center gap-3 transform active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? (
                    <span className="animate-pulse">INITIALIZING...</span>
                  ) : (
                    <>
                      Initialize Account
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-[10px] font-black text-slate-500 uppercase tracking-widest pt-4">
                  Already have an account?{" "}
                  <Link
                    href="/dj/login"
                    className="text-purple-400 hover:text-white transition-colors"
                  >
                    Sign In →
                  </Link>
                </p>
              </form>
            </ProCard>
          </div>
        )}

        <div className="text-center mt-12 opacity-30 pb-12">
          <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-500">
            Powered by Pika! Security Mesh
          </p>
        </div>
      </div>
    </div>
  );
}
