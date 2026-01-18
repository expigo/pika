"use client";

import {
  ArrowLeft,
  Download,
  MoreVertical,
  PlusSquare,
  Share,
  ShieldCheck,
  Smartphone,
  Wifi,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";

export default function WebAppGuide() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-6 md:p-12 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[800px] h-[800px] bg-pink-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <div className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50 active:scale-95"
          >
            <ArrowLeft className="w-4 h-4" />
            Return Home
          </Link>
        </div>

        <div className="text-center mb-24">
          <div className="inline-flex items-center justify-center p-6 bg-pink-500/10 rounded-3xl mb-10 border border-pink-500/20 shadow-2xl shadow-pink-500/10">
            <Smartphone className="w-12 h-12 text-pink-400" />
          </div>
          <h1 className="text-5xl md:text-7xl font-black text-white mb-8 italic uppercase tracking-tighter leading-tight">
            PIKA! IS A <br />
            <span className="bg-gradient-to-r from-pink-400 to-purple-400 text-transparent bg-clip-text pr-4">
              WEB APP
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto font-medium">
            No App Store delays. No massive downloads. Just a{" "}
            <span className="text-white">premium, high-performance</span> experience that lives
            right on your home screen.
          </p>
        </div>

        {/* Why PWA? Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-32">
          <ProCard className="p-8 flex flex-col items-start" glow>
            <Zap className="w-8 h-8 text-yellow-500 mb-6" />
            <h3 className="text-xl font-black text-white mb-3 italic uppercase tracking-tight">
              Zero MB
            </h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Installs instantly. Doesn't take up space like bloated legacy apps.
            </p>
          </ProCard>
          <ProCard className="p-8 flex flex-col items-start" glow>
            <ShieldCheck className="w-8 h-8 text-emerald-500 mb-6" />
            <h3 className="text-xl font-black text-white mb-3 italic uppercase tracking-tight">
              Persistence
            </h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Stay connected. Your favorites and history are always one tap away.
            </p>
          </ProCard>
          <ProCard className="p-8 flex flex-col items-start" glow>
            <Wifi className="w-8 h-8 text-blue-500 mb-6" />
            <h3 className="text-xl font-black text-white mb-3 italic uppercase tracking-tight">
              Atmospheric
            </h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Hides the browser UI for a seamless, immersive "Native" dance log.
            </p>
          </ProCard>
        </div>

        <div className="text-center mb-16 relative">
          <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
          <h2 className="inline-block px-6 bg-slate-950 text-3xl font-black text-white italic uppercase tracking-widest relative z-10">
            Installation Guide
          </h2>
        </div>

        {/* Installation Instructions */}
        <div className="space-y-8 mb-32">
          {/* iOS */}
          <ProCard className="p-10 sm:p-14 overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Smartphone className="w-48 h-48 text-white" />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-12">
                <span className="w-12 h-12 rounded-2xl bg-white text-slate-950 flex items-center justify-center font-black italic text-xl shadow-xl">
                  01
                </span>
                <h2 className="text-3xl font-black text-white italic uppercase tracking-tight">
                  iPhone (Safari)
                </h2>
              </div>

              <div className="space-y-10">
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xl">
                    <Share className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-black italic uppercase tracking-wide mb-1">
                      Tap Share
                    </h4>
                    <p className="text-slate-500 text-sm font-medium">
                      Located at the bottom of the Safari screen.
                    </p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xl">
                    <PlusSquare className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-white font-black italic uppercase tracking-wide mb-1">
                      Add to Home Screen
                    </h4>
                    <p className="text-slate-500 text-sm font-medium">
                      Scroll down the menu to find the plus icon.
                    </p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xl">
                    <Zap className="w-6 h-6 text-pink-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-black italic uppercase tracking-wide mb-1">
                      Confirm Add
                    </h4>
                    <p className="text-slate-400 text-sm font-medium">
                      Pika! is now ready on your home screen.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ProCard>

          {/* Android */}
          <ProCard className="p-10 sm:p-14 overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
              <Smartphone className="w-48 h-48 text-emerald-400" />
            </div>

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-12">
                <span className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center font-black italic text-xl shadow-xl shadow-emerald-500/20">
                  02
                </span>
                <h2 className="text-3xl font-black text-white italic uppercase tracking-tight">
                  Android (Chrome)
                </h2>
              </div>

              <div className="space-y-10">
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xl">
                    <MoreVertical className="w-6 h-6 text-slate-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-black italic uppercase tracking-wide mb-1">
                      Tap Menu
                    </h4>
                    <p className="text-slate-500 text-sm font-medium">
                      The three dots in the top right corner.
                    </p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xl">
                    <Download className="w-6 h-6 text-emerald-400" />
                  </div>
                  <div>
                    <h4 className="text-white font-black italic uppercase tracking-wide mb-1">
                      Install App
                    </h4>
                    <p className="text-slate-500 text-sm font-medium">
                      Look for "Install App" or "Add to Home Screen".
                    </p>
                  </div>
                </div>
                <div className="flex gap-6">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center shrink-0 border border-slate-800 shadow-2xl">
                    <Zap className="w-6 h-6 text-emerald-500" />
                  </div>
                  <div>
                    <h4 className="text-white font-black italic uppercase tracking-wide mb-1">
                      Launch
                    </h4>
                    <p className="text-slate-400 text-sm font-medium">
                      Access Pika! instantly from your app drawer.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </ProCard>
        </div>

        {/* Bottom CTA */}
        <div className="text-center">
          <p className="text-slate-500 mb-10 font-black uppercase text-[10px] tracking-[0.4em]">
            Ready to see who's playing?
          </p>
          <Link
            href="/live"
            className="inline-flex items-center gap-3 px-10 py-5 bg-white text-slate-950 font-black rounded-2xl hover:bg-slate-100 active:scale-95 transition-all shadow-2xl shadow-white/5 uppercase text-xs tracking-[0.2em]"
          >
            <Zap className="w-4 h-4" />
            Tune In Now
          </Link>
        </div>
      </div>

      <footer className="mt-40 py-16 border-t border-slate-900 text-center">
        <p className="text-[10px] text-slate-600 font-black tracking-[0.3em] uppercase">
          Pika! Platform • v0.1.9
        </p>
      </footer>
    </div>
  );
}
