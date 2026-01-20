"use client";

import {
  ArrowLeft,
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
      {/* Dynamic Background + Grid Audit Overlay */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[1200px] bg-gradient-to-b from-purple-600/15 via-transparent to-transparent blur-[160px] animate-[atmos-pulse_8s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808010_1px,transparent_1px),linear-gradient(to_bottom,#80808010_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Navigation */}
        <div className="mb-12 flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900 border border-white/5 hover:border-white/10 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest active:scale-95 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Go Home
          </Link>
          <div className="px-5 py-2.5 rounded-full bg-white/5 backdrop-blur-3xl border border-white/5 text-[10px] font-semibold text-slate-400 uppercase tracking-[0.6em]">
            Registry v0.2.1 • Production Ready
          </div>
        </div>

        {/* Hero Section: The Handshake */}
        <div className="text-center mb-28 sm:mb-36 px-2 relative">
          <div className="relative inline-flex items-center justify-center p-6 mb-12 group/hero-icon">
            <div className="absolute inset-0 bg-purple-500/20 blur-3xl rounded-full animate-[breathing-glow_4s_ease-in-out_infinite]" />
            <div className="relative p-5 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl">
              <Headphones className="w-12 h-12 sm:w-14 h-14 text-purple-400" />
            </div>
          </div>
          <div className="relative inline-block px-4 py-4 overflow-visible">
            <h1 className="text-4xl sm:text-6xl md:text-8xl font-black text-white italic uppercase tracking-tighter leading-tight text-balance pr-12 overflow-visible">
              The DJ's{" "}
              <span className="bg-gradient-to-r from-purple-400 to-indigo-400 text-transparent bg-clip-text font-[inherit] inline-block pr-8">
                Silent Partner
              </span>
            </h1>
          </div>
          <p className="text-[10px] sm:text-[12px] font-semibold text-slate-400 uppercase tracking-[0.6em] mb-12 sm:mb-16">
            Technical Integrity for the High-Stakes WCS Booth
          </p>

          {/* Performance Trust Bar: The Integrated Dashboard */}
          <div className="relative max-w-4xl mx-auto">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-transparent to-pink-500/10 blur-3xl opacity-30" />
            <div className="relative flex flex-col md:flex-row items-stretch justify-between px-8 py-10 bg-slate-900/40 border border-white/5 rounded-[2.5rem] backdrop-blur-3xl shadow-2xl overflow-hidden group/badge">
              {/* Scanline Animation */}
              <div className="absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-purple-400/50 to-transparent translate-y-[-1px] group-hover/badge:translate-y-[100px] transition-transform duration-[3s] ease-linear" />

              <div className="flex items-center gap-5 w-full md:w-1/3 px-4">
                <div className="relative shrink-0">
                  <Cpu className="w-5 h-5 text-purple-400" />
                  <div className="absolute inset-0 bg-purple-400 blur-sm opacity-20" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.3em] mb-1.5 leading-none">
                    Impact Audit
                  </p>
                  <p className="text-lg font-bold text-white tracking-tighter leading-none italic">
                    0.2%{" "}
                    <span className="text-[10px] uppercase text-slate-500 not-italic ml-1">
                      CPU Usage
                    </span>
                  </p>
                </div>
              </div>

              <div className="hidden md:block w-px bg-white/5 self-stretch" />

              <div className="flex items-center gap-5 w-full md:w-1/3 px-4 py-10 md:py-0">
                <div className="relative shrink-0">
                  <Zap className="w-5 h-5 text-pink-400" />
                  <div className="absolute inset-0 bg-pink-400 blur-sm opacity-20" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.3em] mb-1.5 leading-none">
                    Latency
                  </p>
                  <p className="text-lg font-bold text-white tracking-tighter leading-none italic">
                    &lt; 15ms{" "}
                    <span className="text-[10px] uppercase text-slate-500 not-italic ml-1">
                      Broadcast
                    </span>
                  </p>
                </div>
              </div>

              <div className="hidden md:block w-px bg-white/5 self-stretch" />

              <div className="flex items-center gap-5 w-full md:w-1/3 px-4">
                <div className="relative shrink-0">
                  <ShieldCheck className="w-5 h-5 text-indigo-400" />
                  <div className="absolute inset-0 bg-indigo-400 blur-sm opacity-20" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.3em] mb-1.5 leading-none">
                    Protection
                  </p>
                  <p className="text-lg font-bold text-white tracking-tighter leading-none italic">
                    Read-Only{" "}
                    <span className="text-[10px] uppercase text-slate-500 not-italic ml-1">
                      Safety
                    </span>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 1: Performance Proof (Native Interop) */}
        <div className="mb-24 sm:mb-32">
          <div className="flex justify-center mb-16 sm:mb-20 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900 border border-white/10 shadow-2xl backdrop-blur-3xl relative z-10 group/node">
              <div className="w-1 h-1 rounded-full bg-slate-500 group-hover/node:bg-purple-400 transition-colors" />
              <h2 className="text-[10px] font-semibold text-slate-500 group-hover:text-slate-300 transition-colors uppercase tracking-[0.5em] pr-2">
                Engineered for Connection
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 mb-16">
            <div className="p-10 bg-slate-900/10 border border-white/5 rounded-[2.5rem] group hover:bg-slate-900/30 transition-all cursor-default relative overflow-hidden backdrop-blur-3xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(168,85,247,0.05),transparent_50%)]" />
              <div className="absolute -inset-10 bg-purple-500/5 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-8 border border-purple-500/20 group-hover:scale-110 group-hover:border-purple-500/40 transition-all shadow-2xl">
                <Zap className="w-7 h-7 text-purple-400" />
              </div>
              <h4 className="relative text-2xl font-bold text-white mb-4 tracking-tight">
                Zero Latency
              </h4>
              <p className="relative text-base text-slate-400/80 leading-relaxed font-medium">
                Optimized Rust core identifies tracks instantly. No lag in your local UI, no delays
                in your broadcast.
              </p>
            </div>

            <div className="p-10 bg-slate-900/10 border border-white/5 rounded-[2.5rem] group hover:bg-slate-900/30 transition-all cursor-default relative overflow-hidden backdrop-blur-3xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(99,102,241,0.05),transparent_50%)]" />
              <div className="absolute -inset-10 bg-indigo-500/5 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center mb-8 border border-indigo-500/20 group-hover:scale-110 group-hover:border-indigo-500/40 transition-all shadow-2xl">
                <Terminal className="w-7 h-7 text-indigo-400" />
              </div>
              <h4 className="relative text-2xl font-bold text-white mb-4 tracking-tight">
                Zero Configuration
              </h4>
              <p className="relative text-base text-slate-400/80 leading-relaxed font-medium">
                Pika! auto-detects VirtualDJ, Rekordbox, and Serato. Just open your software and
                bridge.
              </p>
            </div>

            <div className="p-10 bg-slate-900/10 border border-white/5 rounded-[2.5rem] group hover:bg-slate-900/30 transition-all cursor-default sm:col-span-2 lg:col-span-1 relative overflow-hidden backdrop-blur-3xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(236,72,153,0.05),transparent_50%)]" />
              <div className="absolute -inset-10 bg-pink-500/5 blur-[50px] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
              <div className="relative w-14 h-14 rounded-2xl bg-pink-500/10 flex items-center justify-center mb-8 border border-pink-500/20 group-hover:scale-110 group-hover:border-pink-500/40 transition-all shadow-2xl">
                <ShieldCheck className="w-7 h-7 text-pink-400" />
              </div>
              <h4 className="relative text-2xl font-bold text-white mb-4 tracking-tight">
                Zero Interference
              </h4>
              <p className="relative text-base text-slate-400/80 leading-relaxed font-medium">
                Strict read-only protocol. Your library files and metadata remain untouched.
                Forever.
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
              <div className="absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-purple-400 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-[0.5px]" />
              <div className="absolute inset-0 p-6 sm:p-10 md:p-14 flex flex-col justify-end">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 sm:gap-12">
                  <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-[9px] font-bold text-purple-400 uppercase tracking-[0.2em] mb-6">
                      <div className="w-1 h-1 rounded-full bg-purple-400 animate-pulse" />
                      Protocol Live
                    </div>
                    <h3 className="text-3xl sm:text-4xl md:text-6xl font-bold text-white mb-6 tracking-tighter italic uppercase">
                      Booth <span className="text-purple-400">Mirroring</span>
                    </h3>
                    <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-medium max-w-lg">
                      Pika! creates a digital twin of your booth state in real-time. Waveforms,
                      stems, and performance metrics are bridged with zero-noise integrity.
                      <span className="block mt-4 text-purple-400/80 italic text-[10px] uppercase tracking-widest font-black">
                        Live verification stream active
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div className="px-6 py-5 bg-slate-950/80 backdrop-blur-2xl rounded-3xl border border-white/10 shrink-0 shadow-[0_0_40px_rgba(0,0,0,0.5)] group/telemetry">
                      <div className="flex items-center justify-between gap-8 mb-2">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                          Sync Drift
                        </p>
                        <div className="w-8 h-3 flex items-end gap-0.5">
                          {[1, 2, 3, 4].map((i) => (
                            <div
                              key={i}
                              className="flex-1 bg-purple-500/40 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]"
                              style={{ height: `${i * 25}%`, animationDelay: `${i * 0.2}s` }}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-2xl font-black text-white italic leading-none tabular-nums">
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
          <div className="flex justify-center mb-16 sm:mb-20 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900 border border-white/10 shadow-2xl backdrop-blur-3xl relative z-10 group/node">
              <div className="w-1 h-1 rounded-full bg-slate-500 group-hover/node:bg-indigo-400 transition-colors" />
              <h2 className="text-[10px] font-semibold text-slate-500 group-hover:text-slate-300 transition-colors uppercase tracking-[0.5em] pr-2">
                Acoustic Intelligence
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-start">
            <div className="space-y-12">
              <div className="group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:scale-110 group-hover:border-purple-500/40 transition-all">
                    <Fingerprint className="w-5 h-5 text-purple-400" />
                  </div>
                  <h4 className="text-2xl font-bold text-white tracking-tight">
                    Spectral Analysis
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
                <div className="relative aspect-[16/10] bg-[#0c0e14] rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl group cursor-pointer">
                  <div className="absolute inset-0 bg-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 z-10" />
                  <Image
                    src="/screenshots/dj/track-inspector.png"
                    alt="Track Visual Fingerprint"
                    fill
                    sizes="(max-width: 768px) 100vw, 800px"
                    className="object-cover object-top transition-transform duration-1000 group-hover:scale-105 group-hover:rotate-1"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.5rem] pointer-events-none z-20" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                </div>
              </div>
            </div>

            <div className="space-y-12">
              <div className="group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover:scale-110 group-hover:border-indigo-500/40 transition-all">
                    <Waves className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h4 className="text-2xl font-bold text-white tracking-tight">
                    Energy Trajectory
                  </h4>
                </div>
                <div className="min-h-[80px]">
                  <p className="text-slate-400 text-sm sm:text-base leading-relaxed font-medium mb-8">
                    Visualize the "Pulse" of your entire set. Real-time trend mapping showing how
                    the energy and tempo of your room evolved from the first track to the peak hour.
                  </p>
                </div>
                <div className="relative aspect-[16/10] bg-[#0c0e14] rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl group cursor-pointer">
                  <div className="absolute inset-0 bg-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 z-10" />
                  <Image
                    src="/screenshots/dj/crate-intelligence.png"
                    alt="Crate Intelligence Dashboard"
                    fill
                    sizes="(max-width: 768px) 100vw, 800px"
                    className="object-cover object-top transition-transform duration-1000 group-hover:scale-105 group-hover:-rotate-1"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.5rem] pointer-events-none z-20" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 3: Community & Crowd (The Spirit) */}
        <div className="mb-24 sm:mb-32 px-2">
          <div className="flex justify-center mb-16 sm:mb-20 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900 border border-white/10 shadow-2xl backdrop-blur-3xl relative z-10 group/node">
              <div className="w-1 h-1 rounded-full bg-slate-500 group-hover/node:bg-pink-400 transition-colors" />
              <h2 className="text-[10px] font-semibold text-slate-500 group-hover:text-slate-300 transition-colors uppercase tracking-[0.5em] pr-2">
                Vibe Governance
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 sm:gap-16 items-center">
            <div className="relative aspect-[16/10] bg-slate-900/50 rounded-[2.5rem] border border-white/5 overflow-hidden shadow-2xl group order-2 lg:order-1">
              <div className="absolute inset-0 bg-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 z-10" />
              <Image
                src="/screenshots/dj/governance-view.png"
                alt="Live Vibe Governance Dashboard"
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-cover transition-transform duration-1000 group-hover:scale-105 group-hover:rotate-1"
              />
              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.5rem] pointer-events-none z-20" />
              <div className="absolute top-6 right-6 px-4 py-2 bg-slate-900/80 backdrop-blur-md rounded-full border border-pink-500/30 text-[10px] font-bold text-pink-400 uppercase tracking-[0.2em] animate-pulse z-30">
                Dialogue Stream: Active
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <h3 className="text-3xl sm:text-5xl font-bold text-white mb-6 tracking-tighter leading-tight">
                Booth <span className="text-pink-400">Dialogue</span>
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
                    className="flex items-start gap-4 text-slate-300 font-medium group/li"
                  >
                    <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-pink-500" />
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
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-2 h-2 rounded-full bg-pink-500 animate-[pulse_2s_ease-in-out_infinite]" />
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-[0.4em]">
                    Resource Audit Node
                  </span>
                </div>
                <h3 className="text-3xl sm:text-5xl font-bold text-white mb-8 tracking-tighter">
                  Silent <span className="text-slate-500 italic">Architecture</span>
                </h3>
                <p className="text-slate-400 text-base sm:text-lg leading-relaxed mb-10 font-medium text-balance">
                  We know you can't afford a crash. Pika! is built using a local-first{" "}
                  <strong className="text-slate-200">Tauri + Rust</strong>
                  architecture that consumes fewer resources than a browser tab.
                </p>
                <div className="grid grid-cols-2 gap-4 sm:gap-6 p-1 bg-black/20 rounded-2xl border border-white/5">
                  <div className="p-4 sm:p-6 text-center">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-[0.2em] whitespace-nowrap">
                      CPU Impact
                    </p>
                    <p className="text-3xl font-bold text-white italic">0.2%</p>
                  </div>
                  <div className="p-4 sm:p-6 text-center border-l border-white/5">
                    <p className="text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-[0.2em] whitespace-nowrap">
                      RAM Usage
                    </p>
                    <p className="text-3xl font-bold text-white italic">38.2MB</p>
                  </div>
                </div>
              </div>
              <div className="bg-slate-900/50 p-6 sm:p-8 flex items-end relative min-h-[300px] sm:min-h-[400px]">
                <div className="absolute inset-0 bg-blue-500/5" />
                <div className="w-full relative rounded-3xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/10 group h-full min-h-[300px] bg-slate-950">
                  <div className="absolute inset-0 bg-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-1000 z-10" />
                  <Image
                    src="/screenshots/dj/cpu-audit.png"
                    alt="System Activity Monitor Audit"
                    fill
                    sizes="(max-width: 640px) 100vw, 640px"
                    className="object-cover object-left-top transition-transform duration-1000 group-hover:scale-110 group-hover:-rotate-1"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-3xl pointer-events-none z-20" />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent opacity-60 pointer-events-none z-30" />
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
            <div className="flex items-center gap-5 mb-10">
              <div className="p-4 bg-slate-900 border border-white/10 rounded-2xl shadow-2xl">
                <ShieldCheck className="w-8 h-8 sm:w-10 h-10 text-pink-400" />
              </div>
              <h2 className="text-3xl sm:text-5xl font-bold text-white tracking-tighter">
                Privacy <span className="text-pink-400">Protocol</span>
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
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-slate-950/50 rounded-full border border-white/5 text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] group-hover:border-pink-500/20 group-hover:text-slate-200 transition-all"
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
            <h3 className="text-4xl sm:text-6xl md:text-8xl font-black text-white italic uppercase tracking-tighter mb-8 leading-[0.85]">
              Bridge Your <span className="text-purple-400">Booth</span>
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
              Pika! Platform • Connection Layer • v0.2.1
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
