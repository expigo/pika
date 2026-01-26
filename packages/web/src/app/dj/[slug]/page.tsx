"use client";

import { logger } from "@pika/shared";
import { ArrowRight, Clock, History, Music2, User } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { getApiBaseUrl } from "@/lib/api";

interface DjSession {
  id: string;
  djName: string;
  startedAt: string;
  endedAt: string | null;
  trackCount: number;
}

interface DjProfile {
  slug: string;
  djName: string;
  sessions: DjSession[];
  totalSessions: number;
  totalTracks: number;
}

// Format date nicely with time
function formatSessionDate(dateString: string): string {
  const date = new Date(dateString);
  return date
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
    .toUpperCase();
}

function formatSessionTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Calculate duration
function formatDuration(start: string, end: string | null): string {
  if (!end) return "Live now";
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffMs = endDate.getTime() - startDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

interface DjPageProps {
  params: Promise<{ slug: string }>;
}

export default function DjProfilePage({ params }: DjPageProps) {
  const { slug } = use(params);

  const [profile, setProfile] = useState<DjProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/dj/${slug}`);

        if (!response.ok) {
          setError(response.status === 404 ? "DJ not found" : "Failed to load profile");
          return;
        }

        const data = await response.json();
        setProfile(data);
      } catch (e) {
        logger.error("Failed to fetch profile", e);
        setError("Failed to connect to server");
      } finally {
        setLoading(false);
      }
    }

    if (slug) {
      fetchProfile();
    }
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-black tracking-widest text-[10px] uppercase">
          Initializing Handshake...
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
        </div>
        <div className="text-center relative">
          <User className="w-20 h-20 text-slate-800 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-white mb-2 italic uppercase tracking-tighter">
            Archive Missing
          </h1>
          <p className="text-slate-500 font-bold mb-8 uppercase tracking-widest text-[10px]">
            This DJ hasn't stepped into the booth yet.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all font-bold border border-slate-800 uppercase text-[10px] tracking-widest"
          >
            Portal Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-20">
        {/* PROFILE HEADER CARD */}
        <ProCard className="mb-12 p-12 text-center" glow glowColor="purple-500" align="center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-[2.5rem] mb-6 shadow-2xl shadow-purple-500/20">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-black text-white mb-6 tracking-tighter italic uppercase leading-none">
            {profile.djName}.
          </h1>
          <div className="inline-flex items-center gap-3 px-6 py-2 bg-purple-500/5 border border-purple-500/10 rounded-full mb-12 shadow-[0_0_20px_rgba(168,85,247,0.05)]">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
            <span className="text-[9px] font-black text-purple-400/80 uppercase tracking-[0.4em]">
              VERIFIED SIGNAL SOURCE
            </span>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-10 border-t border-white/[0.03]">
            <div className="text-center border-r border-white/[0.03] pr-8">
              <div className="text-4xl font-black text-white italic tracking-tighter font-mono">
                {profile.totalSessions}
              </div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-2">
                Set Count
              </div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-black text-white italic tracking-tighter font-mono">
                {profile.totalTracks}
              </div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em] mt-2">
                Public Pulses
              </div>
            </div>
          </div>
        </ProCard>

        {/* RECENT SESSIONS LIST */}
        <ProCard>
          <div className="px-8 sm:px-12 py-6 border-b border-white/[0.03] flex items-center gap-4 bg-white/[0.02]">
            <History className="w-4 h-4 text-purple-500" />
            <h3 className="font-black text-white italic uppercase tracking-widest text-xs">
              Flow Sequence History.
            </h3>
          </div>

          {profile.sessions.length === 0 ? (
            <div className="p-12 text-center text-slate-600 font-bold italic uppercase tracking-widest text-[10px]">
              No recorded sessions found.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.03]">
              {profile.sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/dj/${slug}/recap/${session.id}`}
                  className="px-8 sm:px-12 py-10 flex items-center justify-between group hover:bg-white/[0.02] transition-colors relative overflow-hidden"
                >
                  <div className="min-w-0 relative z-10">
                    <div className="flex items-center gap-4 mb-4">
                      <p className="text-white font-black text-2xl tracking-tighter uppercase italic group-hover:text-purple-400 transition-colors leading-none font-mono">
                        {formatSessionTime(session.startedAt)}
                      </p>
                      <div className="h-px w-8 bg-white/[0.05]" />
                      <p className="text-slate-500 font-black text-[10px] uppercase tracking-widest leading-none">
                        {formatSessionDate(session.startedAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-6 text-slate-400/40 text-[9px] font-black uppercase tracking-[0.3em]">
                      <span className="flex items-center gap-2 group-hover:text-slate-400 transition-colors">
                        <Music2 className="w-3 h-3" />
                        {session.trackCount} Pulses
                      </span>
                      <span className="flex items-center gap-2 group-hover:text-slate-400 transition-colors">
                        <Clock className="w-3 h-3" />
                        {formatDuration(session.startedAt, session.endedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="relative z-10 p-3 rounded-xl border border-white/5 bg-white/5 text-slate-500 group-hover:text-white group-hover:border-purple-500/30 group-hover:bg-purple-500/10 transition-all">
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </div>

                  {/* Subtle Background Glow for Hover */}
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
                </Link>
              ))}
            </div>
          )}
        </ProCard>

        <div className="mt-24 text-center pb-32">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-2">
            The Neural Fiber of the Floor
          </p>
          <p className="text-[9px] font-bold text-slate-700 italic uppercase tracking-widest opacity-60">
            Showcasing the Flow with Pika! Pro
          </p>
        </div>
      </div>
    </div>
  );
}
