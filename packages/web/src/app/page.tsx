"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Cloud,
  Download,
  Gauge,
  Globe2,
  Headphones,
  Heart,
  History,
  Mail,
  MessageCircle,
  Music2,
  QrCode,
  Radio,
  Smartphone,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

// API base URL helper
function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001`; // Dev fallback
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

  // Fetch active sessions on mount
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
    const interval = setInterval(checkLiveSessions, 30000); // 30s polling
    return () => clearInterval(interval);
  }, []);

  const isLive = liveData?.live && liveData.sessions.length > 0;
  const sessionCount = liveData?.sessions.length || 0;
  const firstSession = liveData?.sessions[0];
  const isMultipleDJs = sessionCount > 1;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-purple-500/30">
      {/* 🔴 LIVE BANNER */}
      {isLive && firstSession && (
        <div className="bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-lg shadow-red-900/20">
          <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm sm:text-base">
            <div className="flex items-center gap-3 text-center sm:text-left">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>

              <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                {isMultipleDJs ? (
                  <span className="font-bold">🔴 {sessionCount} DJs LIVE!</span>
                ) : (
                  <>
                    <span className="font-bold">LIVE NOW:</span>
                    <span>{firstSession.djName}</span>
                    {firstSession.currentTrack && (
                      <span className="opacity-90 hidden sm:inline">
                        — {firstSession.currentTrack.title}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>

            <Link
              href={isMultipleDJs ? "/live" : `/live/${firstSession.sessionId}`}
              className="w-full sm:w-auto bg-white text-red-600 px-5 py-1.5 rounded-full font-bold text-xs sm:text-sm hover:bg-slate-100 transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {isMultipleDJs ? "Choose Room" : "Tune In"}
              <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
            </Link>
          </div>
        </div>
      )}

      {/* ✨ HERO SECTION */}
      <header className="relative overflow-hidden pt-12 pb-24 sm:pt-24 sm:pb-32 px-4 sm:px-6 text-center z-10">
        {/* Background Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[100px] mix-blend-screen" />
          <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-pink-600/10 rounded-full blur-[80px] mix-blend-screen" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          {/* Logo Badge */}
          <div className="inline-flex items-center gap-2 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-full px-4 py-1.5 mb-8 shadow-xl hover:border-slate-600 transition-colors">
            <div className="relative">
              <Radio className="w-4 h-4 text-red-500" />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]" />
            </div>
            <span className="text-xs font-bold text-slate-300 tracking-widest uppercase">
              Real-time • Interactive • Live
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white tracking-tight leading-[1.1] mb-8">
            The Digital Pulse of <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-red-400 text-transparent bg-clip-text">
              Your Dance Floor
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Bridge the gap between the DJ booth and the dance floor.
            <strong>Real-time feedback</strong>, <strong>smart playlists</strong>, and{" "}
            <strong>seamless communication</strong> for modern WCS events.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
              <Link
                href={
                  isLive ? (isMultipleDJs ? "/live" : `/live/${firstSession?.sessionId}`) : "/live"
                }
                className="w-full px-8 py-4 bg-white text-slate-950 font-bold rounded-xl hover:bg-slate-100 transition-all transform hover:-translate-y-1 shadow-lg shadow-white/10 flex items-center justify-center gap-2"
              >
                <Smartphone className="w-5 h-5" />
                Tune In (Dancer)
              </Link>
              <span className="text-xs text-slate-500 font-medium tracking-wide">
                No app needed • Anonymous
              </span>
            </div>

            <div className="flex flex-col items-center gap-2 w-full sm:w-auto">
              <Link
                href="/dj/register"
                className="w-full sm:w-auto px-8 py-4 bg-slate-800 text-white font-bold rounded-xl border border-slate-700 hover:bg-slate-700 transition-all flex items-center justify-center gap-2 hover:border-purple-500/50"
              >
                <Headphones className="w-5 h-5" />
                Go Live (DJ)
              </Link>
              {/* Spacer to align buttons perfectly even though DJ side has no subtext */}
              <span className="text-xs text-transparent font-medium tracking-wide selection:bg-transparent">
                spacer
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* 🎯 AUDIENCE TRIFECTA */}
      <section className="py-20 px-4 bg-slate-900/50 border-y border-slate-800">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">A Unified Experience</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">
              Pika! isn't just a playlist viewer. It's a complete ecosystem that enhances the event
              for everyone.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* DJs Card */}
            <div className="group relative bg-slate-800 rounded-3xl p-8 border border-slate-700 hover:border-purple-500/50 transition-all shadow-2xl hover:shadow-purple-900/20">
              <div className="absolute -top-6 left-8 w-14 h-14 bg-purple-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform rotate-3 group-hover:rotate-0">
                <Headphones className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mt-8 mb-2">For DJs</h3>
              <p className="text-purple-300 font-medium mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Audio X-Ray
              </p>

              <ul className="space-y-4 text-slate-300">
                <li className="flex items-start gap-3">
                  <BarChart3 className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Deep Analysis:</strong> Our sidecar processes every file on your drive.
                    Get precise BPM, Key, Energy, and Groove metrics instantly.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Users className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Crowd Pulse:</strong> See "Too Fast" or "Too Slow" votes in real-time.
                    Adjust your set before you lose the floor.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <History className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Set Analytics:</strong> Review your performance after the gig. Which
                    tracks got the most loves? What cleared the floor?
                  </span>
                </li>
              </ul>
            </div>

            {/* Dancers Card */}
            <div className="group relative bg-slate-800 rounded-3xl p-8 border border-slate-700 hover:border-pink-500/50 transition-all shadow-2xl hover:shadow-pink-900/20">
              <div className="absolute -top-6 left-8 w-14 h-14 bg-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-pink-500/30 group-hover:scale-110 transition-transform -rotate-2 group-hover:rotate-0">
                <Heart className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mt-8 mb-2">For Dancers</h3>
              <p className="text-pink-300 font-medium mb-6 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Curate Your Night
              </p>

              <ul className="space-y-4 text-slate-300">
                <li className="flex items-start gap-3">
                  <Smartphone className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Zero Friction:</strong> No app store downloads. Just scan a QR code and
                    you're connected in seconds.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Save for Later:</strong> "Like" a track to save it to your personal
                    history. Never ask "What was that song?" again.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Gauge className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Anonymous Voting:</strong> Politely signal if the tempo is drifting.
                    Your feedback helps the DJ create a better vibe.
                  </span>
                </li>
              </ul>
            </div>

            {/* Organizers Card */}
            <div className="group relative bg-slate-800 rounded-3xl p-8 border border-slate-700 hover:border-emerald-500/50 transition-all shadow-2xl hover:shadow-emerald-900/20">
              <div className="absolute -top-6 left-8 w-14 h-14 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 group-hover:scale-110 transition-transform rotate-2 group-hover:rotate-0">
                <Calendar className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-2xl font-bold text-white mt-8 mb-2">For Organizers</h3>
              <p className="text-emerald-300 font-medium mb-6 flex items-center gap-2">
                <Zap className="w-4 h-4" /> Level Up
              </p>

              <ul className="space-y-4 text-slate-300">
                <li className="flex items-start gap-3">
                  <MessageCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Live Announcements:</strong> Need to announce a schedule change or
                    contest? Push messages directly to every dancer's phone via the DJ screen.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Globe2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Modern Standard:</strong> Elevate your event branding. Show attendees
                    you care about their musical experience.
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  <span>
                    <strong>Plug & Play:</strong> Compatible with any setup. Works offline for DJs
                    if venue WiFi fails (local-only mode).
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ⚡ HOW IT WORKS */}
      <section className="py-20 px-6 bg-slate-900 border-b border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-slate-400">Two sides, one seamless experience.</p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 md:gap-24 items-start relative">
            {/* Divider Line (Desktop) */}
            <div className="hidden md:block absolute top-12 bottom-12 left-1/2 w-px bg-gradient-to-b from-slate-800 via-purple-500/30 to-slate-800 -translate-x-1/2" />

            {/* DJ FLOW */}
            <div className="flex flex-col gap-8">
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 rounded-full text-purple-400 text-sm font-bold border border-purple-500/20">
                  <Headphones className="w-4 h-4" />
                  For the DJ
                </div>
              </div>

              <div className="relative flex items-start gap-6 group">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 shadow-lg shrink-0 group-hover:border-purple-500/50 transition-colors">
                  <Download className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">1. Install Desktop App</h4>
                  <p className="text-slate-400 text-sm">
                    Download Pika! for macOS. It runs alongside VirtualDJ or Serato.
                  </p>
                </div>
              </div>

              <div className="relative flex items-start gap-6 group">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 shadow-lg shrink-0 group-hover:border-purple-500/50 transition-colors">
                  <Cloud className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">2. Auto-Sync to Cloud</h4>
                  <p className="text-slate-400 text-sm">
                    Pika! detects tracks and syncs analysis instantly. You just play music.
                  </p>
                </div>
              </div>
            </div>

            {/* DANCER FLOW */}
            <div className="flex flex-col gap-8">
              <div className="text-center mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-pink-500/10 rounded-full text-pink-400 text-sm font-bold border border-pink-500/20">
                  <Smartphone className="w-4 h-4" />
                  For the Dancer
                </div>
              </div>

              <div className="relative flex items-start gap-6 group">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 shadow-lg shrink-0 group-hover:border-pink-500/50 transition-colors">
                  <QrCode className="w-6 h-6 text-pink-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">1. No App Required</h4>
                  <p className="text-slate-400 text-sm">
                    Just scan the QR code at the booth. Or visit <b>pika.stream</b> in your browser.
                  </p>
                </div>
              </div>

              <div className="relative flex items-start gap-6 group">
                <div className="w-12 h-12 bg-slate-800 rounded-xl flex items-center justify-center border border-slate-700 shadow-lg shrink-0 group-hover:border-pink-500/50 transition-colors">
                  <Heart className="w-6 h-6 text-pink-400" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white mb-1">2. Vote & Save</h4>
                  <p className="text-slate-400 text-sm">
                    See track info instantly. Vote on tempo or save songs to your history.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 🚀 WCS SPECIALTY */}
      <section className="py-24 px-6 bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-full text-amber-500 text-sm font-medium mb-8 border border-amber-500/20">
            <Radio className="w-4 h-4" />
            Built for the Community
          </div>

          <h3 className="text-3xl md:text-5xl font-black text-white mb-8 tracking-tight">
            Data-Driven. <br />
            <span className="text-slate-500">Dancer-Approved.</span>
          </h3>

          <p className="text-lg text-slate-300 mb-12 leading-relaxed max-w-2xl mx-auto">
            West Coast Swing is unique. It demands a wide range of tempos, genres, and energies.
            Generic DJ tools don't understand that. <strong>Pika! does.</strong>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="text-3xl font-bold text-white mb-2">0ms</div>
              <div className="text-sm font-medium text-slate-400">Latency Goal</div>
            </div>
            <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="text-3xl font-bold text-white mb-2">100%</div>
              <div className="text-sm font-medium text-slate-400">Privacy Focused</div>
            </div>
            <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="text-3xl font-bold text-white mb-2">Offline</div>
              <div className="text-sm font-medium text-slate-400">First Architecture</div>
            </div>
            <div className="p-6 bg-slate-900 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
              <div className="text-3xl font-bold text-white mb-2">100%</div>
              <div className="text-sm font-medium text-slate-400">Community Driven</div>
            </div>
          </div>
        </div>
      </section>

      {/* 🦶 BOTTOM CTA & CONTACT */}
      <section className="py-24 px-6 relative overflow-hidden">
        {/* Decorative blur */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[100px]" />

        <div className="relative max-w-3xl mx-auto text-center">
          <h3 className="text-3xl font-bold text-white mb-6">Ready to change the vibe?</h3>
          <p className="text-slate-400 mb-10 text-lg">
            Join the beta and start shaping the future of WCS events today.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-16">
            <Link
              href="/dj/register"
              className="bg-white text-slate-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-slate-200 transition-colors flex items-center justify-center gap-2 shadow-xl shadow-white/5"
            >
              Start DJing
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="border-t border-slate-800 pt-16">
            <h4 className="text-white font-semibold mb-4 flex items-center justify-center gap-2">
              <Mail className="w-4 h-4" /> Get in Touch
            </h4>
            <p className="text-slate-500 mb-4">
              Have questions? Want to bring Pika! to your event?
            </p>
            <a
              href="mailto:hello@pika.stream"
              className="text-purple-400 hover:text-purple-300 font-medium transition-colors text-lg"
            >
              hello@pika.stream
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-12 px-6 border-t border-slate-800 bg-slate-950 text-center sm:text-left">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-2 mb-4 md:mb-0">
            <Radio className="w-5 h-5 text-red-500" />
            <span className="font-bold text-white text-lg">Pika!</span>
            <span className="text-slate-500 text-sm">© 2026</span>
          </div>

          <div className="flex flex-wrap justify-center md:justify-end gap-x-8 gap-y-4 text-sm text-slate-400 font-medium">
            <Link href="/dj/login" className="hover:text-white transition-colors">
              DJ Portal
            </Link>
            <Link href="/live" className="hover:text-white transition-colors">
              Tune In
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
