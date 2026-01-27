"use client";

import { logger } from "@pika/shared";
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
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { useVisibility } from "@/hooks/ui/useVisibility";
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
  const isVisible = useVisibility();
  const [liveData, setLiveData] = useState<ActiveSessionsResponse | null>(null);
  const [_isLoading, setIsLoading] = useState(true);

  // Fetch active sessions on mount
  useEffect(() => {
    async function checkLiveSessions() {
      // 🔋 11/10 Performance: Pause polling if tab is hidden
      if (document.visibilityState === "hidden") return;

      try {
        const response = await fetch(`${getApiBaseUrl()}/api/sessions/active`);
        if (response.ok) {
          const data = await response.json();
          setLiveData(data);
        }
      } catch (e) {
        logger.error("Failed to check live sessions", e);
      } finally {
        setIsLoading(false);
      }
    }

    checkLiveSessions();
    const interval = setInterval(checkLiveSessions, 30000); // 30s polling

    // Refresh immediately on visibility change
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkLiveSessions();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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
          <div
            className={`absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1200px] bg-gradient-to-b from-purple-600/15 via-transparent to-transparent blur-[160px] ${isVisible ? "animate-[atmos-pulse_8s_ease-in-out_infinite]" : ""}`.trim()}
          />
          <div
            className={`absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[140px] ${isVisible ? "animate-[flicker_10s_linear_infinite]" : ""}`.trim()}
          />
          <div
            className={`absolute top-[10%] -right-[10%] w-[40%] h-[40%] bg-pink-600/10 rounded-full blur-[120px] ${isVisible ? "animate-[flicker_12s_linear_infinite]" : ""}`.trim()}
          />

          {/* Minimalist Grid Overlay */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808015_1px,transparent_1px),linear-gradient(to_bottom,#80808015_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
        </div>

        <div className="relative max-w-6xl mx-auto">
          <div className="inline-flex items-center gap-3 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full px-6 py-2.5 mb-16 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <Radio className="w-3.5 h-3.5 text-purple-400/80" />
            <span className="text-[10px] font-semibold text-slate-400 tracking-[0.6em] uppercase">
              Connected • Interactive • Live
            </span>
            {process.env.NEXT_PUBLIC_CLOUD_API_URL?.includes("staging") && (
              <span className="ml-2 text-[7px] px-1.5 py-0.5 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded font-mono tracking-normal">
                STAGE
              </span>
            )}
          </div>

          <h1 className="text-5xl sm:text-7xl md:text-8xl font-extrabold tracking-tight leading-[1.1] mb-12 drop-shadow-[0_0_40px_rgba(244,63_94,0.15)]">
            <span className="text-white">One Floor.</span>
            <br className="hidden sm:block" />
            <span className="relative inline-block group/heartbeat">
              <span className="bg-gradient-to-r from-rose-500 via-purple-400 to-indigo-500 text-transparent bg-clip-text italic animate-[heartbeat-glow_3s_ease-in-out_infinite]">
                One Heartbeat.
              </span>
            </span>
          </h1>

          <div className="max-w-3xl mx-auto mb-20 px-4 sm:px-0 space-y-4">
            <p className="text-lg sm:text-2xl text-slate-100 font-semibold tracking-tight leading-relaxed">
              The live connection between the{" "}
              <span className="text-purple-400 font-bold">Booth</span> and the{" "}
              <span className="text-pink-400 font-bold">Floor</span>
            </p>
            <p className="text-base sm:text-lg text-slate-100 font-medium tracking-tight">
              Let's find the <span className="font-black italic text-xl sm:text-2xl px-0.5">1</span>{" "}
              together
            </p>
          </div>

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
                  className="group relative w-full px-12 py-5 bg-white text-slate-950 font-bold rounded-2xl hover:shadow-[0_20px_40px_rgba(236,72,153,0.2)] hover:-translate-y-0.5 active:scale-[0.98] transition-all overflow-hidden flex items-center justify-center gap-3"
                >
                  <Smartphone className="w-5 h-5 group-hover:text-rose-600 transition-colors" />
                  <span className="text-[13px] tracking-tight">
                    Tune In{" "}
                    <span className="ml-1 opacity-40 text-[10px] font-mono lowercase tracking-normal">
                      / dancer
                    </span>
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/0 via-rose-500/0 to-rose-500/[0.05] opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              </div>

              <Link
                href="/dj/register"
                className="group relative w-full sm:w-80 px-12 py-5 bg-slate-900/40 backdrop-blur-xl text-white font-bold rounded-2xl border border-white/10 hover:border-purple-500/40 hover:bg-slate-900/60 hover:shadow-[0_20px_40px_rgba(168,85,247,0.15)] hover:-translate-y-0.5 active:scale-[0.98] transition-all overflow-hidden flex items-center justify-center gap-3"
              >
                <Headphones className="w-5 h-5 group-hover:text-purple-400 transition-colors" />
                <span className="text-[13px] tracking-tight">
                  Go Live{" "}
                  <span className="ml-1 opacity-40 text-[10px] font-mono lowercase tracking-normal">
                    / dj
                  </span>
                </span>
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/0 via-purple-500/0 to-purple-500/[0.08] opacity-0 group-hover:opacity-100 transition-opacity" />
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

                {/* ⚡ KINETIC DATA PULSES: Traveling energy packets */}
                {/* M7: Pause animations if tab is hidden to save GPU/CPU */}
                <div
                  className={`absolute top-0 left-[-1px] w-[3px] h-32 bg-gradient-to-b from-transparent via-white/40 to-transparent ${isVisible ? "animate-[pulse-down_4s_linear_infinite]" : ""}`}
                />
                <div
                  className={`absolute top-0 left-[-1px] w-[3px] h-32 bg-gradient-to-b from-transparent via-purple-400/30 to-transparent ${isVisible ? "animate-[pulse-down_4s_linear_infinite_1.5s]" : ""}`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* 📱 THE PRODUCT HANDSHAKE (HERO MOCKUP) - Desktop Only */}
        <div className="hidden sm:block mt-24 sm:mt-48 relative z-[60] w-screen left-1/2 -translate-x-1/2">
          <div className="relative z-10 w-full max-w-[1000px] mx-auto px-6 group/handshake">
            {/* Main Booth Frame: The "Engine" (Integrated Hardware) */}
            <div className="relative aspect-[16/10] group/booth [perspective:2000px] transform scale-[0.85] transition-all duration-[1.5s] ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/handshake:scale-95 group-hover/handshake:shadow-purple-500/20">
              {/* Hardware Shell */}
              <div className="absolute inset-0 bg-slate-900 rounded-3xl p-2 sm:p-4 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] overflow-hidden">
                <div className="w-full h-full rounded-2xl overflow-hidden bg-slate-950 relative transition-all duration-[1.5s] opacity-40 grayscale blur-[2px] group-hover/handshake:opacity-100 group-hover/handshake:grayscale-0 group-hover/handshake:blur-0">
                  {/* ⚡ INTERNAL CORE SPINE - Positioned behind image */}
                  <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-px pointer-events-none">
                    <div className="absolute inset-y-0 w-px bg-gradient-to-b from-white/5 via-purple-500/40 to-white/5" />
                  </div>

                  <Image
                    src="/screenshots/dj/vdj-sync.png"
                    alt="High-fidelity integration proof showing Pika! syncing with VirtualDJ hardware state in real-time."
                    fill
                    sizes="(max-width: 1000px) 100vw, 1000px"
                    priority
                    className="object-cover object-center scale-105 group-hover:scale-110 transition-transform duration-[4s] ease-out"
                  />
                  {/* Glass Sweep Animation */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover/booth:translate-x-full transition-transform duration-3000 ease-in-out" />
                </div>
              </div>

              {/* Integration Badge */}
              <div className="absolute top-8 left-8 px-5 py-2.5 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-2xl z-30 transform group-hover:translate-x-2 transition-transform duration-700">
                <p className="text-[10px] font-black text-white tracking-[0.3em] uppercase flex items-center gap-2">
                  <History className="w-3 h-3 text-purple-400 animate-pulse" />
                  VirtualDJ Native Bridge
                </p>
              </div>
            </div>

            {/* 📱 THE PRODUCT HANDSHAKE (HERO MOCKUP) - Desktop Only */}
            <div className="absolute -bottom-10 -right-4 sm:-bottom-20 sm:-right-10 w-[130px] sm:w-[260px] aspect-[9/19.5] z-[80] sm:[perspective:2000px] group/phone">
              <div className="relative w-full h-full">
                {/* Hardware Shell */}
                <div className="absolute inset-0 bg-slate-800 rounded-[2.5rem] sm:rounded-[3.5rem] p-1.5 sm:p-2.5 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] transition-all duration-1000 ease-[cubic-bezier(0.23,1,0.32,1)] -rotate-2 group-hover/handshake:rotate-0 group-hover/handshake:-translate-y-16 group-hover/handshake:scale-110 group-hover/handshake:shadow-pink-500/30 group-hover/handshake:border-pink-500/20">
                  <div className="w-full h-full rounded-[2.2rem] sm:rounded-[3rem] overflow-hidden bg-slate-950 relative">
                    <Image
                      src="/screenshots/dancer/live-id.png"
                      alt="Dancer Mobile Interface displaying real-time track identification and voting capabilities."
                      fill
                      sizes="(max-width: 640px) 130px, 260px"
                      priority
                      className="object-cover opacity-90 group-hover/handshake:opacity-100 transition-opacity duration-700"
                    />
                    {/* Glass Sweep Animation */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover/handshake:translate-x-full transition-transform duration-2000 ease-in-out" />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.2rem] sm:rounded-[3rem] pointer-events-none" />
                  </div>
                </div>
                {/* Decorative LED Glow */}
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-pink-500/5 blur-3xl rounded-full -z-10 group-hover/handshake:bg-pink-500/10 transition-colors" />
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
                    {/* M7: Pause animations if tab is hidden */}
                    <div
                      className={`absolute top-0 left-0 h-full w-24 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[200%] ${isVisible ? "group-hover:animate-[sweep_10s_linear_infinite]" : ""} delay-1000`}
                    />
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
                    <div
                      className={`absolute top-0 left-0 h-full w-20 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[200%] ${isVisible ? "group-hover:animate-[sweep_12s_linear_infinite]" : ""} delay-1500`}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 🖥️ PIKA! DESKTOP SIDECAR: The Intelligence Focal Point (Premium Glass HUD) */}
            <div className="absolute -top-24 left-4 sm:-top-32 sm:left-0 w-[360px] aspect-[16/11] rounded-[2.5rem] border-[2px] border-white/10 bg-slate-900/40 backdrop-blur-3xl overflow-hidden shadow-[0_80px_160px_rgba(0,0,0,0.8),0_0_100px_rgba(168,85,247,0.15)] z-[85] hidden lg:block transform group-hover/handshake:-translate-y-12 -rotate-1 opacity-0 group-hover/handshake:opacity-100 transition-all duration-[1.5s] delay-300 pointer-events-none">
              <div className="absolute -inset-10 bg-purple-500/15 blur-[60px] rounded-full z-0" />
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/40 via-transparent to-transparent pointer-events-none z-10" />
              <div className="absolute inset-x-0 h-[100%] top-0 bg-gradient-to-b from-purple-500/0 via-purple-500/5 to-purple-500/0 translate-y-[-100%] group-hover/handshake:animate-[scan_8s_linear_infinite] z-20" />

              <Image
                src="/screenshots/dj/track-inspector.png"
                alt="Pika! Track Intelligence HUD showing detailed acoustic fingerprinting and energy analysis."
                fill
                sizes="360px"
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
              <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent -translate-x-full group-hover/handshake:animate-[sweep_15s_ease-in-out_infinite] z-50" />
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
      <section className="pt-32 sm:pt-48 pb-48 sm:pb-64 px-4 bg-slate-950 relative overflow-hidden">
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
            <h2 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.1] italic uppercase">
              The Connective Tissue.
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-10 items-stretch">
            {/* DJs Card */}
            <ProCard
              className="p-12 flex flex-col items-start h-full group/card transition-all duration-1000 bg-slate-950/40 border-white/5"
              glow
              glowColor="purple-500"
              bgImage="/textures/dj.jpg"
              variant="hero"
            >
              <div className="w-16 h-16 bg-purple-500/5 border border-purple-500/10 rounded-[1.5rem] flex items-center justify-center mb-10 group-hover:bg-purple-500/20 group-hover:border-purple-500/30 transition-all duration-700 shadow-[0_0_20px_rgba(168,85,247,0.05)]">
                <Headphones className="w-8 h-8 text-slate-300 group-hover:text-purple-400 transition-colors" />
              </div>
              <div className="flex flex-col mb-4">
                <span className="text-[10px] font-bold text-purple-500/50 uppercase tracking-[0.3em] mb-1">
                  Persona: DJ
                </span>
                <h3 className="text-3xl font-extrabold text-white tracking-tight">The Booth</h3>
              </div>
              <p className="text-slate-400 text-sm font-medium mb-12 leading-relaxed">
                Connect the source to the crowd. Real-time data, library insights, and digital floor
                signals.
              </p>

              <ul className="space-y-6 text-[14px] text-slate-400 font-medium flex-1">
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover/item:bg-purple-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Live Software Integration
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover/item:bg-purple-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Real-time Performance Data
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40 group-hover/item:bg-purple-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Advanced Library Insights
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
              bgImage="/textures/dancer.jpg"
              variant="hero"
            >
              <div className="w-16 h-16 bg-pink-500/5 border border-pink-500/10 rounded-[1.5rem] flex items-center justify-center mb-10 group-hover:bg-pink-500/20 group-hover:border-pink-500/30 transition-all duration-700 shadow-[0_0_20px_rgba(236,72,153,0.05)]">
                <Heart className="w-8 h-8 text-slate-300 group-hover:text-pink-400 transition-colors" />
              </div>
              <div className="flex flex-col mb-4">
                <span className="text-[10px] font-bold text-pink-500/50 uppercase tracking-[0.3em] mb-1">
                  Persona: Dancer
                </span>
                <h3 className="text-3xl font-extrabold text-white tracking-tight">The Floor</h3>
              </div>
              <p className="text-slate-400 text-sm font-medium mb-12 leading-relaxed">
                Stay in sync with the source. Identify tracks, build your history, and vote on the
                rhythm.
              </p>

              <ul className="space-y-6 text-[14px] text-slate-400 font-medium flex-1">
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/40 group-hover/item:bg-pink-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Frictionless Mobile Access
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/40 group-hover/item:bg-pink-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Interactive Dance History
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-pink-500/40 group-hover/item:bg-pink-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Direct Feedback Signal
                  </span>
                </li>
              </ul>

              <Link
                href="/for/dancers"
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
              bgImage="/textures/organizer.jpg"
              variant="hero"
            >
              <div className="w-16 h-16 bg-emerald-500/5 border border-emerald-500/10 rounded-[1.5rem] flex items-center justify-center mb-10 group-hover:bg-emerald-500/20 group-hover:border-emerald-500/30 transition-all duration-700 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                <Calendar className="w-8 h-8 text-slate-300 group-hover:text-emerald-400 transition-colors" />
              </div>
              <div className="flex flex-col mb-4">
                <span className="text-[10px] font-bold text-emerald-500/50 uppercase tracking-[0.3em] mb-1">
                  Persona: Event
                </span>
                <h3 className="text-3xl font-extrabold text-white tracking-tight">The Grid</h3>
              </div>
              <p className="text-slate-400 text-sm font-medium mb-12 leading-relaxed">
                Monitor the infrastructure. Multi-room surveillance and direct command-to-phone
                broadcasting.
              </p>

              <ul className="space-y-6 text-[14px] text-slate-400 font-medium flex-1">
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 group-hover/item:bg-emerald-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Multi-room Event Control
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 group-hover/item:bg-emerald-500 transition-colors" />
                  <span className="group-hover:text-slate-200 transition-colors">
                    Direct Booth-to-Phone Pulse
                  </span>
                </li>
                <li className="flex items-center gap-4 group/item">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 group-hover/item:bg-emerald-500 transition-colors" />
                  <span className="group-hover:text-slate-300 transition-colors">
                    Enterprise System Isolation
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

      <section className="pt-24 sm:pt-32 pb-48 sm:pb-64 bg-black overflow-hidden relative">
        {/* 📐 BLUEPRINT GROUNDING: Transitioning for Architecture to Intuition */}
        <div className="absolute inset-x-0 top-0 h-96 bg-[url('/textures/schematic.jpg')] bg-repeat opacity-[0.05] grayscale pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-slate-950 via-transparent to-transparent pointer-events-none" />

        {/* ⚡ ENTRY PULSE: Consistent Handover (Stays above the Pill) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-20 bg-gradient-to-b from-purple-500/80 to-transparent z-10 pointer-events-none" />

        {/* ✨ FOCUS GLOW: Sharper center, less edge bleed */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-4xl h-[500px] bg-purple-600/10 blur-[120px] -translate-y-1/2 pointer-events-none" />

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          {/* Centered DJ Header */}
          <div className="text-center mb-24">
            <span className="inline-block px-6 py-2 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4em] mb-10">
              DJ Intelligence
            </span>
            <h2 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
              The DJ&apos;s <br />
              <span className="text-purple-500 italic uppercase">Sixth Sense.</span>
            </h2>
          </div>

          <div className="grid lg:grid-cols-2 gap-32 items-center">
            <div>
              <p className="text-xl text-slate-400 font-normal leading-relaxed mb-16 tracking-tight">
                Don&apos;t just play tracks. Play the room. Pika! surfaces{" "}
                <span className="text-slate-200 font-bold">crowd reactions</span> and integrates
                your personal library notes, giving you a{" "}
                <span className="text-slate-100 font-bold italic">predictive glimpse</span> into the
                floor&apos;s heartbeat.
              </p>

              <div className="space-y-10 max-w-lg">
                <div className="flex gap-6 group/item">
                  <div className="w-px h-12 bg-slate-800 group-hover/item:bg-purple-500 transition-colors" />
                  <div>
                    <h4 className="text-[12px] font-black text-white uppercase tracking-widest mb-2">
                      Performance Context
                    </h4>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed">
                      Instant recall of crowd feedback and library notes relative to the current
                      mix.
                    </p>
                  </div>
                </div>
                <div className="flex gap-6 group/item">
                  <div className="w-px h-12 bg-slate-800 group-hover/item:bg-purple-500 transition-colors" />
                  <div>
                    <h4 className="text-[12px] font-black text-white uppercase tracking-widest mb-2">
                      Live Telemetry
                    </h4>
                    <p className="text-slate-500 text-sm font-medium leading-relaxed">
                      Precision real-time data on Key, BPM, and Vibe sync via the Pika! Intelligence
                      bridge.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative group/booth [perspective:2000px]">
              <div className="absolute -inset-20 bg-purple-500/10 rounded-[4rem] blur-[120px] opacity-0 group-hover/booth:opacity-100 transition-opacity duration-1000" />

              {/* Hardware Shell */}
              <div className="relative aspect-[16/10] bg-slate-900 rounded-[3rem] p-2 sm:p-4 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] transform transition-all duration-1000 ease-out group-hover/booth:rotate-y-6 group-hover/booth:-rotate-x-3 group-hover/booth:translate-x-2 group-hover/booth:scale-[1.02] overflow-hidden">
                <div className="w-full h-full rounded-[2.2rem] overflow-hidden bg-slate-950 relative">
                  <Image
                    src="/screenshots/dj/governance-view.png"
                    alt="High Resolution Performance Mode"
                    fill
                    sizes="(max-width: 1024px) 100vw, 600px"
                    className="object-cover opacity-80 group-hover/booth:opacity-100 transition-all duration-[2s]"
                  />
                  {/* Glass Sweep Animation */}
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover/booth:translate-x-full transition-transform duration-3000 ease-in-out" />
                  <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/10 via-transparent to-transparent pointer-events-none" />
                </div>
              </div>
              {/* Mobile HUD Overlay - The "Dancer Perspective" */}
              <div className="absolute -bottom-10 -left-10 w-48 aspect-[9/19.5] z-20 hidden md:block">
                <div className="relative w-full h-full animate-float-soft">
                  {/* Hardware Shell */}
                  <div className="absolute inset-0 bg-slate-800 rounded-[2.5rem] p-1.5 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,1)] transition-all duration-[1.5s] ease-out group-hover/booth:-translate-y-12 group-hover/booth:translate-x-4 -rotate-2 group-hover/booth:rotate-0 group-hover/booth:border-purple-500/30 group-hover/booth:shadow-purple-500/20">
                    <div className="w-full h-full rounded-[2.2rem] overflow-hidden bg-slate-950 relative">
                      <Image
                        src="/screenshots/dancer/live-id.png"
                        alt="Floor Signal"
                        fill
                        sizes="192px"
                        className="object-cover opacity-80 group-hover/booth:opacity-100 transition-all duration-[2s]"
                      />
                      {/* Glass Sweep Animation */}
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover/booth:translate-x-full transition-transform duration-2000 ease-in-out" />
                      <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.2rem] pointer-events-none" />
                    </div>
                  </div>
                  {/* Decorative LED Glow */}
                  <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-purple-500/5 blur-3xl rounded-full -z-10 group-hover/booth:bg-purple-500/15 transition-colors" />
                </div>
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
      <section className="pt-32 sm:pt-48 pb-48 sm:pb-80 px-6 bg-slate-950 relative overflow-hidden">
        {/* 📐 BLUEPRINT GROUNDING */}
        <div className="absolute inset-0 bg-[url('/textures/schematic.jpg')] bg-repeat opacity-[0.03] grayscale pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,#020617_100%)] pointer-events-none" />

        {/* ⚡ ENTRY PULSE: Handshake (DJ Initiative) */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-24 bg-gradient-to-b from-purple-500/40 to-transparent z-10" />
        {/* Energy Carry-over & Reverse Spill */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[400px] bg-purple-500/10 blur-[120px] -translate-y-1/2 pointer-events-none opacity-30" />

        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-40">
            <span className="inline-block px-6 py-2 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4em] mb-10">
              The Digital Nervous System
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1] italic uppercase">
              The Connection.
            </h2>
          </div>

          <div className="relative">
            {/* 🏗️ CENTRAL SPINE: The Interaction Bridge */}
            <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-px hidden md:block">
              {/* Internal Spines: Reflection of both roles (Visual Thread) */}
              <div className="absolute inset-y-0 left-[-1px] w-px bg-gradient-to-b from-transparent via-purple-500/30 to-transparent" />
              <div className="absolute inset-y-0 right-[-1px] w-px bg-gradient-to-b from-transparent via-pink-500/30 to-transparent" />

              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-800 to-transparent" />

              {/* 🧩 THE SYNC HUB: Central Intersection (Elastic WCS Connection) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center">
                {/* ⚡ THE HEARTBEAT: Radiant central core */}
                <div className="absolute w-12 h-12 rounded-full bg-white/10 animate-pulse blur-xl" />
                <div className="w-2 h-2 rounded-full bg-white z-20 shadow-[0_0_15px_white]" />

                {/* ⚡ THE ELASTIC BRIDGE: Stretches and breathes like a WCS connection */}
                <div className="absolute w-[320px] h-px flex items-center justify-center z-10 animate-[bridge-stretch_4s_ease-in-out_infinite]">
                  {/* The 'Outer Atmosphere' (The energy of the bond) */}
                  <div className="absolute inset-x-0 h-[2px] bg-gradient-to-r from-purple-500 via-white to-pink-500 blur-[3px]" />

                  {/* ⚡ BIDIRECTIONAL FLOW: The "Conversation" between DJ and Floor */}
                  <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    {/* Flow: DJ -> Dancer (Booth to Floor) */}
                    <div className="absolute top-0 w-32 h-full bg-gradient-to-r from-transparent via-white/80 to-transparent animate-[connection-flow-right_3s_ease-in-out_infinite]" />

                    {/* Flow: Dancer -> DJ (Floor to Booth) */}
                    <div className="absolute top-0 w-32 h-full bg-gradient-to-r from-transparent via-white/80 to-transparent animate-[connection-flow-left_3s_ease-in-out_infinite_1.5s]" />
                  </div>
                </div>
              </div>

              {/* Alignment Nodes */}
              <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-800 border border-slate-700" />
              <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-slate-800 border border-slate-700" />
            </div>

            <div className="grid md:grid-cols-2 gap-20 lg:gap-40 items-stretch relative">
              {/* DJ FLOW: The Source */}
              <div className="relative p-12 rounded-[2.5rem] border border-white/5 bg-slate-900/20 backdrop-blur-sm group/orbit overflow-hidden flex flex-col h-full">
                <div className="absolute -inset-10 bg-purple-500/5 blur-[80px] opacity-0 group-hover/orbit:opacity-100 transition-opacity duration-1000" />

                <div className="relative flex flex-col flex-1 h-full">
                  <div className="flex items-center justify-between pb-6 mb-12 border-b border-white/5">
                    <span className="text-[10px] font-mono font-bold text-purple-500/50 uppercase tracking-[0.3em]">
                      Role: The Booth
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse shadow-[0_0_10px_rgba(168,85,247,0.5)]" />
                  </div>

                  <div className="space-y-12 mb-16">
                    <div className="flex gap-8 group/step">
                      <div className="text-[40px] font-black text-white/[0.08] group-hover/step:text-purple-500/30 transition-all duration-700 italic leading-none font-mono">
                        01
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-3 tracking-tight">
                          Ask for the Dance
                        </h3>
                        <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                          Bridge your session. Pika! becomes the invisible conduit for your library
                          intelligence.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-8 group/step">
                      <div className="text-[40px] font-black text-white/[0.08] group-hover/step:text-purple-500/30 transition-all duration-700 italic leading-none font-mono">
                        02
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-3 tracking-tight">
                          Stay Present
                        </h3>
                        <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                          Listen for subtle signals, accents, and propositions from the floor. Move
                          together, responding to the energy of the dance in real-time.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <Link
                      href="/dj/register"
                      className="group relative w-full flex items-center justify-center px-10 py-5 bg-white text-slate-950 font-bold rounded-2xl hover:shadow-[0_20px_40px_rgba(168,85,247,0.2)] hover:-translate-y-0.5 active:scale-[0.98] transition-all overflow-hidden text-[13px] tracking-tight shadow-2xl"
                    >
                      <Headphones className="w-5 h-5 mr-3 group-hover:text-purple-600 transition-colors" />
                      Register Booth
                      <div className="absolute inset-0 bg-gradient-to-tr from-purple-500/0 via-purple-500/0 to-purple-500/[0.05] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </div>
                </div>
              </div>

              {/* DANCER FLOW: The Sync */}
              <div className="relative p-12 rounded-[2.5rem] border border-white/5 bg-slate-900/20 backdrop-blur-sm group/orbit overflow-hidden flex flex-col h-full">
                <div className="absolute -inset-10 bg-pink-500/5 blur-[80px] opacity-0 group-hover/orbit:opacity-100 transition-opacity duration-1000" />

                <div className="relative flex flex-col flex-1 h-full">
                  <div className="flex items-center justify-between pb-6 mb-12 border-b border-white/5">
                    <span className="text-[10px] font-mono font-bold text-pink-500/50 uppercase tracking-[0.3em]">
                      Role: The Floor
                    </span>
                    <div className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse shadow-[0_0_10px_rgba(236,72,153,0.5)]" />
                  </div>

                  <div className="space-y-12 mb-16">
                    <div className="flex gap-8 group/step">
                      <div className="text-[40px] font-black text-white/[0.08] group-hover/step:text-pink-500/30 transition-all duration-700 italic leading-none font-mono">
                        01
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-3 tracking-tight">
                          Join the Conversation
                        </h3>
                        <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                          Scan the code. No friction, no passwords—just immediate alignment with the
                          vibe.
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-8 group/step">
                      <div className="text-[40px] font-black text-white/[0.08] group-hover/step:text-pink-500/30 transition-all duration-700 italic leading-none font-mono">
                        02
                      </div>
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-white mb-3 tracking-tight">
                          Complete the Loop
                        </h3>
                        <p className="text-slate-500 text-sm font-medium leading-relaxed max-w-xs">
                          Your individual flourishes and feedback become part of the collective
                          rhythm.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <Link
                      href="/live"
                      className="group relative w-full flex items-center justify-center px-10 py-5 bg-slate-900/40 backdrop-blur-xl text-white font-bold rounded-2xl border border-white/10 hover:border-rose-500/40 hover:bg-slate-900/60 hover:shadow-[0_20px_40px_rgba(236,72,153,0.15)] hover:-translate-y-0.5 active:scale-[0.98] transition-all overflow-hidden text-[13px] tracking-tight shadow-2xl"
                    >
                      <Smartphone className="w-5 h-5 mr-3 group-hover:text-rose-400 transition-colors" />
                      Join Floor
                      <div className="absolute inset-0 bg-gradient-to-tr from-rose-500/0 via-rose-500/0 to-rose-500/[0.08] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </Link>
                  </div>
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
            <span className="inline-block px-6 py-2 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4em] mb-10">
              Future Social Infrastructure
            </span>
            <h2 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight">
              Growing the Dance.
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
                <h4 className="text-[13px] font-bold text-white mb-4 tracking-tight">
                  Global Charts
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
                <h4 className="text-[13px] font-bold text-white mb-4 tracking-tight">
                  Permanent Dance DNA
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
                <h4 className="text-[13px] font-bold text-white mb-4 tracking-tight">
                  Professional Portfolios
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
                <h4 className="text-[13px] font-bold text-white mb-4 tracking-tight">
                  Centralized Venues
                </h4>
                <p className="text-slate-500 text-[13px] font-medium leading-relaxed">
                  Unified tracking and centralized command for all dance conventions.
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
          <div className="text-center mb-16">
            <span className="inline-block px-6 py-2 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4em] mb-10">
              System Integrity Audit
            </span>
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1] italic uppercase">
              Engineered for the Moment.
            </h2>
          </div>

          <p className="text-xl text-slate-400 mb-24 font-normal leading-relaxed max-w-xl mx-auto tracking-tight">
            Technology should never get in the way of a good dance. Pika! runs silently in the
            background, ensuring every beat and every connection is captured without losing{" "}
            <span className="text-slate-200 font-medium italic text-emerald-400/80">the vibe.</span>
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative">
            {/* LATENCY */}
            <ProCard
              className="p-8 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-12">
                  <Radio className="w-4 h-4 text-slate-500" />
                  <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                    SIG / 01
                  </div>
                </div>
                <div className="text-3xl font-bold text-white mb-2 italic tracking-tight uppercase">
                  &lt; 1ms
                </div>
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-8">
                  Signal Latency
                </div>
                <div className="mt-auto">
                  <div className="w-fit text-[8px] font-bold text-white uppercase tracking-widest px-2.5 py-1 bg-white/5 rounded-full border border-white/10 group-hover/stat:bg-white/10 transition-colors">
                    Nominal
                  </div>
                </div>
              </div>
            </ProCard>

            {/* PRIVACY */}
            <ProCard
              className="p-8 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-12">
                  <Smartphone className="w-4 h-4 text-slate-500" />
                  <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                    SEC / 02
                  </div>
                </div>
                <div className="text-3xl font-bold text-white mb-2 italic tracking-tight uppercase">
                  100%
                </div>
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-8">
                  Data Privacy
                </div>
                <div className="mt-auto">
                  <div className="w-fit text-[8px] font-bold text-white uppercase tracking-widest px-2.5 py-1 bg-white/5 rounded-full border border-white/10 group-hover/stat:bg-white/10 transition-colors">
                    Encrypted
                  </div>
                </div>
              </div>
            </ProCard>

            {/* CPU */}
            <ProCard
              className="p-8 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-12">
                  <BarChart3 className="w-4 h-4 text-slate-500" />
                  <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                    CPU / 03
                  </div>
                </div>
                <div className="text-3xl font-bold text-white mb-2 italic tracking-tight uppercase">
                  &lt; 1%
                </div>
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-8">
                  CPU Overhead
                </div>
                <div className="mt-auto">
                  <div className="w-fit text-[8px] font-bold text-white uppercase tracking-widest px-2.5 py-1 bg-white/5 rounded-full border border-white/10 group-hover/stat:bg-white/10 transition-colors">
                    Isolated
                  </div>
                </div>
              </div>
            </ProCard>

            {/* PULSE */}
            <ProCard
              className="p-8 bg-slate-900/40 border-white/5 group/stat relative overflow-hidden"
              glow
            >
              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-12">
                  <History className="w-4 h-4 text-slate-500" />
                  <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest font-mono">
                    LIV / 04
                  </div>
                </div>
                <div className="text-3xl font-bold text-white mb-2 italic tracking-tight uppercase flex items-center gap-4">
                  Live
                  <span className="w-1.5 h-1.5 rounded-full bg-white opacity-20 group-hover/stat:opacity-100 group-hover/stat:animate-ping transition-opacity translate-y-0.5" />
                </div>
                <div className="text-[10px] font-medium text-slate-500 uppercase tracking-widest mb-8">
                  Floor Pulse
                </div>
                <div className="mt-auto">
                  <div className="w-fit text-[8px] font-bold text-white uppercase tracking-widest px-2.5 py-1 bg-white/5 rounded-full border border-white/10 group-hover/stat:bg-white/10 transition-colors">
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
          <h2 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-[1.1] mb-16">
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
            <span className="inline-block px-6 py-2 bg-white/5 backdrop-blur-3xl border border-white/5 rounded-full text-[10px] font-semibold text-slate-400 uppercase tracking-[0.4em] mb-10">
              System Integration
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
