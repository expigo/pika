"use client";

import { Clock, ExternalLink, Music2, User, History } from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ProCard, ProHeader } from "@/components/ui/ProCard";

// API base URL
function getApiBaseUrl(): string {
  if (typeof window === "undefined") return "";
  return process.env.NEXT_PUBLIC_CLOUD_API_URL || "http://localhost:3001";
}

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
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return (
    date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    }) +
    " @ " +
    date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    })
  );
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
        console.error("Failed to fetch profile:", e);
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
          Fetching Archive...
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
        <ProCard className="mb-12 p-12 text-center" glow>
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-[2.5rem] mb-6 shadow-2xl shadow-purple-500/20">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-black text-white mb-4 tracking-tighter italic uppercase leading-none">
            {profile.djName}
          </h1>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-900 border border-slate-800 rounded-full mb-10">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.25em]">
              VERIFIED BROADCASTER
            </span>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-10 border-t border-slate-800/50">
            <div className="text-center border-r border-slate-800/50 pr-8">
              <div className="text-4xl font-black text-white italic tracking-tighter">
                {profile.totalSessions}
              </div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">
                Sessions
              </div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-black text-white italic tracking-tighter">
                {profile.totalTracks}
              </div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-2">
                Syncs
              </div>
            </div>
          </div>
        </ProCard>

        {/* RECENT SESSIONS LIST */}
        <ProCard>
          <ProHeader title="Broadcasting History" icon={History} />

          {profile.sessions.length === 0 ? (
            <div className="p-12 text-center text-slate-600 font-bold italic uppercase tracking-widest text-[10px]">
              No recorded sessions found.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/30">
              {profile.sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/dj/${slug}/recap/${session.id}`}
                  className="px-10 py-8 flex items-center justify-between group hover:bg-slate-900/50 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-white font-black text-base tracking-tight uppercase italic group-hover:text-purple-400 transition-colors leading-none">
                      {formatDate(session.startedAt)}
                    </p>
                    <div className="flex items-center gap-5 text-slate-500 text-[10px] font-black uppercase tracking-[0.2em] mt-3">
                      <span className="flex items-center gap-2">
                        <Music2 className="w-3.5 h-3.5 text-slate-600" />
                        {session.trackCount} Syncs
                      </span>
                      <span className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-600" />
                        {formatDuration(session.startedAt, session.endedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center group-hover:border-purple-500/50 group-hover:bg-purple-500/10 transition-all">
                    <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-purple-400" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </ProCard>

        <div className="mt-16 text-center opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-500">
            Showcasing the Flow with Pika! Pro
          </p>
        </div>
      </div>
    </div>
  );
}
