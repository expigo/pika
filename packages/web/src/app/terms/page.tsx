"use client";

import { AlertTriangle, ArrowLeft, FileText, Globe, Scale } from "lucide-react";
import Link from "next/link";

export default function TermsPage() {
  const points = [
    {
      title: "Fair Use",
      icon: <Globe className="w-5 h-5" />,
      content:
        "Pika! is for use in professional and community dance environments. Do not use our tools to scrap data, harass performers, or interfere with active floor sessions.",
    },
    {
      title: "Beta Software",
      icon: <AlertTriangle className="w-5 h-5" />,
      content:
        "Registry is currently in v0.4 Beta. While we strive for 100% uptime, you acknowledge that the software is provided 'as is' without warranty for your live events.",
    },
    {
      title: "Intellectual Property",
      icon: <FileText className="w-5 h-5" />,
      content:
        "All artwork, logos, and 'Sidecar' technology are the property of Pika! Registry. Do not re-distribute the binary outside of pika.stream.",
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
        <div className="inline-flex items-center gap-3 px-5 py-2 bg-slate-100/10 rounded-full text-white text-[10px] font-black uppercase tracking-[0.4em] mb-12 border border-white/20 shadow-2xl">
          <Scale className="w-4 h-4" />
          General Terms
        </div>

        <h1 className="text-5xl md:text-7xl font-black text-white mb-10 italic uppercase tracking-tighter leading-none">
          THE RULES <br />
          <span className="text-slate-700">OF PLAY.</span>
        </h1>

        <p className="text-lg text-slate-400 mb-20 font-medium leading-relaxed tracking-tight">
          Pika! is a community-first platform. By using the Sidecar or the Registry, you agree to
          play fair and respect the DJs and Dancers that make this community possible.
        </p>

        <div className="space-y-16">
          {points.map((point, idx) => (
            <div key={idx} className="group transition-all">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-10 h-10 rounded-xl bg-slate-900 border border-white/5 flex items-center justify-center text-white group-hover:border-white/40 transition-all">
                  {point.icon}
                </div>
                <h2 className="text-xl font-black text-white italic uppercase tracking-widest">
                  {point.title}
                </h2>
              </div>
              <p className="text-slate-500 leading-relaxed font-medium pl-14">{point.content}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="py-20 px-6 border-t border-slate-900 bg-slate-950 mt-40">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
          <span>Registry &copy; 2026</span>
          <Link href="/privacy" className="hover:text-white">
            Privacy Protocol
          </Link>
        </div>
      </footer>
    </div>
  );
}
