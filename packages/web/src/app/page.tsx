"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Radio,
  Music2,
  Heart,
  Users,
  Zap,
  ArrowRight,
  Gauge,
  QrCode,
  Sparkles,
  CheckCircle2
} from "lucide-react";

// API base URL
function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001`;
  }
  return "http://localhost:3001";
}

interface ActiveSession {
  sessionId: string;
  djName: string;
  startedAt: string;
  currentTrack: {
    title: string;
    artist: string;
  } | null;
  listenerCount: number;
}

interface ActiveSessionsResponse {
  live: boolean;
  count?: number;
  sessions: ActiveSession[];
}

export default function LandingPage() {
  const [liveData, setLiveData] = useState<ActiveSessionsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch active sessions on mount (lightweight REST call, no WebSocket)
  useEffect(() => {
    async function checkLiveSessions() {
      try {
        const response = await fetch(`${getApiBaseUrl()}/api/sessions/active`);
        if (response.ok) {
          const data = await response.json();
          setLiveData(data);
        }
      } catch (e) {
        console.error("Failed to check live sessions:", e);
      } finally {
        setIsLoading(false);
      }
    }

    checkLiveSessions();

    // Refresh every 30 seconds
    const interval = setInterval(checkLiveSessions, 30000);
    return () => clearInterval(interval);
  }, []);

  const isLive = liveData?.live && liveData.sessions.length > 0;
  const sessionCount = liveData?.sessions.length || 0;
  const firstSession = liveData?.sessions[0];
  const isMultipleDJs = sessionCount > 1;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
      {/* Live Session Banner */}
      {isLive && firstSession && (
        <div className="bg-gradient-to-r from-red-500/90 to-pink-500/90 text-white py-3 px-4">
          <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              {isMultipleDJs ? (
                <>
                  <span className="font-bold">🔴 {sessionCount} DJs LIVE!</span>
                  <span className="text-white/90">Multiple rooms available</span>
                </>
              ) : (
                <>
                  <span className="font-bold">LIVE NOW:</span>
                  <span>{firstSession.djName} is playing!</span>
                  {firstSession.currentTrack && (
                    <span className="text-white/80 hidden sm:inline">
                      • {firstSession.currentTrack.artist} - {firstSession.currentTrack.title}
                    </span>
                  )}
                  {firstSession.listenerCount > 0 && (
                    <span className="flex items-center gap-1 text-white/80">
                      <Users className="w-3 h-3" />
                      {firstSession.listenerCount}
                    </span>
                  )}
                </>
              )}
            </div>
            <Link
              href={isMultipleDJs ? "/live" : `/live/${firstSession.sessionId}`}
              className="bg-white text-red-500 px-4 py-1.5 rounded-full font-bold text-sm hover:bg-white/90 transition-colors flex items-center gap-2"
            >
              {isMultipleDJs ? "Choose Room" : "Join Session"}
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}


      {/* Hero Section */}
      <header className="relative overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto px-6 py-20 md:py-32">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="relative">
              <Radio className="w-10 h-10 text-red-500" />
              <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
            </div>
            <h1 className="text-4xl font-black text-white">
              Pika<span className="text-red-500">!</span>
            </h1>
          </div>

          {/* Tagline */}
          <h2 className="text-4xl md:text-6xl font-bold text-white leading-tight max-w-3xl mb-6">
            Real-time music feedback for{" "}
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 text-transparent bg-clip-text">
              West Coast Swing DJs
            </span>
          </h2>

          <p className="text-xl text-slate-300 max-w-2xl mb-10">
            Show dancers what&apos;s playing, collect instant feedback on tempo preferences,
            and build a library of tracks your floor loves.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Link
              href="/dj/register"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2 text-lg"
            >
              <Sparkles className="w-5 h-5" />
              Start DJing with Pika!
            </Link>
            {isLive ? (
              <Link
                href={`/live/${firstSession?.sessionId}`}
                className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur border border-white/20 text-white font-bold rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-lg"
              >
                <Radio className="w-5 h-5 text-red-400" />
                Join Live Session
              </Link>
            ) : (
              <Link
                href="/live"
                className="w-full sm:w-auto px-8 py-4 bg-white/10 backdrop-blur border border-white/20 text-white font-bold rounded-xl hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-lg"
              >
                <Music2 className="w-5 h-5" />
                I&apos;m a Dancer
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Features Section */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-12">
            Everything you need for an amazing dance floor
          </h3>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 border border-slate-700/50">
              <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mb-4">
                <Heart className="w-6 h-6 text-red-400" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Track Likes</h4>
              <p className="text-slate-300">
                Dancers tap to like tracks in real-time. Know exactly which songs make
                your floor happy.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 border border-slate-700/50">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center mb-4">
                <Gauge className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Tempo Feedback</h4>
              <p className="text-slate-300">
                Dancers vote Faster/Slower/Perfect. Get instant consensus on
                tempo preference.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl p-6 border border-slate-700/50">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center mb-4">
                <QrCode className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">Easy Access</h4>
              <p className="text-slate-300">
                Dancers scan a QR code and they&apos;re in. No app download,
                no account needed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6 bg-slate-800/30">
        <div className="max-w-5xl mx-auto">
          <h3 className="text-2xl font-bold text-white text-center mb-12">
            How It Works
          </h3>

          <div className="grid md:grid-cols-2 gap-12">
            {/* For DJs */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <Music2 className="w-5 h-5 text-purple-400" />
                </div>
                <h4 className="text-xl font-bold text-white">For DJs</h4>
              </div>
              <ol className="space-y-4">
                {[
                  "Download the Pika! desktop app",
                  "Import your music library for BPM analysis",
                  "Click 'Go Live' when you start your set",
                  "Display the QR code for dancers",
                  "See real-time feedback as you play",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 text-sm font-bold text-purple-400">
                      {i + 1}
                    </span>
                    <span className="text-slate-300">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* For Dancers */}
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-pink-400" />
                </div>
                <h4 className="text-xl font-bold text-white">For Dancers</h4>
              </div>
              <ol className="space-y-4">
                {[
                  "Scan the QR code at the DJ booth",
                  "See the current track on your phone",
                  "Tap ❤️ to like songs you love",
                  'Vote "Faster" or "Slower" for tempo',
                  "Your feedback helps the DJ adapt!",
                ].map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-pink-500/20 flex items-center justify-center flex-shrink-0 text-sm font-bold text-pink-400">
                      {i + 1}
                    </span>
                    <span className="text-slate-300">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Built for WCS */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 rounded-full text-amber-400 text-sm font-medium mb-6">
            <Zap className="w-4 h-4" />
            Built specifically for West Coast Swing
          </div>
          <h3 className="text-3xl font-bold text-white mb-6">
            By WCS dancers, for WCS dancers
          </h3>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-8">
            We understand that WCS is unique. Variable tempo, musicality focus,
            and a community that cares deeply about the music. Pika! is designed
            with all of this in mind.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            {[
              "BPM-aware track analysis",
              "Musical key detection",
              "Session recap & analytics",
              "Works offline (DJ app)",
            ].map((feature) => (
              <div
                key={feature}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800/50 rounded-full text-slate-300 text-sm"
              >
                <CheckCircle2 className="w-4 h-4 text-green-400" />
                {feature}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h3 className="text-3xl font-bold text-white mb-6">
            Ready to level up your DJ sets?
          </h3>
          <p className="text-xl text-slate-300 mb-8">
            Join the DJs who are already getting real-time feedback from their dance floor.
          </p>
          <Link
            href="/dj/register"
            className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold rounded-xl hover:opacity-90 transition-opacity text-lg"
          >
            Create Your DJ Account
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-slate-800">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-red-500" />
            <span className="font-bold text-white">Pika!</span>
            <span className="text-slate-500">© 2026</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-slate-400">
            <Link href="/dj/login" className="hover:text-white transition-colors">
              DJ Login
            </Link>
            <Link href="/live" className="hover:text-white transition-colors">
              Join Session
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
