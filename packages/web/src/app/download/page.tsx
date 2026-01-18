"use client";

import { ArrowLeft, Download, Laptop, Monitor, Shield, Zap } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";

export default function DownloadPage() {
  const [release, setRelease] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      }
    }

    fetchLatestRelease();
  }, []);

  const getAssetUrl = (extension: string) => {
    return release?.assets?.find((asset: any) => asset.name.endsWith(extension))
      ?.browser_download_url;
  };

  const macUrl = getAssetUrl(".dmg");
  const winUrl = getAssetUrl(".exe") || getAssetUrl(".msi");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-16">
        <div className="mb-8 sm:mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50 active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Control Center
          </Link>
        </div>

        <div className="grid lg:grid-cols-12 gap-12 items-start">
          {/* Left Column: Hero & Downloads */}
          <div className="lg:col-span-7 space-y-8">
            <ProCard glow className="overflow-hidden">
              <div className="px-10 py-16 text-center lg:text-left border-b border-slate-800/50 bg-slate-900/10">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-[2rem] mb-8 shadow-2xl shadow-purple-500/20">
                  <Laptop className="w-10 h-10 text-white" />
                </div>
                <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 italic uppercase tracking-tighter leading-none">
                  Desktop <span className="text-purple-500">Sidecar</span>
                </h1>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-10">
                  The Command Center for your Mix
                </p>
                <p className="text-slate-400 text-base max-w-lg leading-relaxed font-medium">
                  Integrate VirtualDJ directly with the Pika! cloud. Zero-latency analysis, offline
                  queueing, and real-time broadcasting.
                </p>
              </div>

              <div className="p-10 bg-slate-950/50 font-sans">
                {!loading && release ? (
                  <div className="space-y-6">
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex gap-5 items-center mb-8">
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0">
                        <Zap className="w-6 h-6 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-[11px] font-black text-amber-500 uppercase tracking-widest leading-none mb-1.5">
                          Preview Build {release.tag_name}
                        </p>
                        <p className="text-[12px] text-amber-200/60 font-medium leading-normal">
                          Actively testing core audio features. Build matches internal security hash{" "}
                          <code className="bg-amber-400/10 px-1 rounded">fca2..91</code>.
                        </p>
                      </div>
                    </div>

                    {/* Download Actions */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      {/* macOS */}
                      <a
                        href={macUrl || "#"}
                        className={`group relative overflow-hidden p-1 rounded-2xl transition-all ${
                          macUrl
                            ? "hover:scale-[1.02] active:scale-[0.98] hover:shadow-[0_0_20px_rgba(168,85,247,0.3)] border border-transparent hover:border-purple-500/30"
                            : "opacity-40 grayscale"
                        }`}
                        onClick={(e) => !macUrl && e.preventDefault()}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-indigo-500" />
                        <div className="relative bg-slate-950 px-6 py-6 rounded-[0.9rem] flex flex-col items-start gap-4">
                          <Download className="w-6 h-6 text-purple-400" />
                          <div>
                            <p className="text-white font-black italic uppercase tracking-tight text-lg leading-tight">
                              macOS
                            </p>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                              Apple Silicon / Intel
                            </p>
                          </div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-900 px-3 py-1 rounded-full border border-slate-800 self-end">
                            .DMG
                          </span>
                        </div>
                      </a>

                      {/* Windows */}
                      <a
                        href={winUrl || "#"}
                        className={`group relative overflow-hidden p-1 rounded-2xl transition-all ${
                          winUrl
                            ? "hover:scale-[1.02] active:scale-[0.98] hover:shadow-[0_0_20px_rgba(59,130,246,0.3)] border border-transparent hover:border-blue-500/30"
                            : "opacity-40 grayscale"
                        }`}
                        onClick={(e) => !winUrl && e.preventDefault()}
                      >
                        <div className="absolute inset-0 bg-slate-800" />
                        <div className="relative bg-slate-950 px-6 py-6 rounded-[0.9rem] flex flex-col items-start gap-4">
                          <Monitor className="w-6 h-6 text-blue-400" />
                          <div>
                            <p className="text-white font-black italic uppercase tracking-tight text-lg leading-tight">
                              Windows
                            </p>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                              Official x64 Binary
                            </p>
                          </div>
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-900 px-3 py-1 rounded-full border border-slate-800 self-end">
                            .EXE
                          </span>
                        </div>
                      </a>
                    </div>

                    {/* Insecure Notice */}
                    {typeof window !== "undefined" && window.location.protocol !== "https:" && (
                      <div className="mt-8 p-6 bg-red-500/5 border border-red-500/20 rounded-2xl">
                        <div className="flex items-center gap-3 mb-3">
                          <Shield className="w-5 h-5 text-red-500" />
                          <h4 className="text-[11px] font-black text-red-500 uppercase tracking-[0.2em]">
                            Security Override Required
                          </h4>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                          Browsers block binary downloads from non-SSL sites. Visit{" "}
                          <span className="text-red-400">pika.stream</span> for the secure encrypted
                          mirror, or right-click "Keep" in your download manager.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <div className="w-12 h-12 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-6" />
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] animate-pulse">
                      Initiating Network Scan...
                    </p>
                  </div>
                )}
              </div>
            </ProCard>
          </div>

          {/* Right Column: Intelligence & Specs */}
          <div className="lg:col-span-5 space-y-6">
            <ProCard className="p-10">
              <div className="flex items-center gap-4 mb-10">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
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
                {[
                  {
                    title: "Real-time Monitoring",
                    desc: "Sub-100ms latency between VirtualDJ history and the Pika! Cloud.",
                  },
                  {
                    title: "Offline Resilience",
                    desc: "Hardware-level SQLite queue stores your data if the venue WiFi drops.",
                  },
                  {
                    title: "Security Mesh",
                    desc: "Automatic CSRF protection and ephemeral token management built-in.",
                  },
                  {
                    title: "Smart Normalization",
                    desc: "Removes remixes, years, and clean/dirty tags for beautiful displays.",
                  },
                ].map((feature, i) => (
                  <div key={i} className="flex gap-6 group">
                    <span className="text-slate-800 font-black italic text-2xl group-hover:text-purple-500 transition-colors">
                      0{i + 1}
                    </span>
                    <div>
                      <p className="text-white font-black italic uppercase tracking-tight text-sm mb-1.5 group-hover:text-purple-400 transition-colors">
                        {feature.title}
                      </p>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        {feature.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ProCard>

            <ProCard className="p-8 bg-gradient-to-br from-slate-900 to-slate-950">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  System Requirements
                </span>
                <div className="flex gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/30" />
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-1">OS</p>
                  <p className="text-[11px] text-white font-bold">macOS 12+ / Win 10+</p>
                </div>
                <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                  <p className="text-[9px] font-black text-slate-500 uppercase mb-1">
                    Architecture
                  </p>
                  <p className="text-[11px] text-white font-bold">x64 / ARM64</p>
                </div>
              </div>
            </ProCard>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center opacity-30 mt-24 pb-12">
          <p className="text-[9px] font-black uppercase tracking-[0.6em] text-slate-500 mb-2">
            Pika! Core Systems Distribution
          </p>
          <p className="text-[8px] font-bold text-slate-600 italic uppercase tracking-[0.2em]">
            Authorized Access Required
          </p>
        </div>
      </div>
    </div>
  );
}
