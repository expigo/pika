"use client";

import { AlertCircle, ArrowRight, CheckCircle, Lock, LogIn, Mail } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

// API base URL
function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }
  return "http://localhost:3001";
}

interface LoginResponse {
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

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<LoginResponse | null>(null);
  const [tokenCopied, setTokenCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pika-Client": "pika-web", // CSRF protection
        },
        body: JSON.stringify({ email, password }),
      });

      const data: LoginResponse = await response.json();

      if (!response.ok || !data.success) {
        setError(data.error || "Login failed");
        return;
      }

      setSuccess(data);
    } catch (e) {
      console.error("Login error:", e);
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

  // Success state - show token
  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-6 text-center border-b border-slate-700/50">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-white">
                Welcome back, {success.user?.displayName}!
              </h1>
              <p className="text-slate-400 mt-2">You&apos;re logged in</p>
            </div>

            {/* Token */}
            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  🔑 Your DJ Token
                </label>
                <div className="bg-slate-900 rounded-lg p-4 font-mono text-sm text-amber-400 break-all">
                  {success.token}
                </div>
              </div>

              <button
                type="button"
                onClick={copyToken}
                className="w-full py-3 px-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-medium rounded-xl transition-all shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2"
              >
                {tokenCopied ? (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Copied!
                  </>
                ) : (
                  <>Copy Token</>
                )}
              </button>

              <div className="mt-6 p-4 bg-slate-900/50 rounded-xl border border-slate-700/50">
                <h3 className="text-sm font-medium text-slate-300 mb-2">Reminder:</h3>
                <p className="text-sm text-slate-400">
                  Paste this token in Pika! Desktop → ⚙️ Settings → DJ Auth Token
                </p>
              </div>

              <div className="mt-6 text-center">
                <Link
                  href={`/dj/${success.user?.slug}`}
                  className="text-purple-400 hover:text-purple-300 text-sm"
                >
                  View your DJ profile →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4 relative">
      {/* Back Button */}
      <Link
        href="/"
        className="absolute top-6 left-6 text-slate-400 hover:text-white transition-colors flex items-center gap-2 group"
      >
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center group-hover:bg-slate-700 transition-colors">
          <ArrowRight className="w-4 h-4 rotate-180" />
        </div>
        <span className="text-sm font-medium">Back to Home</span>
      </Link>

      <div className="w-full max-w-md">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-6 text-center border-b border-slate-700/50">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-purple-500/25">
              <LogIn className="w-8 h-8 text-white ml-1" />
            </div>
            <h1 className="text-2xl font-bold text-white">Welcome Back</h1>
            <p className="text-slate-400 mt-2">Log in to manage your session</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dj@example.com"
                  required
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-all shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2 transform active:scale-[0.98]"
            >
              {loading ? (
                <span className="animate-pulse">Signing in...</span>
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <p className="text-center text-sm text-slate-500 pt-2">
              Don&apos;t have an account?{" "}
              <Link
                href="/dj/register"
                className="text-purple-400 hover:text-purple-300 transition-colors font-medium"
              >
                Create one
              </Link>
            </p>
          </form>
        </div>

        <p className="text-center text-slate-600 text-sm mt-6">Powered by Pika! 🎧</p>
      </div>
    </div>
  );
}
