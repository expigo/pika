"use client";

import {
  Activity,
  ArrowRight,
  BarChart3,
  Calendar,
  Download,
  Globe2,
  Headphones,
  Heart,
  History,
  Mail,
  MessageCircle,
  Radio,
  Smartphone,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { VibeBadge } from "@/components/ui/VibeBadge";
import { getApiBaseUrl } from "@/lib/api";

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
  const [_isLoading, setIsLoading] = useState(true);

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
        <div className="bg-gradient-to-r from-red-600 to-pink-600 text-white shadow-lg shadow-red-900/20 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-3">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
              </span>
              <p className="font-black italic uppercase tracking-wider">
                {isMultipleDJs ? (
                  <span>{sessionCount} DJs LIVE NOW</span>
                ) : (
                  <span>{firstSession.djName} IS LIVE</span>
                )}
              </p>
            </div>

            <Link
              href={isMultipleDJs ? "/live" : `/live/${firstSession.sessionId}`}
              className="px-4 py-1.5 bg-white text-red-600 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 active:scale-95 transition-all shadow-xl flex items-center gap-2"
            >
              {isMultipleDJs ? "ENTER HUB" : "JOIN FLOOR"}
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* ✨ HERO SECTION */}
      <header className="relative pt-24 pb-32 px-4 sm:px-6 text-center z-10">
        {/* Animated Background Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-gradient-to-b from-purple-600/20 via-transparent to-transparent blur-[140px]" />
          <div className="absolute -top-[10%] -left-[10%] w-[40%] h-[40%] bg-indigo-600/10 rounded-full blur-[120px]" />
          <div className="absolute top-[20%] -right-[10%] w-[30%] h-[30%] bg-pink-600/10 rounded-full blur-[100px]" />

          {/* Subtle Grid Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>

        <div className="relative max-w-5xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-slate-900/80 backdrop-blur-2xl border border-slate-700/50 rounded-full px-5 py-2 mb-12 shadow-[0_0_20px_rgba(168,85,247,0.15)] animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 tracking-[0.4em] uppercase">
              Connected • Interactive • Live
            </span>
          </div>

          <h1 className="text-4xl sm:text-6xl md:text-8xl font-black text-white tracking-tighter leading-[0.95] sm:leading-[0.9] mb-8 sm:mb-12 italic uppercase drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            THE DIGITAL PULSE <br className="hidden sm:block" />
            <span className="inline-block bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_0_15px_rgba(168,85,247,0.3)] pr-4">
              OF YOUR FLOOR
            </span>
          </h1>

          <p className="text-lg sm:text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto mb-16 sm:mb-20 font-medium leading-relaxed tracking-tight px-2 sm:px-0">
            Bridge the gap between the DJ booth and the dance floor.
            <span className="text-white"> Real-time feedback</span>,{" "}
            <span className="text-white">intelligent insight</span>, and
            <span className="text-white"> seamless synchronization</span> for the modern WCS
            community.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <Link
              href={
                isLive ? (isMultipleDJs ? "/live" : `/live/${firstSession?.sessionId}`) : "/live"
              }
              className="w-full sm:w-auto px-12 py-6 bg-white text-slate-950 font-black rounded-2xl hover:bg-slate-100 active:scale-95 transition-all shadow-2xl shadow-white/10 uppercase text-xs tracking-[0.3em] flex items-center justify-center gap-3 group"
            >
              <Smartphone className="w-5 h-5 group-hover:rotate-12 transition-transform" />
              Tune In (Dancer)
            </Link>

            <Link
              href="/dj/register"
              className="w-full sm:w-auto px-12 py-6 bg-slate-900 text-white font-black rounded-2xl border border-slate-800 hover:bg-slate-800 active:scale-95 transition-all uppercase text-xs tracking-[0.3em] flex items-center justify-center gap-3 group shadow-xl"
            >
              <Headphones className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
              Go Live (DJ)
            </Link>
          </div>
        </div>
      </header>

      {/* 🎯 AUDIENCE TRIFECTA */}
      <section className="py-32 px-4 bg-slate-950 relative border-y border-slate-900 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-purple-600/5 blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-24">
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-6 italic uppercase tracking-tighter">
              A Unified Experience
            </h2>
            <p className="text-slate-500 max-w-xl mx-auto leading-relaxed font-black uppercase text-[10px] tracking-[0.4em] opacity-70">
              Elevating the entire dance community
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12">
            {/* DJs Card */}
            <div className="flex flex-col">
              <ProCard className="flex-1 p-10 flex flex-col items-start" glow>
                <div className="w-16 h-16 bg-purple-500/10 border border-purple-500/20 rounded-2xl flex items-center justify-center mb-10 shadow-lg shadow-purple-500/5 group-hover:scale-110 transition-transform">
                  <Headphones className="w-8 h-8 text-purple-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 italic uppercase tracking-tight">
                  DJs
                </h3>
                <VibeBadge variant="purple" icon={Activity} className="mb-8">
                  AUDIO X-RAY
                </VibeBadge>

                <ul className="space-y-6 text-slate-400 font-medium text-sm flex-1">
                  <li className="flex items-start gap-6">
                    <Zap className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Library Sync:</strong> Intelligent ID of BPM, Key, and Energy metrics.
                    </span>
                  </li>
                  <li className="flex items-start gap-6">
                    <Activity className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Floor Flow:</strong> Real-time crowd signal decoding.
                    </span>
                  </li>
                  <li className="flex items-start gap-6">
                    <History className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Deep Analytics:</strong> Set recaps that find what truly popped.
                    </span>
                  </li>
                </ul>

                <Link
                  href="/for/djs"
                  className="mt-12 group flex items-center gap-3 text-[10px] font-black text-purple-400/80 hover:text-purple-400 uppercase tracking-widest active:scale-95 transition-all text-left"
                >
                  Sidecar Specs{" "}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                </Link>
              </ProCard>
            </div>

            {/* Dancers Card */}
            <div className="flex flex-col">
              <ProCard className="flex-1 p-10 flex flex-col items-start" glow>
                <div className="w-16 h-16 bg-pink-500/10 border border-pink-500/20 rounded-2xl flex items-center justify-center mb-10 shadow-lg shadow-pink-500/5 group-hover:scale-110 transition-transform">
                  <Heart className="w-8 h-8 text-pink-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 italic uppercase tracking-tight">
                  Dancers
                </h3>
                <VibeBadge variant="red" icon={Sparkles} className="mb-8">
                  CURATE THE NIGHT
                </VibeBadge>

                <ul className="space-y-8 text-slate-400 font-medium text-sm flex-1">
                  <li className="flex items-start gap-6">
                    <Smartphone className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Zero Friction:</strong> Scan QR and connect. No accounts. No apps.
                    </span>
                  </li>
                  <li className="flex items-start gap-6">
                    <Users className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Safety:</strong> Anonymous signals. All the vibe, zero social
                      pressure.
                    </span>
                  </li>
                  <li className="flex items-start gap-6">
                    <Radio className="w-5 h-5 text-pink-400 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Journal:</strong> Instant track saving for later discovery.
                    </span>
                  </li>
                </ul>

                <Link
                  href="/guide/web-app"
                  className="mt-12 group flex items-center gap-3 text-[10px] font-black text-pink-400/80 hover:text-pink-400 uppercase tracking-widest active:scale-95 transition-all text-left"
                >
                  Floor Guide{" "}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                </Link>
              </ProCard>
            </div>

            {/* Organizers Card */}
            <div className="flex flex-col">
              <ProCard className="flex-1 p-10 flex flex-col items-start" glow>
                <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-center mb-10 shadow-lg shadow-emerald-500/5 group-hover:scale-110 transition-transform">
                  <Calendar className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-4 italic uppercase tracking-tight">
                  Hubs
                </h3>
                <VibeBadge variant="green" icon={Zap} className="mb-8">
                  EVENT UPGRADING
                </VibeBadge>

                <ul className="space-y-6 text-slate-400 font-medium text-sm flex-1">
                  <li className="flex items-start gap-6">
                    <Globe2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Command Center:</strong> Monitor multiple rooms in one unified link.
                    </span>
                  </li>
                  <li className="flex items-start gap-6">
                    <MessageCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Push Comms:</strong> Direct booth-to-phone announcements.
                    </span>
                  </li>
                  <li className="flex items-start gap-6">
                    <Radio className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="leading-relaxed">
                      <strong>Resilience:</strong> Works with or without high-speed guest WiFi.
                    </span>
                  </li>
                </ul>

                <a
                  href="mailto:hello@pika.stream"
                  className="mt-12 group flex items-center gap-3 text-[10px] font-black text-emerald-400/80 hover:text-emerald-400 uppercase tracking-widest active:scale-95 transition-all text-left"
                >
                  Contact Beta{" "}
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-2 transition-transform" />
                </a>
              </ProCard>
            </div>
          </div>
        </div>
      </section>

      {/* 🚀 THE EVOLUTION OF PIKA! */}
      <section className="py-32 px-6 bg-slate-950 overflow-hidden relative border-t border-slate-900">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-b from-purple-600/5 via-transparent to-transparent blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative">
          <div className="flex flex-col items-center text-center gap-12 mb-20">
            <div>
              <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6 italic uppercase tracking-tighter">
                The Evolution
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] opacity-70">
                The future of connected dance floors
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ProCard className="p-10 flex flex-col items-start h-full" glow>
              <div className="w-14 h-14 bg-purple-500/10 rounded-2xl flex items-center justify-center mb-10 border border-purple-500/20 shadow-lg shadow-purple-500/5 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-xl font-black text-white mb-4 italic uppercase tracking-tight">
                Pika! Charts
              </h4>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                The global "Billboard Chart" for WCS. Real-time community trends.
              </p>
            </ProCard>

            <ProCard className="p-10 flex flex-col items-start h-full" glow>
              <div className="w-14 h-14 bg-pink-500/10 rounded-2xl flex items-center justify-center mb-10 border border-pink-500/20 shadow-lg shadow-pink-500/5 group-hover:scale-110 transition-transform">
                <Smartphone className="w-6 h-6 text-pink-400" />
              </div>
              <h4 className="text-xl font-black text-white mb-4 italic uppercase tracking-tight">
                Profiles
              </h4>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Claim your favorite tracks and build your permanent dance log.
              </p>
            </ProCard>

            <ProCard className="p-10 flex flex-col items-start h-full" glow>
              <div className="w-14 h-14 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-10 border border-blue-500/20 shadow-lg shadow-blue-500/5 group-hover:scale-110 transition-transform">
                <Radio className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="text-xl font-black text-white mb-4 italic uppercase tracking-tight">
                Showcases
              </h4>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Live-updated gig schedules and shareable EPK statistics.
              </p>
            </ProCard>

            <ProCard className="p-10 flex flex-col items-start h-full" glow>
              <div className="w-14 h-14 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-10 border border-emerald-500/20 shadow-lg shadow-emerald-500/5 group-hover:scale-110 transition-transform">
                <Globe2 className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="text-xl font-black text-white mb-4 italic uppercase tracking-tight">
                Hubs
              </h4>
              <p className="text-slate-500 text-sm font-medium leading-relaxed">
                Centralized command for conventions. Unified tracking for every hall.
              </p>
            </ProCard>
          </div>
        </div>
      </section>

      {/* ⚡ HOW IT WORKS */}
      <section className="py-32 px-6 bg-slate-900 border-y border-slate-800">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16 sm:mb-24 px-4">
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white mb-6 italic uppercase tracking-tighter">
              Start in Seconds
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-xl mx-auto leading-relaxed font-black uppercase tracking-[0.3em] sm:tracking-[0.4em] opacity-70">
              The Pika! Instant Connect Protocol
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 md:gap-16 relative items-stretch">
            {/* DJ FLOW CARD */}
            <div className="flex flex-col">
              <ProCard
                className="flex-1 p-10 sm:p-14 flex flex-col items-start bg-slate-950/50"
                glow
              >
                <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-purple-500/10 rounded-full text-purple-400 text-[10px] font-black uppercase tracking-widest border border-purple-500/20 mb-12">
                  <Headphones className="w-3.5 h-3.5" />
                  DJ COMMAND
                </div>

                <div className="space-y-10 sm:space-y-12 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 group/step">
                    <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 text-purple-400 font-black italic text-xl leading-none pr-0.5 shadow-2xl group-hover/step:border-purple-500/50 transition-colors">
                      01
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg sm:text-xl font-black text-white mb-2 italic uppercase tracking-tight">
                        The Sidecar
                      </h4>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">
                        Download the lightweight macOS binary. It runs quietly alongside VirtualDJ.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 group/step">
                    <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 text-purple-400 font-black italic text-xl leading-none pr-0.5 shadow-2xl group-hover/step:border-purple-500/50 transition-colors">
                      02
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg sm:text-xl font-black text-white mb-2 italic uppercase tracking-tight">
                        Auto-Analysis
                      </h4>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">
                        Pika! detects your history and syncs analysis to the cloud in real-time.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-16 pt-10 border-t border-slate-800/50 w-full">
                  <Link
                    href="/download"
                    className="inline-flex items-center gap-3 text-[10px] font-black text-purple-400 uppercase tracking-widest active:scale-95 transition-all"
                  >
                    <Download className="w-4 h-4" />
                    GET SIDECAR FOR MAC
                  </Link>
                </div>
              </ProCard>
            </div>

            {/* DANCER FLOW CARD */}
            <div className="flex flex-col">
              <ProCard
                className="flex-1 p-10 sm:p-14 flex flex-col items-start bg-slate-950/50"
                glow
              >
                <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-pink-500/10 rounded-full text-pink-400 text-[10px] font-black uppercase tracking-widest border border-pink-500/20 mb-12">
                  <Smartphone className="w-3.5 h-3.5" />
                  DANCER ACCESS
                </div>

                <div className="space-y-10 sm:space-y-12 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 group/step">
                    <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 text-pink-400 font-black italic text-xl leading-none pr-0.5 shadow-2xl group-hover/step:border-pink-500/50 transition-colors">
                      01
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg sm:text-xl font-black text-white mb-2 italic uppercase tracking-tight">
                        Scan & Go
                      </h4>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">
                        Scan the booth QR or visit{" "}
                        <span className="font-mono text-pink-400 bg-pink-500/5 px-1.5 py-0.5 rounded border border-pink-500/10">
                          pika.stream
                        </span>
                        . No accounts.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8 group/step">
                    <div className="flex-shrink-0 w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 text-pink-400 font-black italic text-xl leading-none pr-0.5 shadow-2xl group-hover/step:border-pink-500/50 transition-colors">
                      02
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-lg sm:text-xl font-black text-white mb-2 italic uppercase tracking-tight">
                        Engage
                      </h4>
                      <p className="text-slate-400 text-sm font-medium leading-relaxed">
                        See what's playing, vote on tempo, and build your anonymous favorites log.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-16 pt-10 border-t border-slate-800/50 w-full">
                  <Link
                    href="/live"
                    className="inline-flex items-center gap-3 text-[10px] font-black text-pink-400 uppercase tracking-widest active:scale-95 transition-all"
                  >
                    <Radio className="w-4 h-4" />
                    SEE ACTIVE FLOORS
                  </Link>
                </div>
              </ProCard>
            </div>
          </div>
        </div>
      </section>

      {/* 🚀 WCS SPECIALTY */}
      <section className="py-32 px-6 bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 rounded-full text-amber-500 text-[10px] font-black uppercase tracking-widest mb-12 border border-amber-500/20">
            <Radio className="w-4 h-4" />
            COMMUNITY ENGINE
          </div>

          <h3 className="text-4xl md:text-6xl font-black text-white mb-8 italic uppercase tracking-tighter pr-8">
            Data-Driven. <br />
            <span className="bg-gradient-to-r from-slate-400 to-slate-600 text-transparent bg-clip-text">
              Dancer-Approved.
            </span>
          </h3>

          <p className="text-lg text-slate-400 mb-16 font-medium leading-relaxed max-w-2xl mx-auto">
            West Coast Swing demands a wide range of tempos, genres, and energies. Generic tools
            don't understand that. <span className="text-white">Pika! does.</span>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 relative">
            <div className="absolute inset-0 bg-purple-600/5 blur-[100px] -z-10" />
            <ProCard className="p-6 sm:p-10 bg-slate-900/40 border-slate-800/50" glow>
              <div className="text-3xl sm:text-4xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter">
                0ms
              </div>
              <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] leading-tight">
                LATENCY GOAL
              </div>
            </ProCard>
            <ProCard className="p-6 sm:p-10 bg-slate-900/40 border-slate-800/50" glow>
              <div className="text-3xl sm:text-4xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter">
                100%
              </div>
              <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] leading-tight">
                PRIVACY
              </div>
            </ProCard>
            <ProCard className="p-6 sm:p-10 bg-slate-900/40 border-slate-800/50" glow>
              <div className="text-2xl sm:text-3xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter uppercase">
                SIDE<span className="text-purple-500">CAR</span>
              </div>
              <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] leading-tight">
                OFFLINE CORE
              </div>
            </ProCard>
            <ProCard className="p-6 sm:p-10 bg-slate-900/40 border-slate-800/50" glow>
              <div className="text-3xl sm:text-4xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter">
                v0.4
              </div>
              <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] leading-tight">
                BETA REACH
              </div>
            </ProCard>
          </div>
        </div>
      </section>

      {/* 🦶 BOTTOM CTA & CONTACT */}
      <section className="py-40 px-6 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[600px] bg-gradient-to-b from-purple-600/10 to-transparent blur-[120px] pointer-events-none" />

        <div className="relative max-w-3xl mx-auto text-center">
          <h3 className="text-4xl sm:text-5xl font-black text-white mb-10 italic uppercase tracking-tighter">
            READY TO CHANGE THE VIBE?
          </h3>

          <div className="flex flex-col sm:flex-row justify-center gap-4 mb-24">
            <Link
              href="/dj/register"
              className="bg-white text-slate-900 px-12 py-5 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3"
            >
              Start DJing
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          <div className="border-t border-slate-800/50 pt-20">
            <div className="inline-flex items-center gap-3 text-white font-black italic uppercase tracking-widest mb-6">
              <Mail className="w-4 h-4 text-purple-500" />
              GET IN TOUCH
            </div>
            <p className="text-slate-500 text-sm font-medium mb-4 max-w-xs mx-auto">
              Want to bring Pika! to your local event or WCS convention?
            </p>
            <a
              href="mailto:hello@pika.stream"
              className="text-white hover:text-purple-400 font-black italic uppercase tracking-widest transition-colors text-xl"
            >
              hello@pika.stream
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      {/* FOOTER */}
      <footer className="py-12 px-6 border-t border-slate-900 bg-slate-950">
        <div className="max-w-6xl mx-auto flex flex-col items-center md:flex-row justify-between gap-8">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center border border-slate-800 shadow-lg shadow-purple-500/10">
              <Radio className="w-4 h-4 text-purple-400" />
            </div>
            <div className="flex flex-col items-start leading-none">
              <span className="font-black text-white text-base italic tracking-tighter uppercase">
                Pika!
              </span>
              <span className="text-[10px] text-slate-600 font-bold uppercase tracking-widest">
                © 2026
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4">
            <Link
              href="/dj/login"
              className="text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors"
            >
              DJ Portal
            </Link>
            <Link
              href="/live"
              className="text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors"
            >
              Tune In
            </Link>
            <Link
              href="/privacy"
              className="text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-[0.2em] transition-colors"
            >
              Privacy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
