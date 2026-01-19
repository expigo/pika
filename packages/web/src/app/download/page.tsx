"use client";

import { Download, Apple, ArrowLeft, Headphones, Monitor, History, Zap } from "lucide-react";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";

export default function DownloadPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-purple-500/30">
      {/* Navigation */}
      <nav className="p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Floor
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20 text-center">
        <div className="inline-flex items-center gap-3 px-5 py-2 bg-purple-500/10 rounded-full text-purple-400 text-[10px] font-black uppercase tracking-[0.4em] mb-12 border border-purple-500/20 shadow-2xl shadow-purple-500/10">
          <Download className="w-4 h-4" />
          The Sidecar Engine
        </div>

        <h1 className="text-6xl md:text-8xl font-black text-white mb-8 italic uppercase tracking-tighter leading-none">
          LOW IMPACT.
          <br />
          <span className="bg-gradient-to-r from-purple-400 via-slate-200 to-purple-500 text-transparent bg-clip-text">
            HIGH FIDELITY.
          </span>
        </h1>

        <p className="text-xl sm:text-2xl text-slate-400 mb-20 font-medium leading-relaxed max-w-2xl mx-auto tracking-tight">
          Download the specialized macOS binary that bridges your VirtualDJ session with the Pika!
          ecosystem.
        </p>

        <div className="grid md:grid-cols-2 gap-8 mb-32 items-stretch">
          <ProCard
            className="p-10 flex flex-col items-center text-center bg-slate-950/80 border-purple-500/30"
            glow
            bgImage="/textures/dj.png"
          >
            <div className="w-20 h-20 rounded-3xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center mb-8 shadow-2xl shadow-purple-500/20">
              <Apple className="w-10 h-10 text-purple-400" />
            </div>
            <h2 className="text-3xl font-black text-white mb-4 italic uppercase tracking-tight">
              macOS Sidecar
            </h2>
            <p className="text-slate-400 text-sm font-medium mb-12 leading-relaxed">
              Compatible with Apple Silicon (M1/M2/M3) and Intel Macs. Requires VirtualDJ 2023 or
              later.
            </p>
            <button
              disabled
              className="w-full bg-white text-slate-900 px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 active:scale-95 transition-all shadow-2xl flex items-center justify-center gap-3 mb-4"
            >
              Download v0.2.1
              <Download className="w-4 h-4" />
            </button>
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest leading-tight">
              Beta Access Only &mdash; Sign in to Activate
            </span>
          </ProCard>

          <ProCard
            className="p-10 flex flex-col items-center text-center bg-slate-900/40 border-white/5"
            glow
          >
            <div className="w-20 h-20 rounded-3xl bg-slate-800 border border-white/5 flex items-center justify-center mb-8">
              <Monitor className="w-10 h-10 text-slate-600" />
            </div>
            <h2 className="text-3xl font-black text-slate-400 mb-4 italic uppercase tracking-tight opacity-50">
              Windows Build
            </h2>
            <p className="text-slate-600 text-sm font-medium mb-12 leading-relaxed">
              We are currently optimizing the Windows engine for VirtualDJ and Serato.
            </p>
            <button
              disabled
              className="w-full bg-slate-800 text-slate-600 px-8 py-5 rounded-2xl font-black text-xs uppercase tracking-widest cursor-not-allowed border border-white/5"
            >
              Coming Soon
            </button>
          </ProCard>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-8 rounded-[2rem] bg-slate-900/40 border border-white/5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <h4 className="text-sm font-black text-white mb-2 italic uppercase tracking-widest">
              Low CPU Use
            </h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Runs under 1% CPU. Your performance software always takes priority.
            </p>
          </div>
          <div className="p-8 rounded-[2rem] bg-slate-900/40 border border-white/5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6">
              <History className="w-5 h-5 text-purple-400" />
            </div>
            <h4 className="text-sm font-black text-white mb-2 italic uppercase tracking-widest">
              Instant Sync
            </h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Real-time track detection and cloud syncing without latency.
            </p>
          </div>
          <div className="p-8 rounded-[2rem] bg-slate-900/40 border border-white/5">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-6">
              <Headphones className="w-5 h-5 text-purple-400" />
            </div>
            <h4 className="text-sm font-black text-white mb-2 italic uppercase tracking-widest">
              Booth Ready
            </h4>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              Headless mode available. Set it once and forget it exists.
            </p>
          </div>
        </div>
      </main>

      <footer className="py-20 px-6 border-t border-slate-900 bg-slate-950 mt-40">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
          <span>Registry &copy; 2026</span>
          <div className="flex gap-12">
            <Link href="/" className="hover:text-white">
              Main Page
            </Link>
            <Link href="/support" className="hover:text-white">
              Support
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
