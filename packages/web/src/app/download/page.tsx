"use client";

import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Download,
  Globe,
  HardDrive,
  Laptop,
  Monitor,
  Shield,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  tag_name: string;
  body: string;
  assets: GitHubAsset[];
}

export default function DownloadPage() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [detectedOS, setDetectedOS] = useState<"mac" | "win" | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [showLog, setShowLog] = useState(false);

  useEffect(() => {
    // OS Detection
    if (typeof window !== "undefined") {
      const platform = window.navigator.platform.toLowerCase();
      if (platform.includes("mac")) setDetectedOS("mac");
      else if (platform.includes("win")) setDetectedOS("win");
    }

    async function fetchLatestRelease() {
      try {
        const response = await fetch(
          "https://api.github.com/repos/expigo/pika/releases?per_page=1",
        );
        if (response.ok) {
          const data = await response.json();
          if (data && data.length > 0) {
            setRelease(data[0]);
          }
        }
      } catch (e) {
        console.error("Failed to fetch release:", e);
      } finally {
        setLoading(false);
        setTimeout(() => setIsVisible(true), 50);
      }
    }

    fetchLatestRelease();
  }, []);

  const getAssetUrl = (extension: string) => {
    return release?.assets?.find((asset: GitHubAsset) => asset.name.endsWith(extension))
      ?.browser_download_url;
  };

  const macUrl = getAssetUrl(".dmg");
  const winUrl = getAssetUrl(".exe") || getAssetUrl(".msi");

  const features = [
    {
      title: "Real-time Monitoring",
      desc: "Sub-100ms latency between VirtualDJ history and the Pika! Cloud.",
      icon: <Zap className="w-5 h-5 text-purple-400" />,
    },
    {
      title: "BlackBox Persistence",
      desc: "Local SQLite core buffers every signal. Your recap stays perfect, even in a total signal blackout.",
      icon: <HardDrive className="w-5 h-5 text-blue-400" />,
    },
    {
      title: "Booth Integrity",
      desc: "Ephemeral token rotation and encrypted handshakes ensure your broadcast identity is locked.",
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
    },
    {
      title: "Precision Metadata",
      desc: "Synchronizes high-fidelity metadata—BPM and Musical Key—directly from your deck to the crowd.",
      icon: <Globe className="w-5 h-5 text-pink-400" />,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30 overflow-x-hidden">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/10 to-transparent blur-[120px]" />
        {/* Animated Scanline */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(0,0,0,0.5)_50%)] bg-[length:100%_4px] opacity-[0.03] animate-[pulse_4s_infinite]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-16">
        <div
          className={`mb-8 sm:mb-12 transition-all duration-700 delay-100 ${isVisible || !loading ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
        >
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50 active:scale-95 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Control Center
          </Link>
        </div>

        <div className="grid lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Hero & Downloads */}
          <div
            className={`lg:col-span-7 space-y-8 transition-all duration-1000 delay-300 ${isVisible || !loading ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-12"}`}
          >
            <ProCard glow className="overflow-hidden border-white/5">
              <div className="px-10 py-16 text-center lg:text-left border-b border-slate-800/50 bg-slate-900/10 relative overflow-hidden group">
                {/* Decorative Pattern */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-purple-500/10 transition-colors" />

                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-500 rounded-[2rem] mb-8 shadow-2xl shadow-purple-500/20 relative">
                  <Laptop className="w-10 h-10 text-white" />
                  <div className="absolute inset-0 bg-white/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 italic uppercase tracking-tighter leading-none">
                  Desktop <span className="text-purple-500 animate-pulse">Sidecar</span>
                </h1>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-10">
                  The Command Center for your Mix
                </p>
                <p className="text-slate-400 text-base max-w-lg leading-relaxed font-medium">
                  Integrate VirtualDJ directly with the Pika! cloud. Zero-latency analysis, offline
                  queueing, and real-time broadcasting.
                </p>
              </div>

              <div className="p-10 bg-slate-950/50 font-sans min-h-[400px] flex flex-col justify-center">
                {!loading && release ? (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex gap-5 items-center mb-8 relative group">
                      <div className="absolute inset-0 bg-amber-500/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20">
                        <Zap className="w-6 h-6 text-amber-500" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] font-black text-amber-500 uppercase tracking-widest leading-none mb-1.5 flex items-center gap-2">
                          Preview Build {release.tag_name}
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                        </p>
                        <p className="text-[12px] text-amber-200/60 font-medium leading-normal">
                          Actively testing core audio features. Build matches internal security hash{" "}
                          <code className="bg-amber-400/10 px-1 rounded font-mono text-amber-400/80">
                            fca2..91
                          </code>
                          .
                        </p>
                      </div>
                    </div>

                    {/* Download Actions */}
                    <div className="grid sm:grid-cols-2 gap-6">
                      {/* macOS */}
                      <a
                        href={macUrl || "#"}
                        className={`group relative overflow-hidden p-[2px] rounded-2xl transition-all duration-500 ${
                          macUrl
                            ? "hover:scale-[1.03] active:scale-[0.98] hover:shadow-[0_0_30px_rgba(168,85,247,0.4)]"
                            : "opacity-40 grayscale pointer-events-none"
                        }`}
                      >
                        <div
                          className={`absolute inset-0 bg-gradient-to-br from-purple-500 via-indigo-500 to-pink-500 transition-opacity duration-1000 ${detectedOS === "mac" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        />
                        <div className="relative bg-slate-950 px-6 py-8 rounded-[0.9rem] flex flex-col items-start gap-4">
                          <div className="flex justify-between w-full items-start">
                            <Download className="w-6 h-6 text-purple-400 group-hover:animate-bounce" />
                            {detectedOS === "mac" && (
                              <div className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/30 rounded-md text-[8px] font-black text-purple-400 uppercase tracking-widest animate-pulse">
                                System Detected
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-white font-black italic uppercase tracking-tight text-xl leading-tight">
                              macOS
                            </p>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                              Apple Silicon / Intel
                            </p>
                          </div>
                          <div className="flex justify-between w-full items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
                              .DMG
                            </span>
                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 group-hover:animate-ping" />
                          </div>
                        </div>
                      </a>

                      {/* Windows */}
                      <a
                        href={winUrl || "#"}
                        className={`group relative overflow-hidden p-[2px] rounded-2xl transition-all duration-500 ${
                          winUrl
                            ? "hover:scale-[1.03] active:scale-[0.98] hover:shadow-[0_0_30px_rgba(59,130,246,0.4)]"
                            : "opacity-40 grayscale pointer-events-none"
                        }`}
                      >
                        <div
                          className={`absolute inset-0 bg-gradient-to-br from-blue-500 via-indigo-500 to-cyan-500 transition-opacity duration-1000 ${detectedOS === "win" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                        />
                        <div className="relative bg-slate-950 px-6 py-8 rounded-[0.9rem] flex flex-col items-start gap-4">
                          <div className="flex justify-between w-full items-start">
                            <Monitor className="w-6 h-6 text-blue-400 group-hover:animate-pulse" />
                            {detectedOS === "win" && (
                              <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded-md text-[8px] font-black text-blue-400 uppercase tracking-widest animate-pulse">
                                System Detected
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="text-white font-black italic uppercase tracking-tight text-xl leading-tight">
                              Windows
                            </p>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                              Official x64 Binary
                            </p>
                          </div>
                          <div className="flex justify-between w-full items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-900/50 px-3 py-1 rounded-full border border-slate-800">
                              .EXE
                            </span>
                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 group-hover:animate-ping" />
                          </div>
                        </div>
                      </a>
                    </div>

                    {/* Changelog Toggle */}
                    <div className="pt-4">
                      <button
                        onClick={() => setShowLog(!showLog)}
                        className="flex items-center gap-2 text-[10px] font-black text-slate-600 hover:text-white uppercase tracking-widest transition-colors mb-4 group"
                      >
                        <Terminal className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
                        {showLog ? "Hide System Logs" : "View System Logs"}
                        {showLog ? (
                          <ChevronUp className="w-3 h-3" />
                        ) : (
                          <ChevronDown className="w-3 h-3" />
                        )}
                      </button>

                      {showLog && (
                        <div className="bg-black/40 border border-white/5 rounded-2xl p-6 font-mono text-[11px] leading-relaxed text-slate-400 animate-in slide-in-from-top-2 duration-300">
                          <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-2">
                            <div className="w-2 h-2 rounded-full bg-red-500" />
                            <div className="w-2 h-2 rounded-full bg-amber-500" />
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            <span className="ml-2 text-slate-600 uppercase tracking-tighter">
                              REL_{release.tag_name}_CORE.md
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap">
                            {release.body || "No release notes found."}
                          </div>
                          <div className="mt-4 pt-4 border-t border-white/5 text-[9px] text-slate-600 uppercase">
                            Authenticated Request • GitHub API v3
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Insecure Notice */}
                    {typeof window !== "undefined" && window.location.protocol !== "https:" && (
                      <div className="mt-8 p-6 bg-red-500/5 border border-red-500/20 rounded-2xl relative overflow-hidden group">
                        <div className="absolute inset-0 bg-red-500 opacity-[0.02] group-hover:opacity-[0.05] transition-opacity" />
                        <div className="flex items-center gap-3 mb-3 relative">
                          <Shield className="w-5 h-5 text-red-500" />
                          <h4 className="text-[11px] font-black text-red-500 uppercase tracking-[0.2em]">
                            Security Override Required
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-medium relative">
                          Browsers block binary downloads from non-SSL sites. Visit{" "}
                          <span className="text-red-400 font-bold hover:underline cursor-pointer">
                            pika.stream
                          </span>{" "}
                          for the secure encrypted mirror, or right-click "Keep" in your download
                          manager.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-20 text-center relative animate-in fade-in duration-500">
                    <div className="relative w-20 h-20 mx-auto mb-10">
                      <div className="absolute inset-0 border-2 border-purple-500/20 rounded-full" />
                      <div className="absolute inset-0 border-2 border-t-purple-500 rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Cpu className="w-8 h-8 text-purple-500/40 animate-pulse" />
                      </div>
                    </div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] animate-pulse">
                      Initiating Network Scan...
                    </p>
                    <div className="mt-4 flex justify-center gap-1">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="w-1 h-1 bg-purple-500 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.1}s` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </ProCard>
          </div>

          {/* Right Column: Intelligence & Specs */}
          <div
            className={`lg:col-span-5 space-y-6 transition-all duration-1000 delay-500 ${isVisible || !loading ? "opacity-100 translate-x-0" : "opacity-0 translate-x-12"}`}
          >
            <ProCard className="p-10 border-white/5">
              <div className="flex items-center gap-4 mb-10 group">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center border border-purple-500/20 group-hover:scale-110 transition-transform">
                  <Monitor className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-white italic uppercase tracking-tight">
                    Intelligence Layer
                  </h3>
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Sidecar Subsystems
                  </p>
                </div>
              </div>

              <div className="space-y-8">
                {features.map((feature, i) => (
                  <div key={i} className="flex gap-6 group cursor-default">
                    <div className="relative shrink-0">
                      <div className="w-12 h-12 bg-slate-900 border border-white/5 rounded-2xl flex items-center justify-center group-hover:border-purple-500/40 group-hover:shadow-[0_0_15px_rgba(168,85,247,0.2)] transition-all duration-500 relative z-10">
                        {feature.icon}
                      </div>
                      {/* Booth-to-Cloud Pulse */}
                      <div className="absolute inset-0 bg-purple-500/20 rounded-2xl blur-md opacity-0 group-hover:opacity-100 group-hover:animate-ping duration-1000" />
                      <span className="absolute -top-2 -right-2 text-[9px] font-black text-slate-700 italic group-hover:text-white transition-colors z-20">
                        0{i + 1}
                      </span>
                    </div>
                    <div>
                      <p className="text-white font-black italic uppercase tracking-tight text-sm mb-1.5 group-hover:text-purple-400 transition-colors">
                        {feature.title}
                      </p>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed group-hover:text-slate-400 transition-colors">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ProCard>

            <ProCard className="p-8 bg-gradient-to-br from-slate-900/50 to-slate-950/80 border-white/5">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">
                  Hardware Architecture
                </span>
                <div className="flex gap-1.5 items-center">
                  <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[8px] font-black text-emerald-500/60 uppercase tracking-widest">
                    Node Connected
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/40 p-4 rounded-xl border border-white/5 group hover:border-purple-500/20 transition-colors">
                  <p className="text-[9px] font-black text-slate-600 uppercase mb-2 flex items-center gap-2">
                    <Check className="w-3 h-3 text-emerald-500" /> OS
                  </p>
                  <p className="text-[11px] text-white font-bold italic">macOS 12+ / Win 10+</p>
                </div>
                <div className="bg-black/40 p-4 rounded-xl border border-white/5 group hover:border-purple-500/20 transition-colors">
                  <p className="text-[9px] font-black text-slate-600 uppercase mb-2 flex items-center gap-2">
                    <Check className="w-3 h-3 text-emerald-500" /> Arch
                  </p>
                  <p className="text-[11px] text-white font-bold italic">x64 / ARM64</p>
                </div>
              </div>
            </ProCard>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center mt-24 pb-12">
          <div className="w-px h-12 bg-gradient-to-b from-purple-500/50 to-transparent mx-auto mb-8" />
          <p className="text-[9px] font-black uppercase tracking-[0.6em] text-slate-500 mb-2">
            Pika! Core Systems Distribution
          </p>
          <p className="text-[8px] font-bold text-slate-600 italic uppercase tracking-[0.2em]">
            Digital Authorized Access Protocol v0.9-REL
          </p>
        </div>
      </div>
    </div>
  );
}
