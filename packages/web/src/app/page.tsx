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
  Radio,
  Smartphone,
  Sparkles,
  Zap,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
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
      <header className="relative pt-32 pb-48 px-4 sm:px-6 text-center z-10 overflow-hidden">
        {/* Animated Background Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1000px] bg-gradient-to-b from-purple-600/25 via-transparent to-transparent blur-[140px]" />
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/15 rounded-full blur-[120px]" />
          <div className="absolute top-[10%] -right-[10%] w-[40%] h-[40%] bg-pink-600/15 rounded-full blur-[100px]" />

          {/* Subtle Grid Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-3 bg-slate-900/60 backdrop-blur-3xl border border-white/5 rounded-full px-6 py-2.5 mb-16 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <Radio className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
            <span className="text-[10px] font-black text-slate-400 tracking-[0.5em] uppercase">
              Connected • Interactive • Live
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl md:text-9xl font-black text-white tracking-tighter leading-[0.9] mb-10 italic uppercase drop-shadow-[0_0_30px_rgba(255,255,255,0.1)]">
            ONE ROOM <br className="hidden sm:block" />
            <span className="inline-block bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-400 text-transparent bg-clip-text drop-shadow-[0_0_15px_rgba(168,85,247,0.3)] pr-12">
              ONE HEARTBEAT
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-slate-400 max-w-3xl mx-auto mb-20 font-medium leading-relaxed tracking-tight px-4 sm:px-0">
            The real-time interaction bridge between the booth and the floor.{" "}
            <br className="hidden sm:block" />
            <span className="text-slate-200">See what they love. Play what they feel.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8">
            <Link
              href={
                isLive ? (isMultipleDJs ? "/live" : `/live/${firstSession?.sessionId}`) : "/live"
              }
              className="w-full sm:w-auto px-14 py-7 bg-white text-slate-950 font-black rounded-[2rem] hover:bg-slate-100 active:scale-95 transition-all shadow-2xl shadow-white/10 uppercase text-xs tracking-[0.3em] flex items-center justify-center gap-4 group"
            >
              <Smartphone className="w-6 h-6 group-hover:rotate-12 transition-transform" />
              Tune In (Dancer)
            </Link>

            <Link
              href="/dj/register"
              className="w-full sm:w-auto px-14 py-7 bg-slate-900/50 backdrop-blur-xl text-white font-black rounded-[2rem] border border-white/5 hover:bg-slate-900 active:scale-95 transition-all uppercase text-xs tracking-[0.3em] flex items-center justify-center gap-4 group"
            >
              <Headphones className="w-6 h-6 group-hover:-rotate-12 transition-transform" />
              Go Live (DJ)
            </Link>
          </div>

          {/* 📱 THE PRODUCT HANDSHAKE (HERO MOCKUP) */}
          <div className="mt-24 sm:mt-32 relative group">
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent z-20 pointer-events-none" />

            <div className="relative z-10 w-full max-w-5xl mx-auto">
              {/* Main Booth Frame */}
              <div className="relative aspect-[16/10] sm:aspect-[21/9] rounded-[2rem] sm:rounded-[3.5rem] border border-white/10 bg-black shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden">
                <div className="absolute inset-0 opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-1000">
                  <Image
                    src="/screenshots/dj/vdj-sync.png"
                    alt="DJ Booth Integration"
                    fill
                    priority
                    className="object-cover object-top"
                  />
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-transparent to-transparent pointer-events-none" />

                {/* Integration Badge */}
                <div className="absolute top-6 left-6 px-4 py-2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-xl z-30">
                  <p className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1">
                    Integration Proof
                  </p>
                  <p className="text-[10px] font-black text-white uppercase tracking-widest">
                    VirtualDJ Native Bridge
                  </p>
                </div>
              </div>

              {/* Floating Mobile Accessory */}
              <div className="absolute -bottom-10 -right-4 sm:-bottom-12 sm:right-0 w-[160px] sm:w-[260px] aspect-[9/19.5] rounded-[2.5rem] sm:rounded-[3.5rem] border-[6px] sm:border-[12px] border-slate-950 bg-slate-950 shadow-[0_50px_100px_rgba(0,0,0,0.9)] overflow-hidden z-30 transform -rotate-2 group-hover:rotate-0 group-hover:-translate-y-6 transition-all duration-1000">
                <Image
                  src="/screenshots/dancer/live-id.png"
                  alt="Dancer Mobile View"
                  fill
                  className="object-cover"
                />
              </div>

              {/* Technical Callout */}
              <div className="absolute top-1/2 -left-8 sm:-left-20 -translate-y-1/2 px-8 py-6 bg-slate-900/90 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-2xl z-40 hidden lg:block transform group-hover:translate-x-4 transition-transform duration-1000">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                    Live Handshake
                  </span>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center text-[7px] font-black text-slate-500 tracking-[0.2em] uppercase mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <span>Booth Sync</span>
                      <span className="text-purple-400">Locked</span>
                    </div>
                    <div className="h-1 w-32 bg-white/5 rounded-full overflow-hidden text-left relative">
                      <div className="h-full w-0 group-hover:w-full bg-purple-500 relative transition-all duration-1000 ease-out delay-100">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                      </div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between items-center text-[7px] font-black text-slate-500 tracking-[0.2em] uppercase mb-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 delay-300">
                      <span>Crowd Feed</span>
                      <span className="text-pink-400">Active</span>
                    </div>
                    <div className="h-1 w-24 bg-white/5 rounded-full overflow-hidden text-left relative">
                      <div className="h-full w-0 group-hover:w-full bg-pink-500 relative transition-all duration-1000 ease-out delay-500">
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 🎯 AUDIENCE TRIFECTA */}
      <section className="py-40 px-4 bg-slate-950 relative border-y border-slate-900 overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-purple-600/5 blur-[100px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-32">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <span className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.6em] relative z-10 mb-6">
              The Ecosystem
            </span>
            <h2 className="text-5xl sm:text-6xl font-black text-white italic uppercase tracking-tighter">
              A Unified Experience
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 md:gap-12 items-stretch">
            <ProCard
              className="p-10 flex flex-col items-start h-full group/card transition-all duration-1000"
              glow
              bgImage="/textures/dj.png"
            >
              <div className="w-20 h-20 bg-purple-500/10 border border-purple-500/20 rounded-3xl flex items-center justify-center mb-12 shadow-xl shadow-purple-500/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-700">
                <Headphones className="w-10 h-10 text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.5)]" />
              </div>
              <h3 className="text-4xl font-black text-white mb-4 italic uppercase tracking-tighter">
                DJs
              </h3>
              <VibeBadge
                variant="purple"
                icon={Activity}
                className="mb-10 font-black uppercase tracking-[0.3em] text-[10px]"
              >
                AUDIO X-RAY
              </VibeBadge>

              <ul className="space-y-8 text-slate-400 font-medium text-[15px] flex-1">
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Library Sync:</strong> Intelligent ID of BPM,
                    Key, and Energy.
                  </span>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Floor Flow:</strong> Real-time crowd signal
                    decoding.
                  </span>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Post-Gig Recaps:</strong> Find what truly
                    popped on your floor.
                  </span>
                </li>
              </ul>

              <Link
                href="/for/djs"
                className="mt-14 w-full group flex items-center justify-between px-8 py-5 bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/20 rounded-2xl text-[11px] font-black text-purple-400 uppercase tracking-[0.3em] transition-all hover:translate-y-[-4px] active:scale-[0.98]"
              >
                Sidecar Specs
                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
              </Link>
            </ProCard>

            {/* Dancers Card */}
            <ProCard
              className="p-10 flex flex-col items-start h-full group/card transition-all duration-1000"
              glow
              bgImage="/textures/dancer.png"
            >
              <div className="w-20 h-20 bg-pink-500/10 border border-pink-500/20 rounded-3xl flex items-center justify-center mb-12 shadow-xl shadow-pink-500/10 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-700">
                <Heart className="w-10 h-10 text-pink-400 drop-shadow-[0_0_15px_rgba(244,114,182,0.5)]" />
              </div>
              <h3 className="text-4xl font-black text-white mb-4 italic uppercase tracking-tighter">
                Dancers
              </h3>
              <VibeBadge
                variant="red"
                icon={Sparkles}
                className="mb-10 font-black uppercase tracking-[0.3em] text-[10px]"
              >
                CURATE THE NIGHT
              </VibeBadge>

              <ul className="space-y-8 text-slate-400 font-medium text-[15px] flex-1">
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(244,114,182,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Instant Sync:</strong> Scan QR and connect.
                    Zero friction.
                  </span>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(244,114,182,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Safety:</strong> Anonymous signals. All the
                    vibe, zero social pressure.
                  </span>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(244,114,182,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Journal:</strong> Instant track saving for
                    later discovery.
                  </span>
                </li>
              </ul>

              <Link
                href="/guide/web-app"
                className="mt-14 w-full group flex items-center justify-between px-8 py-5 bg-pink-500/5 hover:bg-pink-500/10 border border-pink-500/20 rounded-2xl text-[11px] font-black text-pink-400 uppercase tracking-[0.3em] transition-all hover:translate-y-[-4px] active:scale-[0.98]"
              >
                Floor Guide
                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
              </Link>
            </ProCard>

            {/* Organizers Card */}
            <ProCard
              className="p-10 flex flex-col items-start h-full group/card transition-all duration-1000"
              glow
              bgImage="/textures/organizer.png"
            >
              <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl flex items-center justify-center mb-12 shadow-xl shadow-emerald-500/10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-700">
                <Calendar className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
              </div>
              <h3 className="text-4xl font-black text-white mb-4 italic uppercase tracking-tighter">
                Organizers
              </h3>
              <VibeBadge
                variant="green"
                icon={Zap}
                className="mb-10 font-black uppercase tracking-[0.3em] text-[10px]"
              >
                EVENT UPGRADING
              </VibeBadge>

              <ul className="space-y-8 text-slate-400 font-medium text-[15px] flex-1">
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Command Center:</strong> Monitor multiple
                    rooms in one link.
                  </span>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Booth Broadcast:</strong> Direct
                    booth-to-phone announcements.
                  </span>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-2.5 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
                  <span className="leading-relaxed">
                    <strong className="text-slate-200">Auto-Healing Sync:</strong> High-resilience
                    stability for any venue.
                  </span>
                </li>
              </ul>

              <a
                href="mailto:hello@pika.stream"
                className="mt-14 w-full group flex items-center justify-between px-8 py-5 bg-emerald-500/5 hover:bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-[11px] font-black text-emerald-400 uppercase tracking-[0.3em] transition-all hover:translate-y-[-4px] active:scale-[0.98]"
              >
                Contact Beta
                <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
              </a>
            </ProCard>
          </div>
        </div>
      </section>

      {/* 📸 THE TECHNICAL REGISTRY (NEW PROMINENT GALLERY) */}
      <section className="py-40 bg-black overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-purple-600/10 blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto px-6 relative z-10">
          <div className="grid lg:grid-cols-2 gap-24 items-center">
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-black text-purple-400 uppercase tracking-widest mb-8">
                The Product Registry
              </span>
              <h2 className="text-4xl sm:text-6xl font-black text-white italic uppercase tracking-tighter leading-none mb-10">
                The DJ&apos;s <br />
                <span className="text-purple-500 font-[inherit]">Sixth Sense</span>
              </h2>
              <p className="text-xl text-slate-400 font-medium leading-relaxed mb-12 tracking-tight">
                Don&apos;t just play tracks. Play the room. Pika! surfaces crowd reactions from
                previous sets and integrates your personal library notes, giving you a predictive
                &quot;X-Ray&quot; of how the floor will react before you ever hit play.
              </p>

              <div className="grid sm:grid-cols-2 gap-8">
                <div className="p-6 bg-slate-900/40 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                    Performance Memory
                  </p>
                  <p className="text-slate-200 text-sm font-semibold">
                    Surface crowd feedback and crate notes from every set you&apos;ve played.
                  </p>
                </div>
                <div className="p-6 bg-slate-900/40 rounded-2xl border border-white/5">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                    Technical Audit
                  </p>
                  <p className="text-slate-200 text-sm font-semibold">
                    Automatic ID of Key, BPM, and Energy metrics via direct bridge.
                  </p>
                </div>
              </div>
            </div>

            <div className="relative group">
              <div className="absolute -inset-4 bg-purple-500/20 rounded-[3rem] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative aspect-[16/10] rounded-[2.5rem] border border-white/10 bg-slate-900 overflow-hidden shadow-2xl">
                <Image
                  src="/screenshots/dj/crate-intelligence.png"
                  alt="High Resolution Crate Intelligence"
                  fill
                  className="object-cover transition-transform duration-[2s] group-hover:scale-110"
                />
              </div>

              {/* Floating Overlay Modal */}
              <div className="absolute -bottom-10 -left-10 w-64 p-6 bg-slate-900/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl z-20 hidden md:block animate-bounce-slow">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/20">
                    <History className="w-5 h-5 text-purple-400" />
                  </div>
                  <p className="text-xs font-black text-white italic uppercase tracking-tight">
                    Library Decoded
                  </p>
                </div>
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                  High-resolution technical attributes mapped into high-fidelity signals.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ⚡ HOW IT WORKS */}
      <section className="py-40 px-6 bg-slate-900 border-y border-slate-800 relative overflow-hidden">
        {/* Schematic Neural Connection */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent hidden lg:block" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-[80%] bg-gradient-to-b from-transparent via-purple-500/20 to-transparent lg:hidden" />

        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-32 px-4">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/20 -z-10" />
            <span className="inline-block px-8 bg-slate-900 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.6em] relative z-10 mb-6">
              The Handshake
            </span>
            <h2 className="text-5xl sm:text-6xl font-black text-white italic uppercase tracking-tighter">
              Start in Seconds
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-12 md:gap-24 relative items-stretch">
            {/* DJ FLOW CARD */}
            <div className="flex flex-col group/onboarding scale-[1.02] origin-right">
              <ProCard
                className="flex-1 p-10 sm:p-14 flex flex-col items-start bg-slate-950/90 border-purple-500/40"
                glow
                bgImage="/textures/dj.png"
              >
                <div className="inline-flex items-center gap-3 px-4 py-2 bg-purple-500/20 rounded-full text-purple-400 text-[11px] font-black uppercase tracking-[0.3em] border border-purple-500/40 mb-12 shadow-[0_0_30px_rgba(168,85,247,0.3)]">
                  <Headphones className="w-4 h-4" />
                  DJ COMMAND
                </div>

                <div className="space-y-10 sm:space-y-16 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-10 group/step">
                    <div className="flex-shrink-0 w-16 h-16 bg-slate-900 rounded-[1.25rem] flex items-center justify-center border-2 border-purple-500/30 text-purple-400 font-black italic text-3xl leading-none pr-0.5 shadow-2xl group-hover/step:border-purple-500/80 transition-all group-hover/step:scale-110 group-hover/step:shadow-[0_10px_40px_rgba(168,85,247,0.4)]">
                      01
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-2xl sm:text-3xl font-black text-white mb-3 italic uppercase tracking-tighter">
                        The Sidecar
                      </h4>
                      <p className="text-slate-400 text-[15px] font-medium leading-relaxed">
                        Download the lightweight macOS binary. It runs silently alongside VirtualDJ.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-10 group/step">
                    <div className="flex-shrink-0 w-16 h-16 bg-slate-900 rounded-[1.25rem] flex items-center justify-center border-2 border-purple-500/30 text-purple-400 font-black italic text-3xl leading-none pr-0.5 shadow-2xl group-hover/step:border-purple-500/80 transition-all group-hover/step:scale-110 group-hover/step:shadow-[0_10px_40px_rgba(168,85,247,0.4)]">
                      02
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-2xl sm:text-3xl font-black text-white mb-3 italic uppercase tracking-tighter">
                        Auto-Analysis
                      </h4>
                      <p className="text-slate-400 text-[15px] font-medium leading-relaxed">
                        Pika! detects your history and syncs analysis to the cloud in real-time.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-16 pt-10 border-t border-purple-500/20 w-full">
                  <Link
                    href="/download"
                    className="group bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/40 rounded-2xl flex items-center justify-between px-8 py-5 text-[11px] font-black text-purple-400 uppercase tracking-[0.4em] transition-all hover:translate-y-[-4px] active:scale-95"
                  >
                    <div className="flex items-center gap-4">
                      <Download className="w-5 h-5 animate-bounce-slow" />
                      Get Sidecar for Mac
                    </div>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                  </Link>
                </div>
              </ProCard>
            </div>

            {/* DANCER FLOW CARD */}
            <div className="flex flex-col scale-[1.02] origin-left">
              <ProCard
                className="flex-1 p-10 sm:p-14 flex flex-col items-start bg-slate-950/90 border-pink-500/40"
                glow
                bgImage="/textures/dancer.png"
              >
                <div className="inline-flex items-center gap-3 px-4 py-2 bg-pink-500/20 rounded-full text-pink-400 text-[11px] font-black uppercase tracking-[0.3em] border border-pink-500/40 mb-12 shadow-[0_0_30px_rgba(244,114,182,0.3)]">
                  <Smartphone className="w-4 h-4" />
                  DANCER ACCESS
                </div>

                <div className="space-y-10 sm:space-y-16 flex-1">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-10 group/step">
                    <div className="flex-shrink-0 w-16 h-16 bg-slate-900 rounded-[1.25rem] flex items-center justify-center border-2 border-pink-500/30 text-pink-400 font-black italic text-3xl leading-none pr-0.5 shadow-2xl group-hover/step:border-pink-500/80 transition-all group-hover/step:scale-110 group-hover/step:shadow-[0_10px_40px_rgba(244,114,182,0.4)]">
                      01
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-2xl sm:text-3xl font-black text-white mb-3 italic uppercase tracking-tighter">
                        Scan & Go
                      </h4>
                      <p className="text-slate-400 text-[15px] font-medium leading-relaxed">
                        Scan the booth QR or visit{" "}
                        <code className="px-2 py-1 bg-pink-500/10 text-pink-400 rounded-lg border border-pink-500/20">
                          pika.stream
                        </code>
                        .
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-10 group/step">
                    <div className="flex-shrink-0 w-16 h-16 bg-slate-900 rounded-[1.25rem] flex items-center justify-center border-2 border-pink-500/30 text-pink-400 font-black italic text-3xl leading-none pr-0.5 shadow-2xl group-hover/step:border-pink-500/80 transition-all group-hover/step:scale-110 group-hover/step:shadow-[0_10px_40px_rgba(244,114,182,0.4)]">
                      02
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-2xl sm:text-3xl font-black text-white mb-3 italic uppercase tracking-tighter">
                        Engage
                      </h4>
                      <p className="text-slate-400 text-[15px] font-medium leading-relaxed">
                        See what&apos;s playing, vote on tempo, and build your favorites log.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-16 pt-10 border-t border-pink-500/20 w-full">
                  <Link
                    href="/live"
                    className="group bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/40 rounded-2xl flex items-center justify-between px-8 py-5 text-[11px] font-black text-pink-400 uppercase tracking-[0.4em] transition-all hover:translate-y-[-4px] active:scale-95"
                  >
                    <div className="flex items-center gap-4">
                      <Radio className="w-5 h-5" />
                      See Active Floors
                    </div>
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                  </Link>
                </div>
              </ProCard>
            </div>
          </div>
        </div>
      </section>

      {/* 🚀 THE EVOLUTION OF PIKA! */}
      <section className="py-40 px-6 bg-slate-950 overflow-hidden relative border-t border-slate-900">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-b from-purple-600/5 via-transparent to-transparent blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-32">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <span className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.6em] relative z-10 mb-6">
              The Horizon
            </span>
            <h2 className="text-5xl sm:text-6xl font-black text-white italic uppercase tracking-tighter">
              The Evolution
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Charts */}
            <ProCard
              className="p-8 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/50"
              glow
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-full bg-purple-500/20 blur-xl opacity-0 group-hover/roadmap:opacity-100 transition-opacity duration-700" />
                <div className="w-16 h-16 bg-slate-950 border border-purple-500/20 rounded-full flex items-center justify-center relative z-10 group-hover/roadmap:border-purple-500/50 transition-colors">
                  <BarChart3 className="w-6 h-6 text-purple-400" />
                  {/* Subtle Spinner Ring */}
                  <div className="absolute inset-[-4px] border border-dashed border-purple-500/20 rounded-full animate-[spin_10s_linear_infinite]" />
                </div>
              </div>
              <h4 className="text-sm font-black text-white mb-3 italic uppercase tracking-[0.2em]">
                Pika! Charts
              </h4>
              <p className="text-slate-500 text-[12px] font-medium leading-relaxed">
                The global{" "}
                <span className="text-slate-400 italic">&quot;Billboard Chart&quot;</span> for WCS.
                Real-time community trends.
              </p>
            </ProCard>

            {/* Profiles */}
            <ProCard
              className="p-8 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/50"
              glow
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-full bg-pink-500/20 blur-xl opacity-0 group-hover/roadmap:opacity-100 transition-opacity duration-700" />
                <div className="w-16 h-16 bg-slate-950 border border-pink-500/20 rounded-full flex items-center justify-center relative z-10 group-hover/roadmap:border-pink-500/50 transition-colors">
                  <Smartphone className="w-6 h-6 text-pink-400" />
                  <div className="absolute inset-[-4px] border border-dashed border-pink-500/20 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
                </div>
              </div>
              <h4 className="text-sm font-black text-white mb-3 italic uppercase tracking-[0.2em]">
                Dance DNA
              </h4>
              <p className="text-slate-500 text-[12px] font-medium leading-relaxed">
                Claim your favorite tracks and build your permanent personal dance log.
              </p>
            </ProCard>

            {/* Showcases */}
            <ProCard
              className="p-8 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/50"
              glow
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-full bg-blue-500/20 blur-xl opacity-0 group-hover/roadmap:opacity-100 transition-opacity duration-700" />
                <div className="w-16 h-16 bg-slate-950 border border-blue-500/20 rounded-full flex items-center justify-center relative z-10 group-hover/roadmap:border-blue-500/50 transition-colors">
                  <Radio className="w-6 h-6 text-blue-400" />
                  <div className="absolute inset-[-4px] border border-dashed border-blue-500/20 rounded-full animate-[spin_12s_linear_infinite]" />
                </div>
              </div>
              <h4 className="text-sm font-black text-white mb-3 italic uppercase tracking-[0.2em]">
                Portfolios
              </h4>
              <p className="text-slate-500 text-[12px] font-medium leading-relaxed">
                Live-updated gig schedules and shareable, pro-grade EPK statistics.
              </p>
            </ProCard>

            {/* Venues */}
            <ProCard
              className="p-8 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/50"
              glow
            >
              <div className="relative mb-8">
                <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl opacity-0 group-hover/roadmap:opacity-100 transition-opacity duration-700" />
                <div className="w-16 h-16 bg-slate-950 border border-emerald-500/20 rounded-full flex items-center justify-center relative z-10 group-hover/roadmap:border-emerald-500/50 transition-colors">
                  <Globe2 className="w-6 h-6 text-emerald-400" />
                  <div className="absolute inset-[-4px] border border-dashed border-emerald-500/20 rounded-full animate-[spin_20s_linear_infinite_reverse]" />
                </div>
              </div>
              <h4 className="text-sm font-black text-white mb-3 italic uppercase tracking-[0.2em]">
                Global Venues
              </h4>
              <p className="text-slate-500 text-[12px] font-medium leading-relaxed">
                Unified tracking and centralized command for major dance conventions.
              </p>
            </ProCard>
          </div>
        </div>
      </section>

      {/* 🚀 WCS SPECIALTY */}
      <section className="py-48 px-6 bg-gradient-to-b from-slate-950 to-slate-900 border-b border-slate-800/50 relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-amber-500/[0.03] blur-[120px] pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-3 px-6 py-2.5 bg-amber-500/10 rounded-full text-amber-500 text-[10px] font-black uppercase tracking-[0.4em] mb-16 border border-amber-500/20 shadow-2xl shadow-amber-500/10">
            <Radio className="w-4 h-4" />
            COMMUNITY ENGINE
          </div>

          <h3 className="text-5xl md:text-8xl font-black text-white mb-10 italic uppercase tracking-tighter leading-none">
            DATA-DRIVEN. <br />
            <span className="bg-gradient-to-r from-slate-400 via-slate-200 to-slate-500 text-transparent bg-clip-text">
              DANCER-APPROVED.
            </span>
          </h3>

          <p className="text-xl sm:text-2xl text-slate-400 mb-24 font-medium leading-relaxed max-w-3xl mx-auto tracking-tight">
            West Coast Swing demands a wide range of tempos, genres, and energies. Generic tools
            don't understand that. <span className="text-white">Pika! does.</span>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 relative">
            <div className="absolute inset-x-0 -bottom-24 h-64 bg-emerald-500/10 blur-[100px] pointer-events-none" />

            <ProCard
              className="p-6 sm:p-10 bg-slate-900/60 border-white/5 relative overflow-hidden group/stat"
              glow
              bgImage="/textures/schematic.png"
            >
              <div className="relative z-10">
                <div className="text-[10px] font-black text-emerald-500/50 uppercase tracking-[0.2em] mb-4 font-mono">
                  MOD_01 &mdash; SIGNAL
                </div>
                <div className="text-4xl sm:text-5xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter">
                  0ms
                </div>
                <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] leading-tight">
                  LATENCY GOAL
                </div>
              </div>
            </ProCard>

            <ProCard
              className="p-6 sm:p-10 bg-slate-900/60 border-white/5 relative overflow-hidden group/stat"
              glow
              bgImage="/textures/schematic.png"
            >
              <div className="relative z-10">
                <div className="text-[10px] font-black text-purple-500/50 uppercase tracking-[0.2em] mb-4 font-mono">
                  MOD_02 &mdash; SECURE
                </div>
                <div className="text-4xl sm:text-5xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter">
                  100%
                </div>
                <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] leading-tight">
                  PRIVACY
                </div>
              </div>
            </ProCard>

            <ProCard
              className="p-6 sm:p-10 bg-slate-900/60 border-purple-500/20 relative overflow-hidden group/stat"
              glow
              bgImage="/textures/schematic.png"
            >
              <div className="relative z-10">
                <div className="text-[10px] font-black text-purple-400/50 uppercase tracking-[0.2em] mb-4 font-mono">
                  MOD_03 &mdash; IMPACT
                </div>
                <div className="text-3xl sm:text-4xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter uppercase">
                  SIDE
                  <span className="text-purple-500 underline decoration-purple-500/30 underline-offset-4">
                    CAR
                  </span>
                </div>
                <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] leading-tight">
                  LOWEST IMPACT
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 w-32 h-32 opacity-10 group-hover/stat:opacity-40 transition-all duration-1000 group-hover/stat:scale-110 pointer-events-none grayscale group-hover/stat:grayscale-0">
                <Image
                  src="/screenshots/dj/cpu-audit.png"
                  alt=""
                  fill
                  className="object-cover rounded-full"
                />
              </div>
            </ProCard>

            <ProCard
              className="p-6 sm:p-10 bg-slate-900/60 border-white/5 relative overflow-hidden group/stat"
              glow
              bgImage="/textures/schematic.png"
            >
              <div className="relative z-10">
                <div className="text-[10px] font-black text-pink-500/50 uppercase tracking-[0.2em] mb-4 font-mono">
                  MOD_04 &mdash; PULSE
                </div>
                <div className="text-4xl sm:text-5xl font-black text-white mb-2 sm:mb-3 italic tracking-tighter">
                  LIVE
                </div>
                <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] leading-tight">
                  FLOOR INSIGHTS
                </div>
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
      <footer className="py-20 px-6 border-t border-slate-900 bg-slate-950 relative overflow-hidden">
        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-purple-500/20 to-transparent" />
        <div className="max-w-6xl mx-auto flex flex-col items-center md:flex-row justify-between gap-12 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center border border-white/5 shadow-2xl group hover:scale-110 transition-transform">
              <Radio className="w-6 h-6 text-purple-400" />
            </div>
            <div className="flex flex-col items-start">
              <span className="font-black text-white text-xl italic tracking-tighter uppercase">
                Pika!
              </span>
              <span className="text-[10px] text-slate-600 font-black uppercase tracking-[0.3em]">
                Registry © 2026
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-12 gap-y-12">
            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] mb-2">
                Platform
              </span>
              <Link
                href="/download"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                Downloads
              </Link>
              <Link
                href="/live"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                Tune In
              </Link>
              <Link
                href="/dj/login"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                DJ Portal
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] mb-2">
                Community
              </span>
              <a
                href="https://instagram.com"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                Instagram
              </a>
              <a
                href="https://discord.com"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                Discord
              </a>
              <Link
                href="/support"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                Help Center
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              <span className="text-[10px] font-black text-white uppercase tracking-[0.3em] mb-2">
                Legal
              </span>
              <Link
                href="/privacy"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                Privacy
              </Link>
              <Link
                href="/terms"
                className="text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all hover:translate-x-1"
              >
                Terms
              </Link>
              <a
                href="https://status.pika.stream"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 mt-2 group/status hover:opacity-80 transition-opacity"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[8px] font-black text-emerald-500/80 uppercase tracking-[0.2em] group-hover/status:underline decoration-emerald-500/30 underline-offset-2">
                  System Live via Kuma
                </span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
