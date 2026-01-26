"use client";

import { ArrowLeft, LifeBuoy, Mail, MessageSquare, Search, Terminal } from "lucide-react";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";

export default function SupportPage() {
  const commonIssues = [
    {
      title: "Sidecar Connection",
      tag: "Connectivity",
      content: "Ensure VirtualDJ is running and the Pika! plugin is enabled in the settings menu.",
    },
    {
      title: "Track Detection",
      tag: "History",
      content:
        "If tracks aren't syncing, check if 'Log history' is enabled in your DJ software settings.",
    },
    {
      title: "Dancer Voting",
      tag: "Web App",
      content: "Ensure your mobile browser has permission to access real-time WebSocket updates.",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-purple-500/30">
      <nav className="p-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[10px] font-black text-slate-500 hover:text-white uppercase tracking-[0.4em] transition-all group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Floor
        </Link>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-24">
          <div className="inline-flex items-center gap-3 px-5 py-2 bg-blue-500/10 rounded-full text-blue-400 text-[10px] font-black uppercase tracking-[0.4em] mb-12 border border-blue-500/20 shadow-2xl shadow-blue-500/10">
            <LifeBuoy className="w-4 h-4" />
            Support Center
          </div>

          <h1 className="text-6xl md:text-8xl font-black text-white mb-8 italic uppercase tracking-tighter leading-none">
            HOW CAN <br />
            <span className="bg-gradient-to-r from-blue-400 via-slate-200 to-blue-500 text-transparent bg-clip-text">
              WE HELP?
            </span>
          </h1>

          <div className="relative max-w-xl mx-auto mt-12">
            <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
              <Search className="w-5 h-5 text-slate-600" />
            </div>
            <input
              type="text"
              placeholder="SEARCH THE PROTOCOLS..."
              className="w-full bg-slate-900 border border-white/5 rounded-2xl py-6 pl-16 pr-6 text-sm font-black uppercase tracking-widest focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-700"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-32">
          <ProCard className="p-10 bg-slate-950/80 border-blue-500/30 text-center" glow>
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-8 mx-auto shadow-2xl shadow-blue-500/20">
              <MessageSquare className="w-8 h-8 text-blue-400" />
            </div>
            <h3 className="text-2xl font-black text-white mb-4 italic uppercase tracking-tight">
              Discord Access
            </h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              Get immediate help from the Pika! community and our dev team.
            </p>
            <a
              href="https://discord.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-3 bg-blue-500 text-white px-8 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-400 transition-all active:scale-95 shadow-xl"
            >
              Join the Server
            </a>
          </ProCard>

          <ProCard className="p-10 bg-slate-950/80 border-slate-800 text-center" glow>
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-white/5 flex items-center justify-center mb-8 mx-auto">
              <Mail className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-2xl font-black text-white mb-4 italic uppercase tracking-tight">
              Email Direct
            </h3>
            <p className="text-slate-500 text-sm font-medium mb-8 leading-relaxed">
              For account issues, convention inquiries, or premium support.
            </p>
            <a
              href="mailto:hello@pika.stream"
              className="inline-flex items-center gap-3 bg-slate-800 text-slate-200 px-8 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-700 transition-all active:scale-95 border border-white/5"
            >
              Open Ticket
            </a>
          </ProCard>
        </div>

        <div className="space-y-6">
          <div className="flex items-center gap-4 mb-10">
            <Terminal className="w-5 h-5 text-blue-400" />
            <h2 className="text-xl font-black text-white italic uppercase tracking-widest">
              Common Fixes
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {commonIssues.map((issue, idx) => (
              <div
                key={idx}
                className="p-8 rounded-[2rem] bg-slate-900/40 border border-white/5 hover:border-blue-500/30 transition-all group"
              >
                <span className="text-[9px] font-black text-blue-500/60 uppercase tracking-widest block mb-4 group-hover:text-blue-400">
                  {issue.tag}
                </span>
                <h4 className="text-sm font-black text-white mb-3 italic uppercase tracking-tight">
                  {issue.title}
                </h4>
                <p className="text-xs text-slate-600 font-medium leading-relaxed">
                  {issue.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="py-20 px-6 border-t border-slate-900 bg-slate-950 mt-40">
        <div className="max-w-4xl mx-auto flex justify-between items-center text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
          <span>Registry &copy; 2026</span>
          <a href="https://status.pika.stream" className="hover:text-white">
            System Status
          </a>
        </div>
      </footer>
    </div>
  );
}
