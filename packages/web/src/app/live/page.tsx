"use client";

import {
  Activity,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Flame,
  Globe,
  Heart,
  History,
  Music2,
  Radio,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { LivePlayer } from "@/components/LivePlayer";
import { ProCard, ProHeader } from "@/components/ui/ProCard";
import { VibeBadge } from "@/components/ui/VibeBadge";

interface ActiveSession {
  sessionId: string;
  djName: string;
  startedAt?: string;
  currentTrack?: {
    title: string;
    artist: string;
    bpm?: number;
  };
  listenerCount?: number;
  momentum?: number;
}

interface TopTrack {
  artist: string;
  title: string;
  likeCount: string;
}

interface RecentSession {
  id: string;
  djName: string;
  startedAt: string;
  endedAt: string;
}

interface SessionsResponse {
  live: boolean;
  count: number;
  sessions: ActiveSession[];
}

export default function LivePage() {
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_CLOUD_API_URL || "http://localhost:3001";
    setLoading(true);
    setError(null);

    try {
      // Fetch active sessions first (critical)
      const activeRes = await fetch(`${apiUrl}/api/sessions/active`).catch(() => null);

      if (activeRes?.ok) {
        const data: SessionsResponse = await activeRes.json();
        setSessions(data.sessions || []);
        if (data.sessions?.length === 1) {
          setSelectedSessionId(data.sessions[0].sessionId);
        }
      } else if (!activeRes || activeRes.status >= 500) {
        setError("The Pika! Pulse is currently unavailable. Please check back in a moment.");
      }

      // Fetch non-critical stats independently
      fetch(`${apiUrl}/api/stats/top-tracks`)
        .then((res) => (res.ok ? res.json() : []))
        .then(setTopTracks)
        .catch(() => console.warn("Top syncs unavailable"));

      fetch(`${apiUrl}/api/sessions/recent`)
        .then((res) => (res.ok ? res.json() : []))
        .then(setRecentSessions)
        .catch(() => console.warn("Recent sets unavailable"));
    } catch (err) {
      console.error("Failed to fetch data:", err);
      setError("Failed to connect to the Pika! network.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  if (selectedSessionId) {
    return <LivePlayer targetSessionId={selectedSessionId} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-[2rem] bg-purple-500/10 flex items-center justify-center mb-8 border border-purple-500/20 shadow-2xl shadow-purple-500/20 animate-pulse">
          <Radio className="w-8 h-8 text-purple-500" />
        </div>
        <div className="text-purple-400 animate-pulse font-black tracking-[0.4em] text-[10px] uppercase">
          Scanning Frequencies...
        </div>
      </div>
    );
  }

  // ERROR STATE - SHOWN BEFORE EMPTY STATE
  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-6 text-center">
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-red-600/20 to-transparent blur-[120px]" />
        </div>
        <div className="relative">
          <div className="w-16 h-16 bg-red-500/10 rounded-[2rem] flex items-center justify-center mb-10 border border-red-500/20 mx-auto">
            <Activity className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-5xl font-black italic tracking-tighter mb-4 uppercase leading-none">
            PULSE INTERRUPTED
          </h1>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest max-w-xs mx-auto mb-12">
            {error}
          </p>
          <button
            onClick={() => fetchAllData()}
            className="px-12 py-4 bg-white text-slate-950 font-black rounded-2xl hover:scale-105 transition-all transform active:scale-95 flex items-center gap-3 mx-auto text-[10px] uppercase tracking-widest"
          >
            RECONNECT <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Calculate Community Stats
  const totalDancers = sessions.reduce((acc, s) => acc + (s.listenerCount || 0), 0);
  const avgBpm = sessions
    .filter((s) => s.currentTrack?.bpm)
    .reduce((acc, s, _, arr) => acc + (s.currentTrack?.bpm || 0) / arr.length, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30">
      {/* Background Decorative Element */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-full h-[400px] bg-gradient-to-t from-blue-600/10 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-16 pb-32">
        {/* Header Section */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 px-5 py-2 bg-slate-900/50 border border-slate-800/50 rounded-2xl mb-8">
            <span
              className={`w-2 h-2 rounded-full ${sessions.length > 0 ? "bg-red-500 animate-pulse shadow-lg shadow-red-500/50" : "bg-slate-700"}`}
            />
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">
              {sessions.length > 0 ? `${sessions.length} ROOMS ACTIVE` : "AIRWAVES QUIET"}
            </span>
          </div>
          <h1 className="text-7xl font-black text-white italic tracking-tighter mb-4 uppercase leading-none">
            LOBBY
          </h1>

          {/* Discovery HUB / Community Pulse */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <VibeBadge variant="purple" icon={Activity}>
              Avg Vibe: {avgBpm > 0 ? `${Math.round(avgBpm)} BPM` : "CALM"}
            </VibeBadge>
            <VibeBadge variant="slate" icon={Users}>
              {totalDancers} {totalDancers === 1 ? "Dancer" : "Dancers"} Online
            </VibeBadge>
          </div>
        </div>

        {/* ACTIVE SESSIONS */}
        {sessions.length > 0 ? (
          <div className="space-y-6 mb-16">
            <div className="px-1 mb-2">
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.4em]">
                BROADCASTING NOW
              </span>
            </div>
            {sessions.map((session) => (
              <ProCard
                key={session.sessionId}
                glow={session.momentum ? session.momentum > 0.4 : false}
                className="overflow-hidden"
              >
                <button
                  onClick={() => setSelectedSessionId(session.sessionId)}
                  className="w-full p-8 text-left group flex items-center gap-8 hover:bg-slate-900/40 transition-all"
                >
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-[2rem] flex items-center justify-center flex-shrink-0 shadow-2xl group-hover:scale-105 transition-transform">
                    <span className="text-3xl font-black text-white italic">
                      {session.djName.charAt(0)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-2xl font-black text-white tracking-tight italic uppercase">
                        {session.djName}
                      </h2>
                      {session.momentum && session.momentum > 0.5 && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[9px] font-black text-red-500 uppercase tracking-widest">
                          <Flame className="w-3 h-3" />
                          HOT
                        </div>
                      )}
                    </div>

                    {session.currentTrack ? (
                      <div className="flex items-center gap-2.5 text-slate-400">
                        <Music2 className="w-4 h-4 text-purple-500/50" />
                        <div className="flex flex-col">
                          <span className="text-[13px] font-black uppercase italic leading-none mb-1 group-hover:text-purple-400 transition-colors">
                            {session.currentTrack.title}
                          </span>
                          <span className="text-[10px] font-black uppercase text-slate-600 tracking-widest">
                            {session.currentTrack.artist}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-700 font-black uppercase tracking-widest italic leading-none">
                        Waiting for uplink...
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3">
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 border rounded-xl ${
                        (session.listenerCount || 0) >= 50
                          ? "bg-red-500/10 border-red-500/20"
                          : (session.listenerCount || 0) >= 10
                            ? "bg-purple-500/10 border-purple-500/20"
                            : "bg-slate-950 border-slate-800"
                      }`}
                    >
                      <Users
                        className={`w-3.5 h-3.5 ${
                          (session.listenerCount || 0) >= 50
                            ? "text-red-500"
                            : (session.listenerCount || 0) >= 10
                              ? "text-purple-500"
                              : "text-slate-500"
                        }`}
                      />
                      <span
                        className={`text-[11px] font-black ${
                          (session.listenerCount || 0) >= 50
                            ? "text-red-500"
                            : (session.listenerCount || 0) >= 10
                              ? "text-purple-500"
                              : "text-white"
                        }`}
                      >
                        {session.listenerCount || 0}
                      </span>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-center group-hover:bg-white group-hover:border-white transition-all shadow-xl">
                      <ChevronRight className="w-5 h-5 text-slate-700 group-hover:text-slate-950 transition-colors" />
                    </div>
                  </div>
                </button>
              </ProCard>
            ))}
          </div>
        ) : (
          /* RICH QUIET FLOOR STATE (Discovery Hub) */
          <div className="space-y-12 mb-16">
            <ProCard glow className="bg-slate-900/20">
              <div className="p-16 text-center">
                <div className="w-24 h-24 bg-slate-950 border border-slate-800 rounded-[2.5rem] flex items-center justify-center mx-auto mb-10 shadow-2xl group/hub transition-all">
                  <Radio className="w-10 h-10 text-slate-800 group-hover:text-purple-500 transition-colors" />
                </div>
                <h2 className="text-4xl font-black text-white mb-3 italic uppercase tracking-tighter">
                  THE FLOOR IS QUIET
                </h2>
                <p className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] max-w-sm mx-auto mb-12 italic leading-relaxed">
                  No active frequencies detected. Catch up on previous pulse data or explore the
                  archives.
                </p>
                <Link
                  href="/"
                  className="inline-flex items-center gap-3 px-10 py-4 bg-white text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-2xl shadow-white/5"
                >
                  SYSTEM PORTAL <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </ProCard>

            <div className="grid gap-8 sm:grid-cols-2">
              <ProCard className="overflow-hidden">
                <ProHeader title="Top Volume" icon={Trophy} subtitle="Network-wide Syncs" />
                <div className="divide-y divide-slate-800/30">
                  {topTracks.length > 0 ? (
                    topTracks.slice(0, 5).map((track, i) => (
                      <div
                        key={i}
                        className="px-8 py-5 flex items-center justify-between gap-4 group hover:bg-slate-900/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-white font-black text-[11px] uppercase italic truncate group-hover:text-purple-400 transition-colors">
                            {track.title}
                          </p>
                          <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest mt-1 truncate">
                            {track.artist}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-red-500/5 border border-red-500/10 rounded-lg">
                          <Heart className="w-3 h-3 text-red-500 fill-red-500" />
                          <span className="text-[10px] font-black text-red-500">
                            {track.likeCount}
                          </span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-slate-800 text-[10px] font-black uppercase tracking-widest italic py-4">
                        Awaiting Sync Signals...
                      </p>
                    </div>
                  )}
                </div>
              </ProCard>

              <ProCard className="overflow-hidden">
                <ProHeader title="Legacy Sets" icon={History} subtitle="Timeline Archives" />
                <div className="divide-y divide-slate-800/30">
                  {recentSessions.length > 0 ? (
                    recentSessions.map((session) => (
                      <Link
                        key={session.id}
                        href={`/recap/${session.id}`}
                        className="px-8 py-6 flex items-center justify-between group hover:bg-slate-900/40 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-white font-black text-[11px] uppercase italic group-hover:text-purple-400 transition-colors">
                            {session.djName}
                          </p>
                          <p className="text-slate-600 text-[9px] font-black uppercase tracking-widest mt-1">
                            {new Date(session.startedAt).toLocaleDateString([], {
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center group-hover:bg-purple-500 group-hover:border-purple-500 transition-all">
                          <ChevronRight className="w-4 h-4 text-slate-800 group-hover:text-white transition-colors" />
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="p-8 text-center">
                      <p className="text-slate-800 text-[10px] font-black uppercase tracking-widest italic py-4">
                        No Recent Uplinks...
                      </p>
                    </div>
                  )}
                </div>
              </ProCard>
            </div>
          </div>
        )}

        {/* Footer Branded Line */}
        <div className="mt-24 text-center">
          <div className="inline-flex items-center gap-3 px-6 py-3 bg-slate-950/50 border border-slate-800/50 rounded-2xl opacity-40">
            <Globe className="w-3.5 h-3.5 text-blue-500" />
            <p className="text-[9px] font-black uppercase tracking-[0.5em] text-slate-500">
              Broadcasting World Wide Floor Awareness
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
