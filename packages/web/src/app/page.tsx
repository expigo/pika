"use client";

import {
  ArrowRight,
  BarChart3,
  Calendar,
  Globe2,
  Headphones,
  Heart,
  History,
  Radio,
  Smartphone,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
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
      <header className="group relative min-h-screen pt-32 sm:pt-48 pb-48 px-4 sm:px-6 text-center z-10 overflow-hidden flex flex-col justify-center">
        {/* Animated Background Gradients - Softened */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1200px] bg-gradient-to-b from-purple-600/15 via-transparent to-transparent blur-[160px] animate-[atmos-pulse_8s_ease-in-out_infinite]" />
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[140px] animate-[flicker_10s_linear_infinite]" />
          <div className="absolute top-[10%] -right-[10%] w-[40%] h-[40%] bg-pink-600/10 rounded-full blur-[120px] animate-[flicker_12s_linear_infinite]" />

          {/* Minimalist Grid Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808015_1px,transparent_1px),linear-gradient(to_bottom,#80808015_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full px-6 py-2.5 mb-16 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000 font-mono">
            <Radio className="w-3.5 h-3.5 text-purple-400/80" />
            <span className="text-[10px] font-semibold text-slate-400 tracking-[0.6em] uppercase">
              Connected • Interactive • Live
            </span>
          </div>

          <h1 className="text-5xl sm:text-7xl md:text-8xl font-bold tracking-tight leading-[1.1] mb-12 drop-shadow-[0_0_40px_rgba(244,63_94,0.15)]">
            <span className="text-white">One Floor.</span>
            <br className="hidden sm:block" />
            <span className="relative inline-block group/heartbeat">
              <span className="bg-gradient-to-r from-rose-500 via-purple-400 to-indigo-500 text-transparent bg-clip-text italic animate-[heartbeat-glow_3s_ease-in-out_infinite]">
                One Heartbeat.
              </span>
            </span>
          </h1>

          <p className="text-xl sm:text-2xl text-slate-400 max-w-2xl mx-auto mb-20 font-normal leading-relaxed tracking-tight px-4 sm:px-0">
            A <span className="text-slate-200 font-semibold">real-time interaction</span> bridge
            from <span className="text-slate-200 font-semibold">THE BOOTH</span> to{" "}
            <span className="text-slate-200 font-semibold">THE FLOOR.</span>{" "}
            <br className="hidden sm:block" />
            <span className="text-slate-200/90 font-medium">
              See what they love. Play what they feel.
            </span>
          </p>

          <div className="relative flex flex-col items-center w-full">
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 relative z-10 w-full mb-12">
              <div className="relative group/dancer w-full sm:w-80">
                <Link
                  href={
                    isLive
                      ? isMultipleDJs
                        ? "/live"
                        : `/live/${firstSession?.sessionId}`
                      : "/live"
                  }
                  className="group relative w-full px-12 py-5 bg-white text-slate-950 font-semibold rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition-all overflow-hidden uppercase text-[11px] tracking-[0.3em] flex items-center justify-center gap-3"
                >
                  <Smartphone className="w-5 h-5 group-hover:text-pink-600 transition-colors" />
                  <span className="relative z-10">
                    Tune In <span className="opacity-50 text-[9px] font-mono">(Dancer)</span>
                  </span>
                  {/* ✨ DANCER BORDER GLOW */}
                  <div className="absolute inset-x-0 bottom-0 h-[2px] bg-pink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="absolute inset-0 bg-pink-500/0 group-hover:bg-pink-500/[0.03] transition-colors" />
                </Link>

                {/* 💓 SIGNAL PATH: Kinetic Energy Conduit (Dancer) - Arcing to Phone */}
                <div className="absolute top-1/2 left-full w-[400px] h-[400px] pointer-events-none hidden lg:block z-0 transform translate-x-4 -translate-y-4">
                  <svg className="w-full h-full overflow-visible">
                    <path
                      d="M 0 0 Q 150 0 250 150 T 360 300"
                      fill="none"
                      stroke="url(#dancer-gradient)"
                      strokeWidth="2"
                      strokeDasharray="10 10"
                      className="opacity-0 group-hover/dancer:opacity-100 transition-opacity duration-700 [stroke-dashoffset:100] group-hover/dancer:animate-[dash_2s_linear_infinite]"
                    />
                    <defs>
                      <linearGradient id="dancer-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#ec4899" stopOpacity="0.8" />
                        <stop offset="100%" stopColor="#ec4899" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
              </div>

              <Link
                href="/dj/register"
                className="group relative w-full sm:w-80 px-12 py-5 bg-white/5 backdrop-blur-xl text-white font-semibold rounded-2xl border border-white/10 hover:border-purple-500/50 hover:bg-white/[0.08] hover:shadow-[0_0_40px_rgba(168,85,247,0.15)] active:scale-[0.98] transition-all overflow-hidden uppercase text-[11px] tracking-[0.3em] flex items-center justify-center gap-3"
              >
                <Headphones className="w-5 h-5 group-hover:text-purple-400 transition-colors" />
                <span className="relative z-10">
                  Go Live <span className="opacity-50 text-[9px] font-mono">(DJ)</span>
                </span>
                {/* ⚡ DJ BORDER GLOW */}
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            </div>

            {/* ⚡ THE LIVE WIRE: Continuous Volumetric Spine (Behind Mockup) */}
            <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%-32px)] hidden sm:flex flex-col items-center pointer-events-none z-0">
              {/* Harbor Node: The Origin Anchor */}
              <div className="w-2 h-2 rounded-full border border-purple-500/30 bg-slate-950 flex items-center justify-center mb-0.5 relative z-10 shadow-[0_0_6px_rgba(168,85,247,0.3)]">
                <div className="w-1 h-1 rounded-full bg-purple-500/60 animate-pulse" />
              </div>

              {/* The Beam: Booth Interior Spine (Flows through mockup) */}
              <div className="relative h-[1200px] w-px">
                {/* Layer 3: Atmos Glow */}
                <div className="absolute inset-0 w-32 -left-16 bg-purple-500/10 blur-3xl" />
                {/* Layer 2: Energy Bleed */}
                <div className="absolute inset-0 w-[2px] -left-[0.5px] bg-purple-500/20 blur-sm" />
                {/* Layer 1: The Core - Fades out naturally before handover */}
                <div className="absolute inset-0 w-px bg-gradient-to-b from-purple-500 via-purple-500/40 to-transparent" />
              </div>
            </div>
          </div>
        </div>

        {/* 📱 THE PRODUCT HANDSHAKE (HERO MOCKUP) - Desktop Only */}
        <div className="hidden sm:block mt-24 sm:mt-48 relative z-[60] w-screen left-1/2 -translate-x-1/2">
          <div className="relative z-10 w-full max-w-[1000px] mx-auto px-6 group/handshake">
            {/* Main Booth Frame: The "Engine" (Demoted Visual Weight) */}
            <div className="relative aspect-[16/10] rounded-xl sm:rounded-2xl border border-white/5 bg-black overflow-hidden shadow-2xl group/booth [perspective:2000px] transform scale-[0.85] opacity-40 grayscale blur-[2px] transition-all duration-[1.5s] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/handshake:scale-95 group-hover/handshake:opacity-60 group-hover/handshake:grayscale-0 group-hover/handshake:blur-0 group-hover/handshake:shadow-purple-500/10">
              {/* ⚡ SYNCHRONIZATION SCANNER (Locked to Container) */}
              <div className="absolute inset-0 z-40 pointer-events-none opacity-0 group-hover/booth:opacity-100 transition-opacity">
                <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-purple-400 to-transparent shadow-[0_0_8px_rgba(168,85,247,0.4)] animate-[scan_6s_linear_infinite]" />
              </div>

              <div className="absolute inset-0 opacity-40 grayscale group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-[2s]">
                <Image
                  src="/screenshots/dj/vdj-sync.png"
                  alt="DJ Booth Integration"
                  fill
                  priority
                  className="object-cover object-center scale-105 group-hover:scale-110 transition-transform duration-[4s] ease-out"
                />
              </div>
              {/* 🌌 Internal Depth Glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

              {/* Integration Badge */}
              <div className="absolute top-8 left-8 px-5 py-2.5 bg-black/60 backdrop-blur-2xl border border-white/5 rounded-2xl z-30 transform group-hover:translate-x-2 transition-transform duration-700">
                <p className="text-[10px] font-semibold text-white/90 tracking-widest uppercase flex items-center gap-2">
                  <History className="w-3 h-3 text-purple-400 animate-pulse" />
                  VirtualDJ Native Bridge
                </p>
              </div>
            </div>

            {/* 📱 Floating Mobile Accessory: The Experience focal point */}
            <div className="absolute -bottom-10 -right-4 sm:-bottom-20 sm:-right-10 w-[130px] sm:w-[240px] aspect-[9/19.5] z-[80] sm:[perspective:2000px] group/phone">
              <div className="relative w-full h-full rounded-[2rem] sm:rounded-[3rem] border-[6px] sm:border-[12px] border-slate-900 bg-slate-950 shadow-[0_40px_120px_rgba(0,0,0,1),0_0_100px_rgba(236,72,153,0.15)] overflow-hidden ring-1 ring-white/20 -rotate-2 transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/handshake:rotate-0 group-hover/handshake:-translate-y-16 group-hover/handshake:scale-110 group-hover/handshake:shadow-pink-500/50">
                {/* Dynamic Island Hardware Detail */}
                <div className="absolute top-2 sm:top-6 left-1/2 -translate-x-1/2 w-10 sm:w-20 h-3 sm:h-6 bg-black rounded-full z-50 flex items-center justify-center border border-white/10">
                  <div className="w-1 h-1 rounded-full bg-slate-800 ml-auto mr-2 sm:mr-5 ring-1 ring-white/5" />
                </div>

                {/* Screenshot Core */}
                <div className="relative w-full h-full pointer-events-none">
                  <Image
                    src="/screenshots/dancer/live-id.png"
                    alt="Dancer Mobile View"
                    fill
                    className="object-cover opacity-90 group-hover/handshake:opacity-100 transition-opacity duration-700"
                  />
                </div>

                {/* Glass Reflection Overlay */}
                <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-white/10 pointer-events-none z-40" />

                {/* Kinetic Light Sweep */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover/handshake:animate-[sweep_2.5s_ease-in-out_infinite] z-50" />
              </div>
            </div>

            {/* Technical Callout */}
            <div className="absolute top-1/2 -left-8 sm:-left-20 -translate-y-1/2 px-10 py-8 bg-black/60 backdrop-blur-3xl border border-white/5 rounded-[2.5rem] shadow-2xl z-[80] hidden lg:block transform group-hover:-translate-x-10 group-hover:-translate-y-1/2 transition-all duration-1000 delay-150">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/80 animate-pulse" />
                <span className="text-[9px] font-semibold text-emerald-500/80 uppercase tracking-[0.4em]">
                  Sync Engine
                </span>
              </div>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between items-center text-[8px] font-semibold text-slate-500 tracking-[0.2em] uppercase mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-700">
                    <span>Native Bridge</span>
                    <span className="text-purple-400/80">Active</span>
                  </div>
                  <div className="h-0.5 w-32 bg-white/5 rounded-full overflow-hidden text-left relative">
                    <div className="h-full w-0 group-hover:w-full bg-purple-500/60 relative transition-all duration-1000 ease-out delay-200" />
                    {/* ⚡ ENERGY PACKET (Full Width Transit) */}
                    <div className="absolute top-0 left-0 h-full w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[200%] group-hover:animate-[sweep_2s_linear_infinite] delay-1000" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center text-[8px] font-semibold text-slate-500 tracking-[0.2em] uppercase mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-700 delay-300">
                    <span>Cloud Feed</span>
                    <span className="text-pink-400/80">Streaming</span>
                  </div>
                  <div className="h-0.5 w-24 bg-white/5 rounded-full overflow-hidden text-left relative">
                    <div className="h-full w-0 group-hover:w-full bg-pink-500/60 relative transition-all duration-1000 ease-out delay-500" />
                    {/* ⚡ ENERGY PACKET (Full Width Transit) */}
                    <div className="absolute top-0 left-0 h-full w-20 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[200%] group-hover:animate-[sweep_2.5s_linear_infinite] delay-1500" />
                  </div>
                </div>
              </div>
            </div>

            {/* 🖥️ PIKA! DESKTOP SIDECAR: The Intelligence Focal Point (Premium Glass HUD) */}
            <div className="absolute -top-24 right-4 sm:-top-32 sm:right-0 w-[360px] aspect-[16/11] rounded-[2.5rem] border-[2px] border-white/10 bg-slate-900/40 backdrop-blur-3xl overflow-hidden shadow-[0_80px_160px_rgba(0,0,0,0.8),0_0_100px_rgba(168,85,247,0.15)] z-[85] hidden lg:block transform group-hover/handshake:-translate-y-12 rotate-1 opacity-0 group-hover/handshake:opacity-100 transition-all duration-[1.5s] delay-300 pointer-events-none">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/40 via-transparent to-transparent pointer-events-none z-10" />
              <div className="absolute inset-x-0 h-[100%] top-0 bg-gradient-to-b from-purple-500/0 via-purple-500/5 to-purple-500/0 translate-y-[-100%] group-hover/handshake:animate-[scan_8s_linear_infinite] z-20" />

              <Image
                src="/screenshots/dj/track-inspector.png"
                alt="Pika! Track Inspector"
                fill
                className="object-cover scale-110 group-hover/handshake:scale-100 transition-transform duration-[3s] ease-out opacity-90 group-hover/handshake:opacity-100"
              />

              <div className="absolute top-6 left-8 flex items-center gap-3 z-30 bg-black/60 backdrop-blur-2xl px-4 py-2 rounded-2xl border border-white/10 shadow-xl">
                <div className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                <span className="text-[10px] font-black text-white tracking-[0.4em] uppercase">
                  Pika! Intelligence
                </span>
              </div>

              {/* Glass Polish Overlay */}
              <div className="absolute inset-0 bg-gradient-to-tr from-white/5 via-transparent to-transparent z-40" />

              {/* Hardware Light Sweep */}
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover/handshake:animate-[sweep_4s_ease-in-out_infinite] z-50" />
            </div>
          </div>
        </div>

        {/* Global Atmospheric Mask */}
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent z-40 pointer-events-none" />

        {/* ⚡ THE LIVE WIRE: Hero Exit Handover (Section Boundary Marker) */}
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center z-10 pointer-events-none">
          <div className="relative h-32 w-px">
            <div className="absolute inset-0 w-32 -left-16 bg-purple-500/5 blur-3xl" />
            <div className="absolute inset-0 w-px bg-gradient-to-t from-purple-500 to-transparent" />
          </div>
        </div>
      </header>

      {/* 🎯 AUDIENCE TRIFECTA */}
      <section className="pt-48 pb-64 px-4 bg-slate-950 relative overflow-hidden">
        {/* ⚡ THE LIVE WIRE: Ecosystem Entry Pulse (Marker - Ends before Pill) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 hidden sm:flex flex-col items-center pointer-events-none z-10">
          <div className="relative h-32 w-px">
            {/* Layer 3: Atmos Glow */}
            <div className="absolute inset-0 w-32 -left-16 bg-purple-500/10 blur-3xl" />
            {/* Layer 1: The Core - Fades out before content */}
            <div className="absolute inset-0 w-px bg-gradient-to-b from-purple-500 via-purple-500/40 to-transparent" />
          </div>
        </div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-purple-600/5 blur-[120px] pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-32 relative">
            <span className="relative z-[70] inline-block px-6 py-2 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4em] mb-8">
              The Ecosystem
            </span>
            <h2 className="text-4xl sm:text-6xl font-bold text-white tracking-tight italic uppercase">
              A Unified Experience.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-10 items-stretch">
            {/* DJs Card */}
            <ProCard
              className="p-12 flex flex-col items-start h-full group/card transition-all duration-1000 bg-slate-950/40 border-white/5"
              glow
              glowColor="purple-500"
              bgImage="/textures/dj.png"
            >
              <div className="w-16 h-16 bg-purple-500/5 border border-purple-500/10 rounded-[1.5rem] flex items-center justify-center mb-10 group-hover:bg-purple-500/20 group-hover:border-purple-500/30 transition-all duration-700 shadow-[0_0_20px_rgba(168,85,247,0.05)]">
                <Headphones className="w-8 h-8 text-slate-300 group-hover:text-purple-400 transition-colors" />
              </div>
              <div className="flex flex-col mb-4">
                <span className="text-[10px] font-bold text-purple-500/50 uppercase tracking-[0.3em] mb-1">
                  Persona: DJ
                </span>
                <h3 className="text-3xl font-bold text-white italic uppercase tracking-tight">
                  The Booth
                </h3>
              </div>
              <p className="text-slate-400 text-sm font-medium mb-12 leading-relaxed">
                Connect the source to the crowd. Real-time data, library insights, and digital floor
                signals.
              </p>

              <ul className="space-y-6 text-[14px] text-slate-400 font-medium flex-1">
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover/item:bg-purple-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Digital Handshake Protocol
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover/item:bg-purple-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Library Energy Dynamics
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover/item:bg-purple-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Post-Set Intelligence
                  </span>
                </li>
              </ul>

              <Link
                href="/for/djs"
                className="mt-12 w-full flex items-center justify-center px-8 py-4 bg-white/5 hover:bg-purple-500/10 text-slate-300 hover:text-white border border-white/10 hover:border-purple-500/30 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all active:scale-[0.98] backdrop-blur-sm shadow-xl"
              >
                Sidecar Specs
              </Link>
            </ProCard>

            {/* Dancers Card */}
            <ProCard
              className="p-12 flex flex-col items-start h-full group/card transition-all duration-1000 bg-slate-950/40 border-white/5"
              glow
              glowColor="pink-500"
              bgImage="/textures/dancer.png"
            >
              <div className="w-16 h-16 bg-pink-500/5 border border-pink-500/10 rounded-[1.5rem] flex items-center justify-center mb-10 group-hover:bg-pink-500/20 group-hover:border-pink-500/30 transition-all duration-700 shadow-[0_0_20px_rgba(236,72,153,0.05)]">
                <Heart className="w-8 h-8 text-slate-300 group-hover:text-pink-400 transition-colors" />
              </div>
              <div className="flex flex-col mb-4">
                <span className="text-[10px] font-bold text-pink-500/50 uppercase tracking-[0.3em] mb-1">
                  Persona: Dancer
                </span>
                <h3 className="text-3xl font-bold text-white italic uppercase tracking-tight">
                  The Floor
                </h3>
              </div>
              <p className="text-slate-400 text-sm font-medium mb-12 leading-relaxed">
                Stay in sync with the source. Identify tracks, build your history, and vote on the
                rhythm.
              </p>

              <ul className="space-y-6 text-[14px] text-slate-400 font-medium flex-1">
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/40 group-hover/item:bg-pink-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Zero-Friction Tune-In
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/40 group-hover/item:bg-pink-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Private Floor Journal
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/40 group-hover/item:bg-pink-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Vibe Sentiment Signal
                  </span>
                </li>
              </ul>

              <Link
                href="/guide/web-app"
                className="mt-12 w-full flex items-center justify-center px-8 py-4 bg-white/5 hover:bg-pink-500/10 text-slate-300 hover:text-white border border-white/10 hover:border-pink-500/30 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all active:scale-[0.98] backdrop-blur-sm shadow-xl"
              >
                Join the Floor
              </Link>
            </ProCard>

            {/* Organizers Card */}
            <ProCard
              className="p-12 flex flex-col items-start h-full group/card transition-all duration-1000 bg-slate-950/40 border-white/5"
              glow
              glowColor="emerald-500"
              bgImage="/textures/organizer.png"
            >
              <div className="w-16 h-16 bg-emerald-500/5 border border-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mb-10 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 transition-all duration-700 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                <Calendar className="w-8 h-8 text-slate-300 group-hover:text-emerald-400 transition-colors" />
              </div>
              <div className="flex flex-col mb-4">
                <span className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-[0.3em] mb-1">
                  Persona: Event
                </span>
                <h3 className="text-3xl font-bold text-white italic uppercase tracking-tight">
                  The Grid
                </h3>
              </div>
              <p className="text-slate-400 text-sm font-medium mb-12 leading-relaxed">
                Monitor the infrastructure. Multi-room surveillance and direct command-to-phone
                broadcasting.
              </p>

              <ul className="space-y-6 text-[14px] text-slate-400 font-medium flex-1">
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 group-hover/item:bg-emerald-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Command Center Portal
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 group-hover/item:bg-emerald-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Booth-to-Phone Pulse
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 group-hover/item:bg-emerald-500 transition-colors" />
                  <span className="group-hover:text-slate-300 transition-colors">
                    Auto-Healing Stability
                  </span>
                </li>
              </ul>

              <a
                href="mailto:hello@pika.stream"
                className="mt-12 w-full flex items-center justify-center px-8 py-4 bg-white/5 hover:bg-emerald-500/10 text-slate-300 hover:text-white border border-white/10 hover:border-emerald-500/30 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all active:scale-[0.98] backdrop-blur-sm shadow-xl"
              >
                Contact Beta
              </a>
            </ProCard>
          </div>
        </div>

        {/* ⚡ EXIT PULSE: Ecosystem ➔ DJ (Transition Marker) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-purple-500/60 to-transparent z-10 pointer-events-none" />

        {/* 🌫️ ATMOSPHERIC BLEED: Soften the horizon to Black */}
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black to-transparent pointer-events-none" />
      </section>

      <section className="pt-48 pb-64 bg-black overflow-hidden relative">
        {/* ⚡ ENTRY PULSE: DJ Energy (Transition Marker) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-purple-500/60 to-transparent z-10 pointer-events-none" />

        {/* ✨ SPILL GLOW: Leak energy into the section above */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-purple-500/20 blur-[140px] -translate-y-1/2 pointer-events-none opacity-50" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-purple-600/5 blur-[160px] pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          {/* Centered DJ Header */}
          <div className="text-center mb-32">
            <span className="inline-block px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-10">
              The Product Registry
            </span>
            <h2 className="text-4xl sm:text-6xl font-bold text-white italic uppercase tracking-tight leading-[1.1]">
              The DJ&apos;s <br />
              <span className="text-purple-400">Sixth Sense.</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-32 items-center">
            <div>
              <p className="text-xl text-slate-400 font-normal leading-relaxed mb-16 tracking-tight">
                Don&apos;t just play tracks. Play the room. Pika! surfaces{" "}
                <span className="text-slate-200 font-semibold">crowd reactions</span> and integrates
                your personal library notes, giving you a{" "}
                <span className="text-slate-200 font-semibold">predictive glimpse</span> into the
                floor&apos;s heartbeat.
              </p>

              <div className="space-y-10">
                <div className="flex gap-6 group/item">
                  <div className="w-px h-12 bg-slate-800 group-hover/item:bg-purple-500 transition-colors" />
                  <div>
                    <h4 className="text-[11px] font-bold text-white uppercase tracking-widest mb-2 italic">
                      Performance Memory
                    </h4>
                    <p className="text-slate-500 text-sm font-medium">
                      Surface crowd feedback from every set you&apos;ve anchored.
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 group/item">
                  <div className="w-px h-12 bg-slate-800 group-hover/item:bg-purple-500 transition-colors" />
                  <div>
                    <h4 className="text-[11px] font-bold text-white uppercase tracking-widest mb-2 italic">
                      Technical Audit
                    </h4>
                    <p className="text-slate-500 text-sm font-medium">
                      Precision ID of Key, BPM, and Energy via direct bridge.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative group [perspective:2000px]">
              <div className="absolute -inset-20 bg-purple-500/10 rounded-[4rem] blur-[120px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative aspect-[16/10] rounded-[3rem] border border-white-[0.5px] border-white/5 bg-slate-900 overflow-hidden shadow-2xl transform transition-all duration-1000 ease-out group-hover:rotate-y-6 group-hover:-rotate-x-3 group-hover:translate-x-2 group-hover:scale-[1.02]">
                <Image
                  src="/screenshots/dj/governance-view.png"
                  alt="High Resolution Performance Mode"
                  fill
                  className="object-cover opacity-80 group-hover:opacity-100 transition-all duration-[2s]"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-transparent pointer-events-none" />
              </div>

              {/* Mobile HUD Overlay - Showing the "Other Side" of the bridge */}
              <div className="absolute -bottom-12 -left-16 w-36 aspect-[9/19.5] rounded-[1.5rem] border-4 border-slate-950 bg-slate-950 shadow-[0_30px_60px_rgba(0,0,0,0.8)] z-20 hidden md:block transform transition-all duration-1000 delay-100 group-hover:-translate-y-8 group-hover:translate-x-8 -rotate-6 group-hover:rotate-0 overflow-hidden">
                <Image
                  src="/screenshots/dancer/live-id.png"
                  alt="Floor Signal"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent pointer-events-none" />
                <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-white/10 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* ⚡ EXIT PULSE: DJ ➔ Handshake */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-purple-500/40 to-transparent z-10" />

        {/* 🌫️ ATMOSPHERIC BLEED: Soften the horizon back to Slate-950 */}
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
      </section>

      {/* ⚡ THE HANDSHAKE */}
      <section className="pt-48 pb-80 px-6 bg-slate-950 relative overflow-hidden">
        {/* 📐 BLUEPRINT GROUNDING */}
        <div className="absolute inset-0 bg-[url('/textures/schematic.png')] bg-repeat opacity-[0.03] grayscale pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,#020617_100%)] pointer-events-none" />

        {/* ⚡ ENTRY PULSE: Handshake (DJ Initiative) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-purple-500/40 to-transparent z-10" />
        {/* Energy Carry-over & Reverse Spill */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[400px] bg-purple-500/10 blur-[120px] -translate-y-1/2 pointer-events-none opacity-30" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-40">
            <span className="inline-block px-6 py-2 bg-white/5 border border-white/5 rounded-full text-[10px] font-semibold text-slate-500 uppercase tracking-[0.4em] mb-10">
              The Connection
            </span>
            <h2 className="text-4xl sm:text-6xl font-bold text-white italic uppercase tracking-tight">
              Start in Seconds.
            </h2>
          </div>

          <div className="relative">
            {/* 🏗️ CENTRAL SPINE: The Interaction Bridge */}
            <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-px hidden md:block">
              {/* Internal Spines: Reflection of both roles (Visual Thread) */}
              <div className="absolute inset-y-0 left-[-1px] w-px bg-gradient-to-b from-transparent via-purple-500/30 to-transparent" />
              <div className="absolute inset-y-0 right-[-1px] w-px bg-gradient-to-b from-transparent via-pink-500/30 to-transparent" />

              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-800 to-transparent" />

              {/* 🧩 THE SYNC HUB: Central Intersection */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-slate-950 border border-white/40 z-20 shadow-[0_0_10px_rgba(255,255,255,0.2)]" />

                {/* ⚡ THE RELATIONSHIP PULSE: One Heartbeat Visibility Upgrade */}
                <div className="absolute w-[160px] h-[2px] flex items-center justify-center">
                  {/* The 'Bloom' (Soft Energy) */}
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/40 via-white/40 to-pink-500/40 blur-[4px] animate-pulse" />
                  {/* The 'Wire' (Sharp Data) */}
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/60 via-white/80 to-pink-500/60" />
                </div>
              </div>

              {/* Alignment Nodes */}
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-800 border border-slate-700" />
              <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-800 border border-slate-700" />
            </div>

            <div className="grid md:grid-cols-2 gap-20 lg:gap-40 items-start relative">
              {/* DJ FLOW: The Source */}
              <div className="relative p-12 rounded-[2.5rem] border border-white/5 bg-slate-900/20 backdrop-blur-sm group/orbit overflow-hidden">
                <div className="absolute -inset-10 bg-purple-500/5 blur-[80px] opacity-0 group-hover/orbit:opacity-100 transition-opacity duration-1000" />

                <div className="relative flex flex-col space-y-16">
                  <div className="flex items-center justify-between pb-6 mb-8 border-b border-white/5">
                    <span className="text-[10px] font-mono font-bold text-purple-500/50 uppercase tracking-[0.3em]">
                      Role: The Booth
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                  </div>
                  <div className="flex gap-8 group/step">
                    <div className="text-[40px] font-black text-white/5 group-hover/step:text-purple-500/20 transition-all duration-700 italic leading-none">
                      01
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-3 italic uppercase tracking-tight">
                        Connect Sidecar
                      </h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                        Download the macOS binary and bridge your VirtualDJ session in one click.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-8 group/step">
                    <div className="text-[40px] font-black text-white/5 group-hover/step:text-purple-500/20 transition-all duration-700 italic leading-none">
                      02
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-3 italic uppercase tracking-tight">
                        Sync the Pulse
                      </h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                        Your library intelligence and floor signals are automatically synchronized.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/dj/register"
                    className="w-full flex items-center justify-center px-10 py-5 bg-white text-slate-950 font-bold rounded-xl hover:bg-slate-100 transition-all uppercase text-[10px] tracking-[0.2em] shadow-2xl active:scale-[0.98]"
                  >
                    Register Booth
                  </Link>
                </div>
              </div>

              {/* DANCER FLOW: The Sync */}
              <div className="relative p-12 rounded-[2.5rem] border border-white/5 bg-slate-900/20 backdrop-blur-sm group/orbit overflow-hidden">
                <div className="absolute -inset-10 bg-pink-500/5 blur-[80px] opacity-0 group-hover/orbit:opacity-100 transition-opacity duration-1000" />

                <div className="relative flex flex-col space-y-16">
                  <div className="flex items-center justify-between pb-6 mb-8 border-b border-white/5">
                    <span className="text-[10px] font-mono font-bold text-pink-500/50 uppercase tracking-[0.3em]">
                      Role: The Floor
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
                  </div>
                  <div className="flex gap-8 group/step">
                    <div className="text-[40px] font-black text-white/5 group-hover/step:text-pink-500/20 transition-all duration-700 italic leading-none">
                      01
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-3 italic uppercase tracking-tight">
                        Scan QR
                      </h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                        Scan the booth code. No apps to install, no passwords to type.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-8 group/step">
                    <div className="text-[40px] font-black text-white/5 group-hover/step:text-pink-500/20 transition-all duration-700 italic leading-none">
                      02
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white mb-3 italic uppercase tracking-tight">
                        Join the Loop
                      </h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                        Real-time track updates, voting, and journaling at your fingertips.
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/live"
                    className="w-full flex items-center justify-center px-10 py-5 bg-slate-900 text-white font-bold rounded-xl border border-white/10 hover:bg-slate-800 transition-all uppercase text-[10px] tracking-[0.2em] shadow-2xl active:scale-[0.98]"
                  >
                    Join Floor
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ⚡ EXIT PULSE: Handshake ➔ Evolution (Dancer Momentum) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-pink-500/40 to-transparent z-10" />

        {/* ✨ PREDICTIVE GLOW: Signal the energy of the Evolution section */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-full h-[300px] bg-pink-500/10 blur-[100px] translate-y-1/2 pointer-events-none opacity-40" />

        {/* 🌫️ ATMOSPHERIC MASK: Submerge the blueprint texture */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
      </section>

      {/* 🚀 THE EVOLUTION */}
      <section className="pt-48 pb-64 px-6 bg-slate-950 overflow-hidden relative">
        {/* ⚡ ENTRY PULSE: Evolution (Carrying the Floor Energy) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-pink-500/40 to-transparent z-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-purple-600/5 blur-[120px] pointer-events-none" />

        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-32">
            <span className="inline-block px-6 py-2 bg-white/5 border border-white/5 rounded-full text-[10px] font-semibold text-slate-500 uppercase tracking-[0.4em] mb-10">
              Phase: The Evolution
            </span>
            <h2 className="text-4xl sm:text-6xl font-bold text-white italic uppercase tracking-tight">
              Forward Thinking.
            </h2>
          </div>

          <div className="relative">
            {/* 🌫️ ATMOSPHERIC HORIZON: Minimalist glow to unify the roadmap without distracting lines */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-[300px] bg-gradient-to-r from-purple-500/5 via-pink-500/5 to-emerald-500/5 blur-[120px] pointer-events-none" />

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10 relative">
              {/* Charts */}
              <ProCard
                className="p-10 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/40 border-white/5 transition-all duration-1000 hover:-translate-y-2"
                glow
              >
                <div className="w-16 h-16 bg-white/5 border border-purple-500/20 rounded-full flex items-center justify-center mb-10 group-hover/roadmap:border-purple-500/50 transition-colors relative z-10">
                  <BarChart3 className="w-6 h-6 text-purple-400/80" />
                </div>
                <h4 className="text-[11px] font-semibold text-white mb-4 uppercase tracking-[0.2em]">
                  Pika! Charts
                </h4>
                <p className="text-slate-500 text-[13px] font-medium leading-relaxed">
                  The global Billboard for WCS. Real-time community trends and popularity metrics.
                </p>
              </ProCard>

              {/* Profiles */}
              <ProCard
                className="p-10 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/40 border-white/5 transition-all duration-1000 hover:-translate-y-2 delay-100"
                glow
              >
                <div className="w-16 h-16 bg-white/5 border border-pink-500/20 rounded-full flex items-center justify-center mb-10 group-hover/roadmap:border-pink-500/50 transition-colors relative z-10">
                  <Smartphone className="w-6 h-6 text-pink-400/80" />
                </div>
                <h4 className="text-[11px] font-semibold text-white mb-4 uppercase tracking-[0.2em]">
                  Dance DNA
                </h4>
                <p className="text-slate-500 text-[13px] font-medium leading-relaxed">
                  Claim your favorite tracks and build your permanent personal dance log.
                </p>
              </ProCard>

              {/* Showcases */}
              <ProCard
                className="p-10 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/40 border-white/5 transition-all duration-1000 hover:-translate-y-2 delay-200"
                glow
              >
                <div className="w-16 h-16 bg-white/5 border border-purple-500/20 rounded-full flex items-center justify-center mb-10 group-hover/roadmap:border-purple-500/50 transition-colors relative z-10">
                  <Radio className="w-6 h-6 text-purple-400/80" />
                </div>
                <h4 className="text-[11px] font-semibold text-white mb-4 uppercase tracking-[0.2em]">
                  Portfolios
                </h4>
                <p className="text-slate-500 text-[13px] font-medium leading-relaxed">
                  Live-updated gig schedules and shareable, pro-grade EPK statistics.
                </p>
              </ProCard>

              {/* Venues */}
              <ProCard
                className="p-10 flex flex-col items-center text-center h-full group/roadmap bg-slate-900/40 border-white/5 transition-all duration-1000 hover:-translate-y-2 delay-300"
                glow
              >
                <div className="w-16 h-16 bg-white/5 border border-emerald-500/20 rounded-full flex items-center justify-center mb-10 group-hover/roadmap:border-emerald-500/50 transition-colors relative z-10">
                  <Globe2 className="w-6 h-6 text-emerald-400/80" />
                </div>
                <h4 className="text-[11px] font-semibold text-white mb-4 uppercase tracking-[0.2em]">
                  Global Venues
                </h4>
                <p className="text-slate-500 text-[13px] font-medium leading-relaxed">
                  Unified tracking and centralized command for major dance conventions.
                </p>
              </ProCard>
            </div>
          </div>
        </div>

        {/* ⚡ EXIT PULSE: Evolution ➔ Engine (System Integrity) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-emerald-500/40 to-transparent z-10" />
      </section>

      {/* 🚀 COMMUNITY ENGINE */}
      <section className="pt-64 pb-64 px-6 bg-slate-950 relative overflow-hidden">
        {/* ⚡ ENTRY PULSE: Engine Energy (System Precision) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-32 bg-gradient-to-b from-emerald-500/80 to-transparent z-10" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-emerald-600/5 blur-[130px] -translate-y-1/2 pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <div className="text-center mb-32">
            <span className="inline-block px-6 py-2 bg-white/5 border border-white/5 rounded-full text-[10px] font-semibold text-slate-500 uppercase tracking-[0.4em] mb-10">
              Phase: The Engine
            </span>
            <h2 className="text-4xl sm:text-6xl font-bold text-white italic uppercase tracking-tight">
              Engineered for the Moment.
            </h2>
          </div>

          <p className="text-xl text-slate-400 mb-32 font-normal leading-relaxed max-w-xl mx-auto tracking-tight">
            Technology should never get in the way of a good dance. Pika! runs silently in the
            background, ensuring every beat and every connection is captured without losing{" "}
            <span className="text-slate-200 font-medium italic text-emerald-400/80">the vibe.</span>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 relative">
            {/* LatENCY: GRID/EMERALD */}
            <ProCard
              className="p-10 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
              bgImage="/textures/schematic.png"
            >
              <div className="absolute inset-0 bg-slate-950/40 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/0 via-emerald-500/[0.03] to-emerald-500/0 -translate-y-full group-hover/stat:animate-[scan_3s_linear_infinite] pointer-events-none" />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <div className="text-[10px] font-semibold text-emerald-500/70 uppercase tracking-[0.3em] font-mono">
                      Lat_01
                    </div>
                  </div>
                  <Radio className="w-3 h-3 text-emerald-500/30" />
                </div>
                <div className="text-4xl font-bold text-white mb-6 italic tracking-tight font-mono group-hover/stat:animate-[flicker_4s_infinite]">
                  &lt; 1<span className="text-[20px] ml-1">ms</span>
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.2em]">
                    Signal Latency
                  </div>
                  <div className="w-fit text-[8px] font-bold text-emerald-500 uppercase tracking-widest px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/30 shadow-[0_0_8px_rgba(16,185,129,0.2)]">
                    Nominal
                  </div>
                </div>
              </div>
            </ProCard>

            {/* PRIVACY: FLOOR/PINK */}
            <ProCard
              className="p-10 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
              bgImage="/screenshots/dj/governance-view.png"
            >
              <div className="absolute inset-0 bg-slate-950/90 pointer-events-none group-hover/stat:bg-slate-950/80 transition-colors" />
              <div className="absolute inset-0 bg-gradient-to-b from-pink-500/0 via-pink-500/[0.03] to-pink-500/0 -translate-y-full group-hover/stat:animate-[scan_3s_linear_infinite] pointer-events-none" />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-pink-500 animate-pulse" />
                    <div className="text-[10px] font-semibold text-pink-500/70 uppercase tracking-[0.3em] font-mono">
                      Sec_02
                    </div>
                  </div>
                  <Smartphone className="w-3 h-3 text-pink-500/30" />
                </div>
                <div className="text-4xl font-bold text-white mb-6 italic tracking-tight font-mono">
                  100%
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.2em]">
                    Data Privacy
                  </div>
                  <div className="w-fit text-[8px] font-bold text-pink-500 uppercase tracking-widest px-2 py-0.5 bg-pink-500/10 rounded border border-pink-500/30 shadow-[0_0_8px_rgba(236,72,153,0.2)]">
                    Encrypted
                  </div>
                </div>
              </div>
            </ProCard>

            {/* CPU: BOOTH/PURPLE */}
            <ProCard
              className="p-10 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
              bgImage="/screenshots/dj/cpu-audit.png"
            >
              <div className="absolute inset-0 bg-slate-950/90 pointer-events-none group-hover/stat:bg-slate-950/80 transition-colors" />
              <div className="absolute inset-0 bg-gradient-to-b from-purple-500/0 via-purple-500/[0.03] to-purple-500/0 -translate-y-full group-hover/stat:animate-[scan_3s_linear_infinite] pointer-events-none" />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-purple-500 animate-pulse" />
                    <div className="text-[10px] font-semibold text-purple-500/70 uppercase tracking-[0.3em] font-mono">
                      Sys_03
                    </div>
                  </div>
                  <BarChart3 className="w-3 h-3 text-purple-500/30" />
                </div>
                <div className="text-4xl font-bold text-white mb-6 italic tracking-tight font-mono">
                  &lt; 1%
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.2em]">
                    CPU Overhead
                  </div>
                  <div className="w-fit text-[8px] font-bold text-purple-500 uppercase tracking-widest px-2 py-0.5 bg-purple-500/10 rounded border border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.2)]">
                    Isolated
                  </div>
                </div>
              </div>
            </ProCard>

            {/* PULSE: FLOOR/PINK */}
            <ProCard
              className="p-10 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
              bgImage="/textures/schematic.png"
            >
              <div className="absolute inset-0 bg-slate-950/40 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-b from-pink-500/0 via-pink-500/[0.03] to-pink-500/0 -translate-y-full group-hover/stat:animate-[scan_3s_linear_infinite] pointer-events-none" />
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-pink-500 animate-pulse" />
                    <div className="text-[10px] font-semibold text-pink-500/70 uppercase tracking-[0.3em] font-mono">
                      Vib_04
                    </div>
                  </div>
                  <History className="w-3 h-3 text-pink-500/30" />
                </div>
                <div className="text-4xl font-bold text-white mb-6 italic tracking-tight font-mono flex items-baseline gap-2 group-hover/stat:animate-[flicker_2s_infinite]">
                  Live
                  <span className="w-2 h-2 rounded-full bg-pink-500 animate-ping" />
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase tracking-[0.2em]">
                    Floor Pulse
                  </div>
                  <div className="w-fit text-[8px] font-bold text-pink-500 uppercase tracking-widest px-2 py-0.5 bg-pink-500/10 rounded border border-pink-500/30 shadow-[0_0_8px_rgba(236,72,153,0.2)]">
                    Synchronized
                  </div>
                </div>
              </div>
            </ProCard>
          </div>
        </div>

        {/* ⚡ EXIT PULSE: Engine ➔ Final CTA (Final Handover) */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-t from-purple-500/40 to-transparent z-10" />
      </section>

      {/* 🦶 BOTTOM CTA */}
      <section className="pt-48 pb-80 px-6 relative overflow-hidden bg-slate-950">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-px h-24 bg-gradient-to-b from-purple-500/60 to-transparent" />
          <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.8)] z-10" />
        </div>

        {/* 🎨 NEXUS CONVERGENCE GLOW (Intensified Volumetric Bloom) */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-7xl h-[800px] flex justify-center pointer-events-none">
          <div className="absolute inset-0 bg-purple-600/15 blur-[160px] animate-pulse duration-[8000ms]" />
          <div className="absolute -left-1/3 top-1/2 w-[120%] h-[500px] bg-pink-600/10 blur-[150px] -rotate-12" />
          <div className="absolute -right-1/3 top-0 w-[120%] h-[500px] bg-emerald-600/10 blur-[150px] rotate-12" />
        </div>

        <div className="relative max-w-4xl mx-auto text-center">
          <h2 className="text-5xl sm:text-7xl font-bold text-white mb-16 italic uppercase tracking-tight">
            Elevate the Vibe.
          </h2>

          <div className="flex flex-col sm:flex-row justify-center gap-8 mb-40">
            <Link
              href="/dj/register"
              className="group relative px-14 py-6 bg-white text-slate-950 font-semibold rounded-2xl hover:bg-slate-50 transition-all uppercase text-[11px] tracking-[0.3em] active:scale-[0.98] overflow-hidden"
            >
              {/* ✨ TRIFECTA BORDER GLOW */}
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-purple-500 via-pink-500 to-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />
              <span className="relative z-10">Start DJing</span>
            </Link>
          </div>

          <div className="pt-24 border-t border-white/5">
            <span className="inline-block px-6 py-2 bg-white/5 border border-white/5 rounded-full text-[9px] font-semibold text-slate-500 uppercase tracking-[0.4em] mb-8">
              Phase: Integration
            </span>
            <p className="text-slate-400 text-[15px] font-medium mb-10 max-w-md mx-auto leading-relaxed">
              Want to bring Pika! to your local event or WCS convention?
            </p>
            <a
              href="mailto:hello@pika.stream"
              className="group/mail inline-block text-white hover:text-purple-400 font-medium italic uppercase tracking-widest hover:tracking-[0.15em] transition-all text-2xl font-mono relative"
            >
              <span className="relative z-10">hello@pika.stream</span>
              <div className="absolute inset-x-0 bottom-0 h-px bg-purple-500/0 group-hover/mail:bg-purple-500/50 group-hover/mail:shadow-[0_0_8px_rgba(168,85,247,0.4)] transition-all" />
            </a>
          </div>
        </div>
      </section>

      {/* 🏁 FOOTER */}
      <footer className="py-24 px-6 border-t border-white/5 bg-slate-950 relative overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-20 items-start">
          <div className="flex flex-col items-start gap-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/5 shadow-2xl group hover:scale-110 transition-transform">
                <Radio className="w-6 h-6 text-purple-400/80" />
              </div>
              <div className="flex flex-col items-start">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white text-2xl italic tracking-tight uppercase">
                    Pika!
                  </span>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/5 border border-emerald-500/10 rounded-md">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                    </span>
                    <span className="text-[7px] font-bold text-emerald-500/60 uppercase tracking-widest font-mono">
                      Active
                    </span>
                  </div>
                </div>
                <span className="text-[9px] text-slate-600 font-semibold uppercase tracking-[0.4em] font-mono mt-1">
                  Registry © 2026<span className="text-purple-500/50">_v</span>
                  <span className="text-pink-500/50">0.2.1</span>
                </span>
              </div>
            </div>
            <p className="text-slate-500 text-[13px] font-medium leading-relaxed max-w-xs">
              The high-fidelity interaction bridge for the global dance community.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 col-span-1 lg:col-span-3 gap-16 relative">
            {/* ⚡ SYSTEM TRACE: Architecture Link */}
            <div className="absolute top-0 left-0 right-0 h-px bg-white/[0.03] -translate-y-8" />

            <div className="flex flex-col gap-6">
              <span className="text-[10px] font-semibold text-white uppercase tracking-[0.4em]">
                Platform
              </span>
              <div className="flex flex-col gap-4 text-[13px] font-medium text-slate-500 italic uppercase tracking-wider">
                <Link href="/download" className="hover:text-white transition-colors">
                  Downloads
                </Link>
                <Link href="/live" className="hover:text-white transition-colors">
                  Tune In
                </Link>
                <Link href="/dj/register" className="hover:text-white transition-colors">
                  Go Live
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <span className="text-[10px] font-semibold text-white uppercase tracking-[0.4em]">
                Community
              </span>
              <div className="flex flex-col gap-4 text-[13px] font-medium text-slate-500 italic uppercase tracking-wider">
                <a
                  href="https://instagram.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Instagram
                </a>
                <a
                  href="https://discord.com"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white transition-colors"
                >
                  Discord
                </a>
                <Link href="/support" className="hover:text-white transition-colors">
                  Support
                </Link>
              </div>
            </div>

            <div className="flex flex-col gap-6">
              <span className="text-[10px] font-semibold text-white uppercase tracking-[0.4em]">
                Legal
              </span>
              <div className="flex flex-col gap-4 text-[13px] font-medium text-slate-500 italic uppercase tracking-wider">
                <Link href="/privacy" className="hover:text-white transition-colors">
                  Privacy
                </Link>
                <Link href="/terms" className="hover:text-white transition-colors">
                  Terms
                </Link>
                <div className="text-[9px] font-medium text-slate-700 uppercase tracking-[0.2em] font-mono mt-4 flex items-center gap-1">
                  Signal: Nominal_Pulse
                  <span className="w-1 h-3 bg-emerald-500/30 animate-[blink_1s_step-end_infinite]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
