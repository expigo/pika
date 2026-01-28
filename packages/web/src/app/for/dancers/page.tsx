"use client";

import {
  Activity,
  ArrowLeft,
  Globe,
  Heart,
  Music,
  QrCode,
  Radio,
  ShieldCheck,
  Smartphone,
  Users,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";

export default function ForDancers() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 sm:p-6 md:p-12 relative overflow-hidden">
      {/* Background Atmosphere */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[1200px] h-[800px] bg-pink-600/5 rounded-full blur-[120px] animate-[pulse_8s_ease-in-out_infinite]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10 pt-8 sm:pt-0">
        <div className="mb-12">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-all text-[9px] font-bold uppercase tracking-[0.3em] active:scale-95 group"
          >
            <ArrowLeft className="w-3 h-3 group-hover:-translate-x-1 transition-transform" />
            Go Home
          </Link>
        </div>

        <div className="text-center mb-16 sm:mb-20">
          <div className="flex justify-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900 border border-white/10 shadow-2xl backdrop-blur-3xl relative z-10 group/node">
              <div className="w-1 h-1 rounded-full bg-pink-500 animate-pulse" />
              <h2 className="text-[10px] font-bold text-slate-500 group-hover:text-slate-300 transition-colors uppercase tracking-[0.4em] pr-2">
                Join the Dancefloor
              </h2>
            </div>
          </div>

          <div className="inline-flex items-center justify-center p-8 bg-pink-500/5 rounded-[2.5rem] mb-12 border border-pink-500/10 shadow-2xl relative group">
            <Smartphone className="w-12 h-12 text-pink-400 group-hover:scale-110 transition-transform duration-700" />
            <div className="absolute inset-0 bg-pink-500/10 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
          </div>
          <h1 className="text-5xl sm:text-6xl md:text-8xl font-bold text-white mb-8 tracking-tighter leading-[0.8] text-balance">
            The Connected <br />
            <span className="text-pink-400 italic uppercase font-black">Floor</span>
          </h1>
          <p className="text-sm sm:text-lg md:text-xl text-slate-400/80 leading-relaxed max-w-xl mx-auto font-medium text-balance mb-16">
            Identify tracks instantly, influence the room's vibe, and build your personal history —{" "}
            <span className="text-slate-200">across any device.</span>
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-24 sm:mb-32">
          <ProCard
            className="h-full p-6 sm:p-10 flex flex-col items-center text-center transition-all bg-slate-900/60 rounded-[2.5rem] border-white/5 shadow-2xl"
            glow
          >
            <Zap className="w-5 h-5 text-purple-400 mb-4" />
            <h3 className="text-[10px] sm:text-xs font-bold text-white mb-2 uppercase tracking-widest whitespace-nowrap">
              Zero Wait
            </h3>
            <p className="hidden sm:block text-[11px] text-slate-500 font-medium leading-relaxed">
              Watch the booth with &lt; 1s load times.
            </p>
          </ProCard>

          <ProCard
            className="h-full p-6 sm:p-10 flex flex-col items-center text-center transition-all bg-slate-900/60 rounded-[2.5rem] border-white/5 shadow-2xl"
            glow
          >
            <Music className="w-5 h-5 text-indigo-400 mb-4" />
            <h3 className="text-[10px] sm:text-xs font-bold text-white mb-2 uppercase tracking-widest whitespace-nowrap">
              Sync Booth
            </h3>
            <p className="hidden sm:block text-[11px] text-slate-500 font-medium leading-relaxed">
              High-fidelity track metadata in real-time.
            </p>
          </ProCard>

          <ProCard
            className="h-full p-6 sm:p-10 flex flex-col items-center text-center transition-all bg-slate-900/60 rounded-[2.5rem] border-white/5 shadow-2xl"
            glow
          >
            <Heart className="w-5 h-5 text-pink-500 mb-4" />
            <h3 className="text-[10px] sm:text-xs font-bold text-white mb-2 uppercase tracking-widest whitespace-nowrap">
              Archive
            </h3>
            <p className="hidden sm:block text-[11px] text-slate-500 font-medium leading-relaxed">
              Build a history of every song you danced to.
            </p>
          </ProCard>

          <ProCard
            className="h-full p-6 sm:p-10 flex flex-col items-center text-center transition-all bg-slate-900/60 rounded-[2.5rem] border-white/5 shadow-2xl"
            glow
          >
            <Activity className="w-5 h-5 text-slate-400 mb-4" />
            <h3 className="text-[10px] sm:text-xs font-bold text-white mb-2 uppercase tracking-widest whitespace-nowrap">
              Govern
            </h3>
            <p className="hidden sm:block text-[11px] text-slate-500 font-medium leading-relaxed">
              Influence the room's energy and tempo.
            </p>
          </ProCard>
        </div>

        {/* The Interaction Protocol Section */}
        <div className="mb-32 relative">
          {/* Vertical Connection Spine */}
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-b from-transparent via-pink-500/10 to-transparent -z-10 hidden md:block" />

          <div className="flex justify-center mb-16 sm:mb-24 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900 border border-white/10 shadow-2xl backdrop-blur-3xl relative z-10 group/node">
              <div className="w-1.5 h-1.5 rounded-full bg-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.5)] animate-pulse" />
              <h2 className="text-[10px] font-bold text-slate-400 group-hover:text-slate-200 transition-colors uppercase tracking-[0.4em]">
                THE CONNECTION
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 lg:gap-24">
            {/* Discovery Node */}
            <div className="flex flex-col items-center group">
              <div className="relative w-full aspect-[9/19] max-w-[280px]">
                {/* Hardware Shell */}
                <div className="absolute inset-0 bg-slate-800 rounded-[3rem] p-1.5 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] transition-all duration-700 group-hover:-translate-y-4 group-hover:shadow-blue-500/10 group-hover:border-blue-500/20">
                  <div className="w-full h-full rounded-[2.4rem] overflow-hidden bg-slate-950 relative">
                    <Image
                      src="/screenshots/dancer/live-id.png"
                      alt="Dancer Mobile Interface showing the live Now Playing screen with heart pulse animation and BPM sync."
                      fill
                      priority
                      className="object-contain object-top transition-transform duration-1000 group-hover:scale-105"
                    />
                    {/* Glass Sweep Animation */}
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1500 ease-in-out" />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.4rem] pointer-events-none" />
                  </div>
                </div>
                {/* Decorative Elements */}
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-500/5 blur-3xl rounded-full -z-10 group-hover:bg-blue-500/10 transition-colors" />
              </div>
              <div className="text-center px-4 mt-12">
                <div className="inline-flex items-center gap-2 mb-4">
                  <div className="w-1 h-1 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
                  <span className="text-[10px] font-black italic text-blue-400 uppercase tracking-widest">
                    Discovery Node
                  </span>
                </div>
                <h4 className="text-2xl font-black italic uppercase text-white tracking-tighter mb-4">
                  Booth Sync
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  Watch high-fidelity track identification and artist metadata update in real-time
                  directly from the booth.
                </p>
              </div>
            </div>

            {/* History Node */}
            <div className="flex flex-col items-center group">
              <div className="relative w-full aspect-[9/19] max-w-[280px]">
                {/* Hardware Shell */}
                <div className="absolute inset-0 bg-slate-800 rounded-[3rem] p-1.5 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] transition-all duration-700 md:translate-y-8 group-hover:translate-y-4 group-hover:shadow-pink-500/10 group-hover:border-pink-500/20">
                  <div className="w-full h-full rounded-[2.4rem] overflow-hidden bg-slate-950 relative">
                    <Image
                      src="/screenshots/dancer/my-likes.png"
                      alt="The Pika! Personal Journal showing a history of liked tracks grouped by session and date."
                      fill
                      className="object-contain object-top transition-transform duration-1000 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1500 ease-in-out" />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.4rem] pointer-events-none" />
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-pink-500/5 blur-3xl rounded-full -z-10 group-hover:bg-pink-500/10 transition-colors" />
              </div>
              <div className="text-center px-4 mt-12 md:mt-20">
                <div className="inline-flex items-center gap-2 mb-4">
                  <div className="w-1 h-1 rounded-full bg-pink-500 shadow-[0_0_8px_rgba(236,72,153,0.6)]" />
                  <span className="text-[10px] font-black italic text-pink-400 uppercase tracking-widest">
                    History Node
                  </span>
                </div>
                <h4 className="text-2xl font-black italic uppercase text-white tracking-tighter mb-4">
                  Personal Recap
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  Build your personal dance history. Every track you loved is archived locally on
                  your device for later review.
                </p>
              </div>
            </div>

            {/* Governance Node */}
            <div className="flex flex-col items-center group">
              <div className="relative w-full aspect-[9/19] max-w-[280px]">
                {/* Hardware Shell */}
                <div className="absolute inset-0 bg-slate-800 rounded-[3rem] p-1.5 border border-white/10 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] transition-all duration-700 group-hover:-translate-y-4 group-hover:shadow-purple-500/10 group-hover:border-purple-500/20">
                  <div className="w-full h-full rounded-[2.4rem] overflow-hidden bg-slate-950 relative">
                    <Image
                      src="/screenshots/dancer/vibe-vote.png"
                      alt="Live Floor Governance screen where dancers can anonymously vote on current track energy and tempo."
                      fill
                      className="object-contain object-top transition-transform duration-1000 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1500 ease-in-out" />
                    <div className="absolute inset-0 ring-1 ring-inset ring-white/10 rounded-[2.4rem] pointer-events-none" />
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-purple-500/5 blur-3xl rounded-full -z-10 group-hover:bg-purple-500/10 transition-colors" />
              </div>
              <div className="text-center px-4 mt-12">
                <div className="inline-flex items-center gap-2 mb-4">
                  <div className="w-1 h-1 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                  <span className="text-[10px] font-black italic text-purple-400 uppercase tracking-widest">
                    Governance Node
                  </span>
                </div>
                <h4 className="text-2xl font-black italic uppercase text-white tracking-tighter mb-4">
                  Vibe Influence
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  Participate in the floor's governance. Cast anonymous votes on energy and tempo to
                  influence the room.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Interaction Onboarding */}
        <div className="mb-32">
          <div className="flex justify-center mb-16 sm:mb-24 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900 border border-white/10 shadow-2xl backdrop-blur-3xl relative z-10 group/node">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500 group-hover:bg-purple-500 transition-colors" />
              <h2 className="text-[10px] font-bold text-slate-500 group-hover:text-slate-200 transition-colors uppercase tracking-[0.4em] flex items-center gap-3">
                <span className="opacity-20">•</span> ACCEPT THE DANCE INVITATION{" "}
                <span className="opacity-20">•</span>
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <ProCard
              glow
              className="p-10 group cursor-default bg-slate-900/20 border-white/5 rounded-[2.5rem]"
            >
              <div className="flex flex-col sm:flex-row items-center gap-10">
                <div className="w-24 h-24 rounded-[2rem] bg-slate-950/50 flex items-center justify-center border border-white/5 shadow-2xl group-hover:border-white/10 transition-all duration-500">
                  <Globe className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full text-[9px] font-black text-emerald-500/80 uppercase tracking-[0.2em] mb-4">
                    Global Access
                  </div>
                  <h3 className="text-3xl font-bold text-white tracking-tight mb-3">
                    Direct Entry
                  </h3>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xl">
                    Visit <span className="text-slate-300">pika.stream</span> on any mobile browser.
                    If a session is active, a join banner will automatically appear at the top of
                    your screen.
                  </p>
                </div>
              </div>
            </ProCard>

            <ProCard
              glow
              className="p-10 group cursor-default bg-slate-900/20 border-white/5 rounded-[2.5rem]"
            >
              <div className="flex flex-col sm:flex-row items-center gap-10">
                <div className="w-24 h-24 rounded-[2rem] bg-slate-950/50 flex items-center justify-center border border-white/5 shadow-2xl group-hover:border-white/10 transition-all duration-500">
                  <QrCode className="w-8 h-8 text-white" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-pink-500/10 rounded-full text-[9px] font-black text-pink-500/80 uppercase tracking-[0.2em] mb-4">
                    Proximity Access
                  </div>
                  <h3 className="text-3xl font-bold text-white tracking-tight mb-3">Venue Scan</h3>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xl">
                    Look for the Pika! QR code at the registration desk or DJ booth. Scan with your
                    native camera to join the room instantly.
                  </p>
                </div>
              </div>
            </ProCard>

            <ProCard
              glow
              className="p-10 group cursor-default bg-slate-900/20 border-white/5 rounded-[2.5rem]"
            >
              <div className="flex flex-col sm:flex-row items-center gap-10">
                <div className="w-24 h-24 rounded-[2rem] bg-slate-950/50 flex items-center justify-center border border-white/5 shadow-2xl group-hover:border-white/10 transition-all duration-500">
                  <Heart className="w-8 h-8 text-pink-500" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 rounded-full text-[9px] font-black text-purple-400 uppercase tracking-[0.2em] mb-4">
                    Notification Node (Optional)
                  </div>
                  <h3 className="text-3xl font-bold text-white tracking-tight mb-3">
                    Add to Home Screen
                  </h3>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xl">
                    Install Pika! as a PWA to enable push notifications for special event
                    announcements and build a persistent track history.
                  </p>
                </div>
              </div>
            </ProCard>

            <ProCard
              glow
              className="p-10 group cursor-default bg-slate-900/20 border-white/5 rounded-[2.5rem]"
            >
              <div className="flex flex-col sm:flex-row items-center gap-10">
                <div className="w-24 h-24 rounded-[2rem] bg-slate-950/50 flex items-center justify-center border border-white/5 shadow-2xl group-hover:border-white/10 transition-all duration-500">
                  <Users className="w-8 h-8 text-blue-400" />
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/10 rounded-full text-[9px] font-black text-blue-400 uppercase tracking-[0.2em] mb-4">
                    Social Join
                  </div>
                  <h3 className="text-3xl font-bold text-white tracking-tight mb-3">
                    Peer-to-Peer Sync
                  </h3>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-xl">
                    Already dancing with a friend? Skip the booth QR and scan your partner's session
                    code to join the room instantly.
                  </p>
                </div>
              </div>
            </ProCard>
          </div>
        </div>

        {/* Registry Compliance Audit */}
        <div className="mb-32">
          <div className="flex justify-center mb-16 sm:mb-24 relative">
            <div className="absolute top-1/2 left-0 w-full h-px bg-white/5 -z-10" />
            <div className="inline-flex items-center gap-3 px-6 py-2 rounded-full bg-slate-900 border border-white/10 shadow-2xl backdrop-blur-3xl relative z-10 group/node">
              <div className="w-1.5 h-1.5 rounded-full bg-slate-500 group-hover:bg-blue-400 transition-colors" />
              <h2 className="text-[10px] font-bold text-slate-500 group-hover:text-slate-200 transition-colors uppercase tracking-[0.4em] flex items-center gap-3">
                <span className="opacity-20">•</span> PROTECT THE VIBE{" "}
                <span className="opacity-20">•</span>
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5 border border-white/5 rounded-[2rem] overflow-hidden shadow-2xl">
            <div className="flex flex-col items-center text-center p-12 bg-slate-950/40 group">
              <ShieldCheck className="w-8 h-8 text-slate-500 mb-8 group-hover:text-white transition-colors" />
              <h4 className="text-[11px] font-black italic uppercase text-white tracking-[0.2em] mb-6">
                Privacy Pillar
              </h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[200px]">
                Votes are anonymous. Likes are local. We dont track profiles, just floor energy.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-12 bg-slate-950/40 border-y md:border-y-0 md:border-x border-white/5 group">
              <Smartphone className="w-8 h-8 text-slate-500 mb-8 group-hover:text-white transition-colors" />
              <h4 className="text-[11px] font-black italic uppercase text-white tracking-[0.2em] mb-6">
                Universal Spec
              </h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[200px]">
                Optimized for Safari on iOS 15+ and Chrome on Android 12+. Full PWA support.
              </p>
            </div>
            <div className="flex flex-col items-center text-center p-12 bg-slate-950/40 group">
              <Zap className="w-8 h-8 text-slate-500 mb-8 group-hover:text-white transition-colors" />
              <h4 className="text-[11px] font-black italic uppercase text-white tracking-[0.2em] mb-6">
                Zero Friction
              </h4>
              <p className="text-[11px] text-slate-500 font-medium leading-relaxed max-w-[200px]">
                V8-optimized engine. Minimal battery consumption even during an entire night of
                dancing.
              </p>
            </div>
          </div>
        </div>

        {/* Final Action Node */}
        <div className="mb-48 text-center">
          <h2 className="text-6xl sm:text-9xl font-black italic uppercase text-white tracking-tighter leading-[0.8] mb-16">
            OWN THE <br /> <span className="text-pink-500">JOURNEY.</span>
          </h2>
          <Link
            href="/"
            className="inline-flex items-center px-14 py-6 bg-white text-slate-950 font-bold uppercase text-[12px] tracking-[0.3em] hover:bg-pink-500 hover:text-white transition-all active:scale-[0.98] rounded-none shadow-2xl"
          >
            Join the Floor
          </Link>
        </div>

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
    </div>
  );
}
