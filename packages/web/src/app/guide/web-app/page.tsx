"use client";

import {
  Activity,
  ArrowLeft,
  ChevronRight,
  Download,
  Heart,
  Music,
  QrCode,
  ShieldCheck,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { ProCard } from "@/components/ui/ProCard";

export default function WebAppGuide() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 sm:p-6 md:p-12 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 -translate-x-1/2 w-[800px] h-[800px] bg-pink-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10 pt-8 sm:pt-0">
        <div className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-3 px-5 py-2.5 bg-slate-900/50 hover:bg-slate-900 rounded-xl text-slate-500 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest border border-slate-800/50 active:scale-95 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Return Home
          </Link>
        </div>

        <div className="text-center mb-16 sm:mb-20">
          <div className="inline-flex items-center justify-center p-6 bg-pink-500/10 rounded-3xl mb-8 sm:mb-10 border border-pink-500/20 shadow-2xl shadow-pink-500/10 relative group">
            <Smartphone className="w-10 h-10 sm:w-12 h-12 text-pink-400 group-hover:scale-110 transition-transform duration-500" />
            <div className="absolute inset-0 bg-pink-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-white mb-6 sm:mb-8 italic uppercase tracking-tighter leading-[1.1] text-balance">
            THE CONNECTED <br />
            <span className="bg-gradient-to-r from-pink-400 to-purple-400 text-transparent bg-clip-text pr-2 sm:pr-4">
              DANCEFLOOR
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-slate-400 leading-relaxed max-w-2xl mx-auto font-medium text-balance">
            Identify tracks instantly, influence the room's vibe, and build your personal history —{" "}
            <span className="text-white">across any device, with zero friction.</span>
          </p>
        </div>

        {/* The Advantage Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-24 sm:mb-32">
          <ProCard
            className="p-6 flex flex-col items-start transition-all hover:-translate-y-1 active:scale-95 sm:active:scale-100"
            glow
          >
            <Zap className="w-6 h-6 text-yellow-500 mb-4" />
            <h3 className="text-sm font-black text-white mb-2 italic uppercase tracking-tight">
              Instant
            </h3>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Scan & See. Watch the booth in &lt; 1s with absolutely zero load times.
            </p>
          </ProCard>
          <ProCard
            className="p-6 flex flex-col items-start transition-all hover:-translate-y-1 active:scale-95 sm:active:scale-100"
            glow
          >
            <Music className="w-6 h-6 text-blue-400 mb-4" />
            <h3 className="text-sm font-black text-white mb-2 italic uppercase tracking-tight">
              Live ID
            </h3>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              See high-fidelity track metadata synced directly from the DJ's desk.
            </p>
          </ProCard>
          <ProCard
            className="p-6 flex flex-col items-start transition-all hover:-translate-y-1 active:scale-95 sm:active:scale-100"
            glow
          >
            <Heart className="w-6 h-6 text-pink-500 mb-4" />
            <h3 className="text-sm font-black text-white mb-2 italic uppercase tracking-tight">
              Crate Dig
            </h3>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
              Like tracks you love and build a history of every song you danced to.
            </p>
          </ProCard>
          <ProCard
            className="p-6 flex flex-col items-start transition-all hover:-translate-y-1 active:scale-95 sm:active:scale-100"
            glow
          >
            <Activity className="w-6 h-6 text-emerald-500 mb-4" />
            <h4 className="text-sm font-black text-white mb-2 italic uppercase tracking-tight">
              Vibe Vote
            </h4>
            <p className="text-[11px] text-slate-500 font-medium leading-relaxed font-sans">
              Cast anonymous votes on energy and tempo to influence the room's direction.
            </p>
          </ProCard>
        </div>

        {/* The Interaction Setup Section */}
        <div className="mb-32">
          <div className="text-center mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <h2 className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.5em] relative z-10">
              The Interaction
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
            {/* Step 01 */}
            <div className="flex flex-col items-center group">
              <div className="w-full aspect-[9/19] max-w-[280px] bg-[#0c0e14] rounded-[3rem] border-4 border-slate-900 p-2 relative shadow-2xl transition-all duration-700 group-hover:-translate-y-3 group-hover:border-blue-500/20 group-hover:shadow-blue-500/10">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-4 bg-slate-900 rounded-full z-20" />
                <div className="w-full h-full rounded-[2.2rem] overflow-hidden relative bg-slate-950 px-4">
                  <Image
                    src="/screenshots/dancer/live-id.png"
                    alt="Pika! Live Interface"
                    fill
                    priority
                    className="object-contain object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.2rem] pointer-events-none" />
                </div>
              </div>
              <div className="text-center px-4 mt-8">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-2 block">
                  Step 01
                </span>
                <h4 className="text-lg font-black text-white italic uppercase tracking-tight mb-3">
                  Watch the Desk
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  Watch high-fidelity track identification and artist metadata update in real-time
                  directly from the booth.
                </p>
              </div>
            </div>

            {/* Step 02 */}
            <div className="flex flex-col items-center group">
              <div className="w-full aspect-[9/19] max-w-[280px] bg-[#0c0e14] rounded-[3rem] border-4 border-slate-900 p-2 relative shadow-2xl transition-all duration-700 group-hover:-translate-y-3 group-hover:border-pink-500/20 group-hover:shadow-pink-500/10">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-4 bg-slate-900 rounded-full z-20" />
                <div className="w-full h-full rounded-[2.2rem] overflow-hidden relative bg-slate-950 px-4">
                  <Image
                    src="/screenshots/dancer/my-likes.png"
                    alt="Pika! Journal"
                    fill
                    className="object-contain object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.2rem] pointer-events-none" />
                </div>
              </div>
              <div className="text-center px-4 mt-8">
                <span className="text-[10px] font-black text-pink-400 uppercase tracking-widest mb-2 block">
                  Step 02
                </span>
                <h4 className="text-lg font-black text-white italic uppercase tracking-tight mb-3">
                  Crate Dig
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">
                  Build your personal dance history. Every track you loved is archived locally on
                  your device for later review.
                </p>
              </div>
            </div>

            {/* Step 03 */}
            <div className="flex flex-col items-center group">
              <div className="w-full aspect-[9/19] max-w-[280px] bg-[#0c0e14] rounded-[3rem] border-4 border-slate-900 p-2 relative shadow-2xl transition-all duration-700 group-hover:-translate-y-3 group-hover:border-purple-500/20 group-hover:shadow-purple-500/10">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 w-16 h-4 bg-slate-900 rounded-full z-20" />
                <div className="w-full h-full rounded-[2.2rem] overflow-hidden relative bg-slate-950 px-4">
                  <Image
                    src="/screenshots/dancer/vibe-vote.png"
                    alt="Pika! Governance"
                    fill
                    className="object-contain object-top transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.2rem] pointer-events-none" />
                </div>
              </div>
              <div className="text-center px-4 mt-8">
                <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-2 block">
                  Step 03
                </span>
                <h4 className="text-lg font-black text-white italic uppercase tracking-tight mb-3">
                  Live Vibe
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed font-medium font-sans">
                  Participate in the floor's governance. Cast anonymous votes on energy and tempo to
                  influence the room.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Installation Protocol */}
        <div className="mb-32">
          <div className="text-center mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <h2 className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.5em] relative z-10">
              Installation Protocol
            </h2>
          </div>

          <div className="space-y-4">
            <ProCard glow className="p-8 group cursor-default">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center border border-white/5 shadow-inner group-hover:scale-110 transition-transform">
                  <QrCode className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="inline-block px-3 py-1 bg-pink-500/10 rounded-full text-[9px] font-black text-pink-400 uppercase tracking-widest mb-3">
                    Proximity Access
                  </div>
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tight mb-2">
                    Venue Scan
                  </h3>
                  <p className="text-sm text-slate-400 font-medium">
                    Look for the Pika! QR code at the registration desk or DJ booth. Scan with your
                    native camera to join the session.
                  </p>
                </div>
              </div>
            </ProCard>

            <ProCard glow className="p-8 group cursor-default">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center border border-white/5 shadow-inner group-hover:scale-110 transition-transform">
                  <Heart className="w-8 h-8 text-pink-500" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="inline-block px-3 py-1 bg-purple-500/10 rounded-full text-[9px] font-black text-purple-400 uppercase tracking-widest mb-3">
                    Library Persistence
                  </div>
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tight mb-2 font-[inherit]">
                    Add to Home Screen
                  </h3>
                  <p className="text-sm text-slate-400 font-medium font-[inherit]">
                    Pika! is a PWA. When prompted, select "Add to Home Screen" to install it as a
                    native-like app on your device. No App Store required.
                  </p>
                </div>
              </div>
            </ProCard>

            <ProCard glow className="p-8 group cursor-default">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 flex items-center justify-center border border-white/5 shadow-inner group-hover:scale-110 transition-transform">
                  <Users className="w-8 h-8 text-blue-400" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="inline-block px-3 py-1 bg-blue-500/10 rounded-full text-[9px] font-black text-blue-400 uppercase tracking-widest mb-3">
                    Social Join
                  </div>
                  <h3 className="text-xl font-black text-white italic uppercase tracking-tight mb-2 font-[inherit]">
                    Peer-to-Peer Sync
                  </h3>
                  <p className="text-sm text-slate-400 font-medium font-[inherit]">
                    Already dancing with a friend? Skip the booth QR and scan your partner's session
                    code to join the room instantly.
                  </p>
                </div>
              </div>
            </ProCard>
          </div>
        </div>

        {/* Technical Registry */}
        <div className="mb-32">
          <div className="text-center mb-16 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-slate-800/50 -z-10" />
            <h2 className="inline-block px-8 bg-slate-950 text-[10px] font-black text-slate-500 italic uppercase tracking-[0.5em] relative z-10">
              Technical Safety
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center p-6 bg-slate-900/40 rounded-3xl border border-white/5">
              <ShieldCheck className="w-8 h-8 text-emerald-500 mb-4" />
              <h4 className="text-sm font-black text-white italic uppercase tracking-tight mb-2">
                Privacy First
              </h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Votes are anonymous. Likes are local. We don't track your identity, just your
                passion.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-slate-900/40 rounded-3xl border border-white/5">
              <Smartphone className="w-8 h-8 text-blue-400 mb-4" />
              <h4 className="text-sm font-black text-white italic uppercase tracking-tight mb-2">
                Universal interop
              </h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Compatible with all modern browsers (iOS 15+, Android 12+).
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-6 bg-slate-900/40 rounded-3xl border border-white/5">
              <Zap className="w-8 h-8 text-amber-500 mb-4" />
              <h4 className="text-sm font-black text-white italic uppercase tracking-tight mb-2">
                Zero Overhead
              </h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                Built with modern web standards for minimal battery impact during your set.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="py-20 border-t border-slate-900 text-center opacity-40">
          <p className="text-[10px] font-black uppercase tracking-[0.6em] text-slate-500">
            Pika! Platform • Dancer Registry • v0.3.0
          </p>
          <div className="flex justify-center gap-6 mt-6">
            <Link
              href="/for/djs"
              className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-2"
            >
              For DJs <ChevronRight className="w-3 h-3" />
            </Link>
            <Link
              href="/download"
              className="text-[9px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-2 p-2"
            >
              Get the Sidecar <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
