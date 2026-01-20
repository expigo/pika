"use client";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Mail,
  ShieldCheck,
  User,
} from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30 flex items-center justify-center p-6 relative overflow-hidden">
      {/* 🌌 ATMOSPHERIC MESH: High-fidelity depth system */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-gradient-to-b from-purple-600/10 via-transparent to-transparent blur-[120px]" />
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-pink-500/5 blur-[150px] rounded-full" />
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-emerald-500/5 blur-[150px] rounded-full" />
      </div>

      {/* 🔙 NAVIGATION: Minimalist return path */}
      <Link
        href="/"
        className="absolute top-6 left-6 sm:top-10 sm:left-10 inline-flex items-center gap-3 px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-all text-[9px] font-black uppercase tracking-[0.3em] border border-white/5 backdrop-blur-3xl z-30 group"
      >
        <ArrowRight className="w-3.5 h-3.5 rotate-180 transition-transform group-hover:-translate-x-1" />
        Back to Home
      </Link>

      <div className="w-full max-w-xl relative z-10 py-20">
        {success ? (
          <ProCard
            glow
            className="overflow-hidden bg-slate-950/40 border-white/10 rounded-[2.5rem]"
          >
            <div className="px-10 py-12 text-center border-b border-white/5 bg-white/5 backdrop-blur-2xl">
              <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-400 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-emerald-500/20 transform hover:scale-110 transition-transform duration-700">
                <ShieldCheck className="w-10 h-10 text-slate-950" />
              </div>
              <h1 className="text-4xl font-black text-white italic uppercase tracking-tighter mb-4">
                Identity Verified
              </h1>
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-emerald-500/10 rounded-full text-[9px] font-bold text-emerald-500/80 uppercase tracking-[0.3em]">
                <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                Network Uplink Active
              </div>
            </div>

            <div className="p-10 space-y-10">
              <div className="space-y-4">
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">
                  Private Access Key
                </label>
                <div
                  className="bg-slate-950 border border-white/10 rounded-2xl p-6 font-mono text-sm text-purple-400 break-all leading-relaxed shadow-inner group/token relative cursor-pointer active:scale-[0.99] transition-transform"
                  onClick={copyToken}
                >
                  {success.token}
                  <div className="absolute inset-0 bg-purple-500/0 group-hover/token:bg-purple-500/5 transition-colors rounded-2xl flex items-center justify-end pr-4">
                    <span className="text-[9px] font-bold text-purple-400/0 group-hover/token:text-purple-400/80 uppercase tracking-widest">
                      Click to Copy
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  { n: 1, t: "Open Desktop Sidecar", d: "Launch Pika! on your mix machine" },
                  { n: 2, t: "Sync Identity", d: "Paste token in ⚙️ Settings → DJ Auth" },
                ].map((step) => (
                  <div
                    key={step.n}
                    className="flex gap-6 p-6 bg-white/5 rounded-3xl border border-white/5 hover:border-white/10 transition-colors group"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-slate-950 border border-white/5 flex items-center justify-center flex-shrink-0 text-purple-400 font-black italic shadow-2xl group-hover:scale-110 transition-transform">
                      {step.n}
                    </div>
                    <div>
                      <h4 className="text-[12px] font-bold text-white uppercase tracking-tight mb-1">
                        {step.t}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                        {step.d}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  type="button"
                  onClick={copyToken}
                  className="flex-1 py-5 bg-white text-slate-950 font-black uppercase text-[11px] tracking-[0.2em] rounded-2xl transition-all shadow-xl hover:bg-slate-50 active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  {tokenCopied ? (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      COPIED
                    </>
                  ) : (
                    <>COPY TOKEN</>
                  )}
                </button>
                <Link
                  href={`/dj/${success.user?.slug}`}
                  className="flex-1 py-5 bg-slate-900 border border-white/5 text-white rounded-2xl font-black uppercase text-[11px] tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-xl active:scale-[0.98]"
                >
                  Go to Profile
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </ProCard>
        ) : (
          <div className="space-y-12">
            <div className="text-center relative py-10">
              <div className="absolute inset-0 bg-purple-500/10 blur-[60px] rounded-full scale-150 opacity-50" />
              <h1 className="text-7xl sm:text-9xl font-black text-white italic tracking-tighter uppercase leading-[0.7] mb-8 relative">
                Leader<span className="text-purple-500">.</span>
              </h1>
              <div className="inline-flex items-center gap-4 relative">
                <div className="w-10 h-px bg-gradient-to-r from-transparent to-slate-800" />
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.5em] whitespace-nowrap">
                  INITIATE THE CONVERSATION
                </p>
                <div className="w-10 h-px bg-gradient-to-l from-transparent to-slate-800" />
              </div>
            </div>

            <ProCard
              glow
              className="overflow-hidden bg-slate-950/40 border-white/5 rounded-[2.5rem] shadow-2xl backdrop-blur-3xl"
            >
              <form onSubmit={handleSubmit} className="p-10 sm:p-14 space-y-10">
                {error && (
                  <div className="flex items-center gap-4 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-[10px] font-bold uppercase tracking-[0.1em] backdrop-blur-xl">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">
                    Display Name
                  </label>
                  <div className="relative group">
                    <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                    <input
                      type="text"
                      required
                      placeholder="DJ NAME"
                      className="w-full bg-slate-950/80 border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-white placeholder-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/20 transition-all font-bold text-lg italic uppercase tracking-tight"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">
                    Uplink Email
                  </label>
                  <div className="relative group">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                    <input
                      type="email"
                      required
                      placeholder="DJ@EXAMPLE.COM"
                      className="w-full bg-slate-950/80 border border-white/5 rounded-2xl py-5 pl-14 pr-6 text-white placeholder-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/20 transition-all font-bold text-lg uppercase tracking-tight"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">
                      Access Key
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        className="w-full bg-slate-950/80 border border-white/5 rounded-2xl py-5 pl-14 pr-12 text-white placeholder-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/20 transition-all font-bold text-lg tracking-widest"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">
                      Confirm Key
                    </label>
                    <div className="relative group">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600 group-focus-within:text-purple-400 transition-colors" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        required
                        placeholder="••••••••"
                        className="w-full bg-slate-950/80 border border-white/5 rounded-2xl py-5 pl-14 pr-12 text-white placeholder-slate-800 focus:outline-none focus:ring-1 focus:ring-purple-500/50 focus:border-purple-500/20 transition-all font-bold text-lg tracking-widest"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-white transition-colors"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-6 px-8 bg-white text-slate-950 font-black uppercase text-[12px] tracking-[0.3em] rounded-2xl transition-all shadow-2xl hover:bg-slate-50 hover:scale-[1.01] transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-4 group/btn"
                >
                  {loading ? (
                    <span className="animate-pulse flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-slate-950 animate-ping" />
                      INITIATING...
                    </span>
                  ) : (
                    <>
                      Start the Session
                      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-[0.2em] pt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <span>Already have an account?</span>
                  <Link
                    href="/dj/login"
                    className="text-purple-400 hover:text-white transition-colors border-b border-purple-400/20 hover:border-white pb-1"
                  >
                    IDENTIFIED SIGN IN →
                  </Link>
                </p>
              </form>
            </ProCard>
          </div>
        )}

        <div className="text-center mt-20 pb-10">
          <p className="text-[10px] font-black uppercase tracking-[0.6em] text-slate-700/60 inline-flex items-center gap-4">
            <span className="w-2 h-2 rounded-full bg-slate-800" />
            Powered by Pika! Security Mesh
            <span className="w-2 h-2 rounded-full bg-slate-800" />
          </p>
        </div>
      </div>
    </div>
  );
}
