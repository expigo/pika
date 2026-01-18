"use client";

import {
  Activity,
  ArrowLeft,
  Cpu,
  Database,
  Download,
  FileCode,
  Headphones,
  Lock,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { ProCard, ProHeader } from "@/components/ui/ProCard";

export default function ForDJs() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-blue-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-blue-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-4xl mx-auto px-6 py-16">
        <div className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50"
          >
            <ArrowLeft className="w-4 h-4" />
            Terminal Home
          </Link>
        </div>

        <div className="text-center mb-20">
          <div className="inline-flex items-center justify-center p-4 bg-blue-500/10 rounded-2xl mb-8 border border-blue-500/20 shadow-lg shadow-blue-900/20">
            <Headphones className="w-12 h-12 text-blue-400" />
          </div>
          <h1 className="text-5xl md:text-6xl font-black text-white mb-6 italic uppercase tracking-tighter">
            The DJ's <span className="text-blue-400">Silent Partner</span>
          </h1>
          <p className="text-[11px] font-black text-slate-500 uppercase tracking-[0.4em] mb-12">
            Technical Transparency for the critical booth
          </p>
          <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto font-medium">
            Pika! is built to be lightweight, secure, and non-intrusive. We focus on zero-contention
            analysis so you can focus on the dance floor.
          </p>
        </div>

        {/* Technical Core Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-20">
          <ProCard>
            <ProHeader title="Read-Only Design" icon={Lock} />
            <div className="px-8 pb-8">
              <p className="text-slate-400 text-sm leading-relaxed">
                We never touch your music files. Our sidecar only reads the history logs generated
                by VirtualDJ or Serato. Your library remains untouched and pristine.
              </p>
            </div>
          </ProCard>

          <ProCard>
            <ProHeader title="Local-First Analysis" icon={Cpu} />
            <div className="px-8 pb-8">
              <p className="text-slate-400 text-sm leading-relaxed">
                Audio fingerprinting and BPM analysis happen on your machine using a highly
                optimized Python sidecar. No massive uploads required.
              </p>
            </div>
          </ProCard>

          <ProCard>
            <ProHeader title="Offline Persistence" icon={Database} />
            <div className="px-8 pb-8">
              <p className="text-slate-400 text-sm leading-relaxed">
                Venue WiFi dropped? Pika! queues your set data locally and syncs automatically when
                the connection is restored. No data loss, ever.
              </p>
            </div>
          </ProCard>

          <ProCard>
            <ProHeader title="Minimal Footprint" icon={Zap} />
            <div className="px-8 pb-8">
              <p className="text-slate-400 text-sm leading-relaxed">
                Consumes less RAM than a single browser tab. Built with Tauri and Rust for maximum
                performance and minimum resource contention.
              </p>
            </div>
          </ProCard>
        </div>

        {/* Integration Details */}
        <ProCard glow className="mb-20 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-800/50 flex items-center gap-3 bg-slate-900/20">
            <Activity className="w-5 h-5 text-blue-500" />
            <h2 className="font-black text-white italic uppercase tracking-tight">
              Protocol Integration
            </h2>
          </div>
          <div className="p-8 md:p-12 space-y-10">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 border border-blue-500/20">
                <FileCode className="w-6 h-6 text-blue-500" />
              </div>
              <div className="flex-1">
                <h4 className="font-black text-white italic uppercase tracking-tight text-lg mb-2">
                  VirtualDJ (Full Stack)
                </h4>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Pika! watches your{" "}
                  <code className="text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded font-mono text-xs">
                    history.m3u
                  </code>{" "}
                  and{" "}
                  <code className="text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded font-mono text-xs">
                    database.xml
                  </code>{" "}
                  files. State updates are broadcast in &lt;100ms.
                </p>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center shrink-0 border border-slate-700">
                <Terminal className="w-6 h-6 text-slate-400" />
              </div>
              <div className="flex-1">
                <h4 className="font-black text-white italic uppercase tracking-tight text-lg mb-2">
                  Headless Access
                </h4>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Advanced users can interact with the analysis engine directly via the exposed
                  localhost API for custom script integrations.
                </p>
              </div>
            </div>
          </div>
        </ProCard>

        {/* Security & Privacy */}
        <div className="mb-20 px-4">
          <div className="flex items-center gap-4 mb-6">
            <ShieldCheck className="w-8 h-8 text-emerald-500" />
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tight">
              Privacy <span className="text-emerald-500">Encrypted</span>
            </h2>
          </div>
          <p className="text-slate-400 leading-relaxed font-medium">
            We know your music collection is your competitive advantage. Pika! does not share your
            actual audio files. We only transmit metadata and derived audio features (Energy levels,
            Groove metrics) for visualization. All cloud data is encrypted in transit and at rest.
          </p>
        </div>

        {/* CTA */}
        <Link
          href="/download"
          className="group block relative overflow-hidden rounded-3xl p-1 mb-20"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 opacity-20 group-hover:opacity-40 transition-opacity" />
          <div className="relative bg-slate-950 p-10 rounded-[1.4rem] text-center border border-white/5 group-hover:bg-slate-900/50 transition-all">
            <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-4">
              Join the Booth
            </h3>
            <p className="text-slate-400 text-sm mb-8 max-w-sm mx-auto font-medium">
              Download the macOS sidecar and start broadcasting your first set in minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <div className="px-8 py-4 bg-white text-slate-950 font-black uppercase text-[10px] tracking-widest rounded-xl shadow-2xl flex items-center gap-2 group-hover:scale-105 transition-all">
                <Download className="w-4 h-4" />
                Download for macOS
              </div>
            </div>
          </div>
        </Link>

        <footer className="py-12 border-t border-slate-900 text-center opacity-30">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-500">
            Pika! Platform • Technical Registry • v0.3.0
          </p>
        </footer>
      </div>
    </div>
  );
}
