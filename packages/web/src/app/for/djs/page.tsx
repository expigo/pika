"use client";

import {
  ArrowLeft,
  CheckCircle2,
  Cpu,
  Database,
  Download,
  ExternalLink,
  Fingerprint,
  Headphones,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  Terminal,
  Waves,
  Zap,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";

export default function ForDJs() {
  const [platform, setPlatform] = useState<"mac" | "win" | "mobile" | "other">("other");

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isMobile = /iphone|ipad|ipod|android|blackberry|windows phone/g.test(userAgent);

    if (isMobile) {
      setPlatform("mobile");
    } else if (userAgent.includes("mac")) {
      setPlatform("mac");
    } else if (userAgent.includes("win")) {
      setPlatform("win");
    }
  }, []);

  const getPlatformLabel = () => {
    if (platform === "mac") return "macOS";
    if (platform === "win") return "Windows";
    return "Desktop";
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-blue-500/30 font-sans overflow-x-hidden">
      {/* Dynamic Background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[800px] bg-gradient-to-b from-blue-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Navigation */}
        <div className="mb-12 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50 active:scale-95 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Terminal Home
          </Link>
          <div className="px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] whitespace-nowrap">
            Registry v0.3.0 • Production Ready
          </div>
        </div>

        {/* Hero Section: The Handshake */}
        <div className="text-center mb-20 sm:mb-24 px-2">
          <div className="inline-flex items-center justify-center p-4 bg-blue-500/10 rounded-2xl mb-8 sm:mb-10 border border-blue-500/20 shadow-xl shadow-blue-900/20">
            <Headphones className="w-12 h-12 sm:w-14 h-14 text-blue-400" />
          </div>
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black text-white mb-6 sm:mb-8 italic uppercase tracking-tighter leading-[1.1] sm:leading-[0.9] text-balance">
            The DJ's <span className="text-blue-400 font-[inherit]">Silent Partner</span>
          </h1>
          <p className="text-[10px] sm:text-[12px] font-black text-slate-500 uppercase tracking-[0.3em] sm:tracking-[0.5em] mb-10 sm:mb-12 text-balance">
            Technical Integrity for the High-Stakes WCS Booth
          </p>

          {/* Trust Badge: The CPU Audit */}
          <div className="inline-flex flex-col md:flex-row items-center gap-6 md:gap-8 px-6 sm:px-8 py-5 sm:py-6 bg-slate-900/40 border border-white/5 rounded-2xl sm:rounded-3xl backdrop-blur-md shadow-2xl w-full md:w-auto">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Cpu className="w-5 h-5 text-emerald-500 shrink-0" />
              <div className="text-left">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                  Impact Audit
                </p>
                <p className="text-xs sm:text-sm font-black text-white italic tracking-tight">
                  0.2% CPU Usage
                </p>
              </div>
            </div>
            <div className="hidden md:block w-px h-8 bg-white/10" />
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Zap className="w-5 h-5 text-amber-500 shrink-0" />
              <div className="text-left">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                  Latency
                </p>
                <p className="text-xs sm:text-sm font-black text-white italic tracking-tight">
                  &lt; 15ms Broadcast
                </p>
              </div>
            </div>
            <div className="hidden md:block w-px h-8 bg-white/10" />
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="text-left">
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest leading-none mb-1">
                  Protection
                </p>
                <p className="text-xs sm:text-sm font-black text-white italic tracking-tight">
                  Read-Only Safety
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 1: Performance Proof (Native Interop) */}
        <div className="mb-24 sm:mb-32">
          <div className="text-center mb-12 sm:mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <h2 className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.5em] relative z-10">
              The Three Zeros
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mb-12">
            <div className="p-6 sm:p-8 bg-slate-900/30 border border-white/5 rounded-3xl group hover:bg-slate-900/50 transition-all cursor-default">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 border border-blue-500/20 group-hover:scale-110 transition-transform">
                <Zap className="w-6 h-6 text-blue-400" />
              </div>
              <h4 className="text-lg font-black text-white italic uppercase tracking-tight mb-3">
                Zero Latency
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Optimized Rust core identifies tracks instantly. No lag in your local UI, no delays
                in your broadcast.
              </p>
            </div>
            <div className="p-6 sm:p-8 bg-slate-900/30 border border-white/5 rounded-3xl group hover:bg-slate-900/50 transition-all cursor-default">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 border border-purple-500/20 group-hover:scale-110 transition-transform">
                <Terminal className="w-6 h-6 text-purple-400" />
              </div>
              <h4 className="text-lg font-black text-white italic uppercase tracking-tight mb-3">
                Zero Configuration
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Pika! auto-detects VirtualDJ, Rekordbox, and Serato sessions. Just open your
                software and play.
              </p>
            </div>
            <div className="p-6 sm:p-8 bg-slate-900/30 border border-white/5 rounded-3xl group hover:bg-slate-900/50 transition-all cursor-default sm:col-span-2 lg:col-span-1">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <h4 className="text-lg font-black text-white italic uppercase tracking-tight mb-3">
                Zero Interference
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">
                Strict read-only protocol. Your library files, metadata tags, and database remain
                untouched. Forever.
              </p>
            </div>
          </div>

          <div className="group block relative overflow-hidden rounded-[2.5rem] sm:rounded-[3rem] p-1 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/5">
            <div className="relative aspect-[4/3] sm:aspect-[16/9] md:aspect-[21/9] w-full overflow-hidden rounded-[2.4rem] sm:rounded-[2.9rem] bg-slate-950">
              <Image
                src="/screenshots/dj/vdj-sync.png"
                alt="VirtualDJ Live Integration Proof"
                fill
                priority
                sizes="(max-width: 1280px) 100vw, 1280px"
                className="object-cover scale-105 blur-md opacity-40 md:opacity-30 transition-all duration-1000 group-hover:blur-0 group-hover:opacity-100 group-hover:scale-100"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent pointer-events-none" />
              <div className="absolute inset-0 p-6 sm:p-10 md:p-12 flex flex-col justify-end">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 sm:gap-8">
                  <div className="max-w-xl">
                    <span className="inline-block px-3 py-1 rounded-full bg-blue-500/20 border border-blue-500/30 text-[9px] font-black text-blue-400 uppercase tracking-widest mb-4">
                      Protocol Verification
                    </span>
                    <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-white italic uppercase tracking-tighter mb-4 leading-tight">
                      Integrated <span className="text-blue-400 font-[inherit]">Booth Sync</span>
                    </h3>
                    <p className="text-slate-200 sm:text-slate-300 text-xs sm:text-sm leading-relaxed font-medium">
                      Pika! mirrors your booth state in real-time. Waveforms, stems, and performance
                      metrics are bridged without ever leaving your workstation.
                      <span className="hidden md:inline block mt-2 text-blue-400/80 italic text-xs">
                        {" "}
                        Hover to focus the live verification feed.
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="px-5 sm:px-6 py-3 sm:py-4 bg-slate-900/90 backdrop-blur-xl rounded-2xl border border-white/10 text-center shrink-0 shadow-2xl">
                      <p className="text-[9px] font-black text-slate-500 uppercase mb-1 whitespace-nowrap">
                        Sync Drift
                      </p>
                      <p className="text-lg sm:text-xl font-black text-white italic leading-none whitespace-nowrap">
                        &lt; 1ms
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 2: Acoustic Intelligence (The Crate) */}
        <div className="mb-24 sm:mb-32 px-2">
          <div className="text-center mb-12 sm:mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <h2 className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.5em] relative z-10">
              Acoustic Intelligence
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-start">
            <div className="space-y-12">
              <div className="group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:scale-110 transition-transform">
                    <Fingerprint className="w-5 h-5 text-purple-400" />
                  </div>
                  <h4 className="text-xl sm:text-2xl font-black text-white italic uppercase tracking-tight font-[inherit]">
                    Visual Fingerprinting
                  </h4>
                </div>
                <div className="min-h-[80px]">
                  <p className="text-slate-400 text-sm sm:text-base leading-relaxed font-medium mb-8">
                    Go beyond BPM and Key. Pika! derives a unique "Visual Fingerprint" for every
                    track, mapping
                    <strong className="text-slate-200">
                      {" "}
                      Energy, Groove, Brightness, and Acousticness{" "}
                    </strong>
                    on a high-resolution radar chart.
                  </p>
                </div>
                <div className="relative aspect-[16/10] bg-[#0c0e14] rounded-2xl sm:rounded-3xl border border-white/5 overflow-hidden shadow-2xl group cursor-pointer">
                  <Image
                    src="/screenshots/dj/track-inspector.png"
                    alt="Track Visual Fingerprint"
                    fill
                    sizes="(max-width: 768px) 100vw, 800px"
                    className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl sm:rounded-3xl pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="space-y-12">
              <div className="group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 group-hover:scale-110 transition-transform">
                    <Waves className="w-5 h-5 text-blue-400" />
                  </div>
                  <h4 className="text-xl sm:text-2xl font-black text-white italic uppercase tracking-tight font-[inherit]">
                    Set Flow Mapping
                  </h4>
                </div>
                <div className="min-h-[80px]">
                  <p className="text-slate-400 text-sm sm:text-base leading-relaxed font-medium mb-8">
                    Visualize the "Pulse" of your entire set. Real-time trend mapping showing how
                    the energy and tempo of your room evolved from the first track to the peak hour.
                  </p>
                </div>
                <div className="relative aspect-[16/10] bg-[#0c0e14] rounded-2xl sm:rounded-3xl border border-white/5 overflow-hidden shadow-2xl group cursor-pointer">
                  <Image
                    src="/screenshots/dj/crate-intelligence.png"
                    alt="Crate Intelligence Dashboard"
                    fill
                    sizes="(max-width: 768px) 100vw, 800px"
                    className="object-cover object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl sm:rounded-3xl pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 3: Community & Crowd (The Spirit) */}
        <div className="mb-24 sm:mb-32 px-2">
          <div className="text-center mb-12 sm:mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <h2 className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.5em] relative z-10">
              The Vibe Governance
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="relative aspect-[16/10] bg-slate-900/50 rounded-[2rem] sm:rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl group order-2 lg:order-1">
              <Image
                src="/screenshots/dj/governance-view.png"
                alt="Live Vibe Governance Dashboard"
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2rem] sm:rounded-[2.5rem] pointer-events-none" />
              <div className="absolute top-4 sm:top-6 right-4 sm:right-6 px-3 sm:px-4 py-1.5 sm:py-2 bg-pink-500/20 backdrop-blur-md rounded-full border border-pink-500/30 text-[8px] sm:text-[10px] font-black text-pink-400 uppercase tracking-widest animate-pulse">
                Live Poll Active
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h3 className="text-3xl sm:text-4xl font-black text-white italic uppercase tracking-tighter mb-6 leading-tight text-balance">
                Booth <span className="text-pink-400 font-[inherit]">Engagement</span> Bridge
              </h3>
              <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-8 font-medium">
                West Coast Swing is a conversation. Pika! bridges the gap between the floor and the
                booth with non-distracting heads-up polls, "Thank You" confetti rain, and anonymous
                tempo sentiment.
              </p>
              <ul className="space-y-4">
                {[
                  'Real-time metadata "Shazam-style" requests.',
                  '"Spirit of the Set" Confetti for community landmarks.',
                  'Anonymous "Fast/Slow" feedback for tempo adjustment.',
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 text-sm font-semibold text-slate-200"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Technical Verification Zone (The CPU Proof) */}
        <div className="mb-24 sm:mb-32">
          <div className="bg-slate-900/30 border border-white/5 rounded-[2.5rem] sm:rounded-[3rem] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:items-center">
              <div className="p-8 sm:p-12 md:p-16 flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-6 sm:mb-8">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest leading-none">
                    Nominal Performance Stats
                  </span>
                </div>
                <h3 className="text-3xl sm:text-4xl font-black text-white italic uppercase tracking-tighter mb-6 leading-tight">
                  Invisible <span className="text-slate-500 font-[inherit]">Footprint</span>
                </h3>
                <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-10 font-medium text-balance">
                  We know you can't afford a crash. Pika! is built using a local-first{" "}
                  <strong className="text-slate-200">Tauri + Rust</strong>
                  architecture that consumes fewer resources than a browser tab.
                </p>
                <div className="grid grid-cols-2 gap-4 sm:gap-6 p-1 bg-black/20 rounded-2xl border border-white/5">
                  <div className="p-4 sm:p-6 text-center">
                    <p className="text-[9px] font-black text-slate-600 uppercase mb-2 tracking-widest whitespace-nowrap">
                      CPU Impact
                    </p>
                    <p className="text-2xl sm:text-3xl font-black text-white italic">0.2%</p>
                  </div>
                  <div className="p-4 sm:p-6 text-center border-l border-white/5">
                    <p className="text-[9px] font-black text-slate-600 uppercase mb-2 tracking-widest whitespace-nowrap">
                      RAM Usage
                    </p>
                    <p className="text-2xl sm:text-3xl font-black text-white italic">38.2MB</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/50 p-6 sm:p-8 flex items-end relative min-h-[300px] sm:min-h-[400px]">
                <div className="absolute inset-0 bg-blue-500/5" />
                <div className="w-full relative rounded-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 group h-full min-h-[300px]">
                  <Image
                    src="/screenshots/dj/cpu-audit.png"
                    alt="System Activity Monitor Audit"
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-cover object-left-top transition-transform duration-1000 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 4: Privacy (The Vault) */}
        <div className="mb-24 sm:mb-32 px-6 sm:px-10 py-12 sm:py-16 bg-slate-900/40 rounded-[2.5rem] sm:rounded-[3rem] border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 sm:p-12 opacity-5 -translate-y-8 translate-x-8 -rotate-12 group-hover:rotate-0 group-hover:translate-y-0 group-hover:translate-x-0 transition-all duration-1000 pointer-events-none">
            <Lock className="w-48 sm:w-64 h-48 sm:h-64 text-white" />
          </div>
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-4 mb-6 sm:mb-8">
              <ShieldCheck className="w-8 h-8 sm:w-10 h-10 text-emerald-500" />
              <h2 className="text-3xl sm:text-4xl font-black text-white italic uppercase tracking-tighter">
                Privacy <span className="text-emerald-500 font-[inherit]">Encrypted</span>
              </h2>
            </div>
            <p className="text-slate-300 text-base sm:text-lg leading-relaxed font-medium mb-8 sm:mb-10 text-balance">
              Your music collection is your competitive advantage. Pika! does not share or upload
              your actual audio files. We only transmit derived acoustic features for visualization.
              <strong className="text-white">
                {" "}
                You have full control over what is displayed and captured.
              </strong>
            </p>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              {["AES-256 Metadata Transit", "Library-First Safety", "No Cloud Audio"].map(
                (tag, i) => (
                  <div
                    key={i}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-[8px] sm:text-[9px] font-black text-emerald-500 uppercase tracking-widest"
                  >
                    {tag}
                  </div>
                ),
              )}
            </div>
          </div>
        </div>

        {/* CTA: Join the Booth */}
        <div className="group block relative overflow-hidden rounded-[2.5rem] sm:rounded-[3rem] p-1 mb-16 sm:mb-20 bg-slate-900/30 border border-white/5">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
          <div className="relative p-8 sm:p-12 md:p-20 rounded-[2.4rem] sm:rounded-[2.9rem] text-center font-[inherit] backdrop-blur-sm">
            <h3 className="text-3xl sm:text-4xl md:text-5xl font-black text-white italic uppercase tracking-tighter mb-6 leading-tight text-balance">
              Claim Your <span className="text-blue-400 font-[inherit]">Booth Intelligence</span>
            </h3>

            {platform === "mobile" ? (
              <>
                <p className="text-slate-400 text-sm sm:text-lg mb-10 sm:mb-12 max-w-sm mx-auto font-medium">
                  Switch to your workstation to download the companion, or send the setup link to
                  yourself now.
                </p>
                <div className="flex flex-col items-center justify-center gap-4">
                  <a
                    href="mailto:?subject=Pika! Sidecar Setup&body=Download the Pika! Sidecar here: https://pika.stream/download"
                    className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 bg-white text-slate-950 font-black uppercase text-[10px] sm:text-[12px] tracking-widest rounded-xl sm:rounded-2xl shadow-2xl flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Mail className="w-5 h-5" />
                    Send to my email
                  </a>
                  <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-2 mt-4">
                    <Smartphone className="w-4 h-4" /> Mobile Detection Active
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="text-slate-400 text-sm sm:text-lg mb-10 sm:mb-12 max-w-md mx-auto font-medium">
                  Download the {getPlatformLabel()} companion and start broadcasting your first set
                  in minutes.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-8">
                  <Link
                    href="/download"
                    className="w-full sm:w-auto px-10 sm:px-12 py-4 sm:py-5 bg-white text-slate-950 font-black uppercase text-[10px] sm:text-[12px] tracking-widest rounded-xl sm:rounded-2xl shadow-2xl flex items-center justify-center gap-3 hover:scale-105 active:scale-95 transition-all"
                  >
                    <Download className="w-5 h-5" />
                    Download for {getPlatformLabel()}
                  </Link>
                  <Link
                    href="/download"
                    className="text-[10px] sm:text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest flex items-center gap-2 transition-all hover:translate-x-2 p-2"
                  >
                    Other Platforms <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer Audit Registry */}
        <footer className="py-16 sm:py-20 border-t border-slate-900 text-center opacity-40">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center border border-white/10 grayscale opacity-50">
              <Database className="w-5 h-5 text-slate-400" />
            </div>
            <p className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.4em] sm:tracking-[0.6em] text-slate-500 px-4">
              Pika! Platform • Technical Registry • v0.3.0
            </p>
            <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-2 px-6">
              <span className="text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase">
                Architecture: Tauri/Rust
              </span>
              <span className="text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase">
                Protocol: Native Interop
              </span>
              <span className="text-[7px] sm:text-[8px] font-bold text-slate-600 uppercase">
                Status: Nominal
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
