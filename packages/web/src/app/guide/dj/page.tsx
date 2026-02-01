"use client";

import {
  Download,
  Settings,
  Zap,
  Radio,
  Share2,
  Trophy,
  Activity,
  ChevronRight,
  ArrowRight,
  Monitor,
  CheckCircle2,
  Info,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function DJOnboarding() {
  const [platform, setPlatform] = useState<"mac" | "win" | "other">("other");

  useEffect(() => {
    const userAgent = window.navigator.userAgent.toLowerCase();
    if (userAgent.includes("mac")) {
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
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30 font-sans overflow-x-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 -translate-x-1/2 w-full h-[800px] bg-purple-600/5 blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 translate-x-1/2 w-full h-[800px] bg-indigo-600/5 blur-[120px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808008_1px,transparent_1px),linear-gradient(to_bottom,#80808008_1px,transparent_1px)] bg-[size:64px_64px]" />
      </div>

      <div className="relative max-w-5xl mx-auto px-6 py-16 sm:py-24">
        {/* Header */}
        <header className="mb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] font-black text-purple-400 uppercase tracking-[0.3em] mb-8 animate-fade-in">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            Official DJ Onboarding
          </div>
          <h1 className="text-5xl sm:text-7xl font-black text-white italic uppercase tracking-tighter mb-6 leading-none">
            Welcome to the <span className="text-purple-500">Pulse.</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto font-medium">
            Transform your DJ booth into an interactive experience. Connect with your floor, archive
            your sets, and build your legacy.
          </p>
        </header>

        {/* The Three Steps */}
        <div className="grid gap-12 sm:gap-24 relative">
          {/* Vertical Progress Line */}
          <div className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/50 via-indigo-500/50 to-transparent hidden sm:block" />

          {/* Step 1 */}
          <section className="relative group">
            <div className="sm:flex items-start gap-12 sm:gap-24">
              <div className="sm:w-1/2 mb-8 sm:mb-0 sm:text-right flex flex-col sm:items-end">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-purple-500/20 flex items-center justify-center mb-6 shadow-2xl group-hover:border-purple-500 transition-colors">
                  <Download className="w-6 h-6 text-purple-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 italic uppercase tracking-tight">
                  <span className="text-purple-500">01.</span> Get the Controller
                </h2>
                <p className="text-slate-400 font-medium leading-relaxed mb-6">
                  Pika! runs as a lightweight desktop companion. It listens to your DJ software and
                  broadcasts your history to the cloud instantly.
                </p>
                <Link
                  href="/download"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-white text-slate-950 font-black uppercase text-xs tracking-widest rounded-xl shadow-2xl hover:scale-105 active:scale-95 transition-all"
                >
                  Download for {getPlatformLabel()}
                </Link>
              </div>
              <div className="sm:w-1/2">
                <div className="aspect-video bg-slate-900/50 rounded-3xl border border-white/5 overflow-hidden group-hover:border-white/10 transition-all shadow-2xl relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="p-4 bg-slate-800/20 border-b border-white/5 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500/50" />
                    <div className="w-2 h-2 rounded-full bg-amber-500/50" />
                    <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
                  </div>
                  <div className="p-8 flex items-center justify-center h-full">
                    <div className="text-center space-y-4">
                      <Monitor className="w-16 h-16 text-slate-700 mx-auto" />
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                        P! Controller Ready
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section className="relative group">
            <div className="sm:flex flex-row-reverse items-start gap-12 sm:gap-24">
              <div className="sm:w-1/2 mb-8 sm:mb-0 flex flex-col items-start">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-indigo-500/20 flex items-center justify-center mb-6 shadow-2xl group-hover:border-indigo-500 transition-colors">
                  <Settings className="w-6 h-6 text-indigo-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 italic uppercase tracking-tight">
                  <span className="text-indigo-500">02.</span> Bridge Your Software
                </h2>
                <p className="text-slate-400 font-medium leading-relaxed mb-4">
                  Point Pika! to your local history logs. We support all major platforms:
                </p>
                <div className="flex flex-wrap gap-3 mb-8">
                  {["VirtualDJ", "Serato", "Rekordbox"].map((sw) => (
                    <div
                      key={sw}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 border border-white/5 text-[10px] font-bold text-slate-300 uppercase tracking-widest"
                    >
                      {sw}
                    </div>
                  ))}
                </div>
                <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 flex gap-4">
                  <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-400 leading-relaxed italic">
                    <strong className="text-slate-200">The 30s Rule:</strong> Tracks are only
                    broadcast after being played for 30 seconds to avoid soundchecks appearing in
                    history.
                  </p>
                </div>
              </div>
              <div className="sm:w-1/2">
                <div className="aspect-video bg-slate-900/50 rounded-3xl border border-white/5 overflow-hidden group-hover:border-white/10 transition-all shadow-2xl relative">
                  <div className="absolute inset-0 bg-gradient-to-bl from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="p-8 flex flex-col justify-center h-full space-y-4">
                    <div className="flex items-center gap-4 bg-slate-950/50 p-3 rounded-xl border border-white/5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-white uppercase tracking-widest">
                          VirtualDJ Connected
                        </p>
                        <p className="text-[8px] text-slate-500 font-medium">
                          Listening to history.m3u
                        </p>
                      </div>
                    </div>
                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500 w-2/3 animate-[loading_2s_ease-in-out_infinite]" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section className="relative group">
            <div className="sm:flex items-start gap-12 sm:gap-24">
              <div className="sm:w-1/2 mb-8 sm:mb-0 sm:text-right flex flex-col sm:items-end">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-emerald-500/20 flex items-center justify-center mb-6 shadow-2xl group-hover:border-emerald-500 transition-colors">
                  <Radio className="w-6 h-6 text-emerald-400" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-4 italic uppercase tracking-tight">
                  <span className="text-emerald-500">03.</span> Go Live
                </h2>
                <p className="text-slate-400 font-medium leading-relaxed mb-6">
                  Hit the neon <strong className="text-white">GO LIVE</strong> button and set your
                  stage. Dancers will instantly see your set chronology and can begin syncing with
                  your vibe.
                </p>
                <div className="space-y-3 sm:items-end flex flex-col">
                  <div className="flex items-center gap-3 text-slate-300 text-xs font-medium">
                    <Zap className="w-4 h-4 text-purple-400" /> Real-time Sync (Hearts)
                  </div>
                  <div className="flex items-center gap-3 text-slate-300 text-xs font-medium">
                    <Share2 className="w-4 h-4 text-indigo-400" /> Instant QR Sharing
                  </div>
                  <div className="flex items-center gap-3 text-slate-300 text-xs font-medium">
                    <Trophy className="w-4 h-4 text-amber-400" /> Vibe Momentum
                  </div>
                </div>
              </div>
              <div className="sm:w-1/2">
                <div className="aspect-video bg-slate-900/50 rounded-[2.5rem] border border-white/5 overflow-hidden group-hover:border-emerald-500/20 transition-all shadow-2xl relative flex items-center justify-center">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(16,185,129,0.1),transparent_70%)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="relative group/btn cursor-pointer">
                    <div className="absolute inset-0 bg-emerald-500 blur-2xl opacity-20 group-hover/btn:opacity-40 transition-opacity" />
                    <div className="relative px-12 py-6 bg-slate-950 border-2 border-emerald-500/50 rounded-full text-emerald-500 font-black italic uppercase tracking-widest text-xl group-hover/btn:scale-105 transition-transform shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                      GO LIVE
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Feature Highlights */}
        <div className="mt-40 grid sm:grid-cols-3 gap-8">
          <div className="p-8 bg-slate-900/40 rounded-3xl border border-white/5 hover:border-purple-500/20 transition-all">
            <Activity className="w-8 h-8 text-purple-400 mb-6" />
            <h3 className="text-xl font-bold text-white mb-2 italic uppercase">The Pulse</h3>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">
              Your real-time dashboard of set history, hearts, and floor momentum.
            </p>
          </div>
          <div className="p-8 bg-slate-900/40 rounded-3xl border border-white/5 hover:border-indigo-500/20 transition-all">
            <Trophy className="w-8 h-8 text-indigo-400 mb-6" />
            <h3 className="text-xl font-bold text-white mb-2 italic uppercase">Showcase</h3>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">
              Build your professional archive. Every set is saved and shareable.
            </p>
          </div>
          <div className="p-8 bg-slate-900/40 rounded-3xl border border-white/5 hover:border-amber-500/20 transition-all">
            <Zap className="w-8 h-8 text-amber-400 mb-6" />
            <h3 className="text-xl font-bold text-white mb-2 italic uppercase">Sync</h3>
            <p className="text-sm text-slate-400 font-medium leading-relaxed">
              Direct connection with the floor. Every "Like" is a real-time signal.
            </p>
          </div>
        </div>

        {/* FAQ Section */}
        <section className="mt-40 border-t border-white/5 pt-20">
          <h2 className="text-4xl font-bold text-white text-center mb-16 italic uppercase tracking-tighter">
            PRO DJ <span className="text-slate-500">FAQ</span>
          </h2>
          <div className="grid sm:grid-cols-2 gap-12">
            {[
              {
                q: "What if my internet drops?",
                a: "Pika! has an offline buffer. It will queue your played tracks locally and sync them the moment you reconnect.",
              },
              {
                q: "Can I use it on Windows?",
                a: "Yes. The desktop companion is available for both macOS and Windows workstations.",
              },
              {
                q: "Does it affect performance?",
                a: "No. The app uses a high-performance Rust core that consumes < 0.2% CPU and minimal RAM.",
              },
              {
                q: "Who can see my sets?",
                a: "Once live, your session is public in the Pika! Lobby. After the set, you can choose to hide or showcase it.",
              },
            ].map((faq, i) => (
              <div key={i} className="space-y-3">
                <h4 className="text-white font-bold flex items-center gap-3">
                  <ChevronRight className="w-4 h-4 text-purple-500" />
                  {faq.q}
                </h4>
                <p className="text-slate-400 text-sm leading-relaxed pl-7">{faq.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-40 text-center">
          <div className="p-16 rounded-[4rem] bg-gradient-to-br from-purple-500/10 via-slate-900 to-indigo-500/10 border border-white/5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-grid-white opacity-5 [mask-image:radial-gradient(ellipse_at_center,white,transparent)]" />
            <h2 className="text-4xl sm:text-6xl font-black text-white italic uppercase tracking-tighter mb-8 relative">
              Ready to <span className="text-purple-500">Go Live?</span>
            </h2>
            <Link
              href="/download"
              className="inline-flex items-center gap-3 px-12 py-5 bg-white text-slate-950 font-black uppercase text-sm tracking-widest rounded-2xl shadow-2xl hover:scale-105 active:scale-95 transition-all relative"
            >
              Get Started Now
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-40 text-center opacity-40">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.5em]">
            Pika! Platform • Technical Integrity • v1.0
          </p>
        </footer>
      </div>
    </div>
  );
}
