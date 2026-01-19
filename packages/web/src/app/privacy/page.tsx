"use client";

import { Shield, ArrowLeft, Lock, Database, EyeOff, Mail } from "lucide-react";
import Link from "next/link";

export default function PrivacyPage() {
  const sections = [
    {
      title: "Data Sovereignty",
      icon: <Lock className="w-5 h-5" />,
      content:
        "We believe your track history belongs to you. Pika! acts as a conduit, not a data broker. We do not sell your playlist data to third-party advertisers or record labels.",
    },
    {
      title: "Booth Collection",
      icon: <Database className="w-5 h-5" />,
      content:
        "When using the Sidecar, we only collect track metadata (Artist, Title, BPM) necessary to fuel the live floor experience. We do not access your local audio files or recording streams.",
    },
    {
      title: "Dancer Privacy",
      icon: <EyeOff className="w-5 h-5" />,
      content:
        "Voting and engagement on the floor are anonymous by default. We track 'vibes' and 'tempo votes' to aggregate community sentiment without attaching it to your specific identity.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-400 font-sans selection:bg-purple-500/30">
      <nav className="p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Floor
        </Link>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="inline-flex items-center gap-3 px-5 py-2 bg-emerald-500/10 rounded-full text-emerald-400 text-[10px] font-black uppercase tracking-[0.4em] mb-12 border border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
          <Shield className="w-4 h-4" />
          Privacy Protocol
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-white mb-10 italic uppercase tracking-tighter leading-none">
          SECURE BY <br />
          <span className="text-slate-700">DESIGN.</span>
        </h1>

        <p className="text-lg text-slate-400 mb-20 font-medium leading-relaxed tracking-tight">
          Last Updated: January 20, 2026. <br />
          At Pika!, we build tools for performers, not for surveillance. Our privacy stack is
          designed to be as invisible as our technology.
        </p>

        <div className="space-y-16">
          {sections.map((section, idx) => (
            <div key={idx} className="group transition-all">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-emerald-400 group-hover:border-emerald-500/40 transition-all">
                  {section.icon}
                </div>
                <h2 className="text-xl font-black text-white italic uppercase tracking-widest">
                  {section.title}
                </h2>
              </div>
              <p className="text-slate-500 leading-relaxed font-medium pl-14">{section.content}</p>
            </div>
          ))}
        </div>

        <div className="mt-32 pt-20 border-t border-slate-900">
          <div className="p-8 rounded-[2rem] bg-slate-900/40 border border-white/5 text-center">
            <Mail className="w-10 h-10 text-slate-700 mx-auto mb-6" />
            <h3 className="text-white font-black italic uppercase tracking-widest mb-4">
              Questions?
            </h3>
            <p className="text-sm text-slate-500 mb-8 max-w-xs mx-auto leading-relaxed">
              If you have concerns about your data or want to request a deletion, email our security
              lead.
            </p>
            <a
              href="mailto:privacy@pika.stream"
              className="text-emerald-400 font-black italic uppercase tracking-[0.2em] hover:text-emerald-300 transition-colors"
            >
              privacy@pika.stream
            </a>
          </div>
        </div>
      </div>

      <footer className="py-20 px-6 border-t border-slate-900 bg-slate-950 mt-40">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
          <span>Registry &copy; 2026</span>
          <Link href="/terms" className="hover:text-white">
            Terms of Use
          </Link>
        </div>
      </footer>
    </div>
  );
}
