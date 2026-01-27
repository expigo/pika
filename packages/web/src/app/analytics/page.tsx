"use client";

import { logger } from "@pika/shared";
import { Activity, Globe, Heart, PieChart, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { ProCard } from "@/components/ui/ProCard";
import { getApiBaseUrl } from "@/lib/api";

interface AnalyticsStats {
  totalSessions: number;
  totalTracks: number;
  totalLikes: number;
  activeDancers: number;
}

interface TopTrack {
  artist: string;
  title: string;
  likeCount: number;
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [topTracks, setTopTracks] = useState<TopTrack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const baseUrl = getApiBaseUrl();

        const [activeRes, topRes, globalRes] = await Promise.all([
          fetch(`${baseUrl}/api/sessions/active`),
          fetch(`${baseUrl}/api/stats/top-tracks`),
          fetch(`${baseUrl}/api/stats/global`),
        ]);

        const activeData = activeRes.ok ? await activeRes.json() : { sessions: [] };
        const topData = topRes.ok ? await topRes.json() : [];
        const globalData = globalRes.ok ? await globalRes.json() : null;

        setTopTracks(topData);

        setStats({
          totalSessions: globalData?.totalSessions ?? 0,
          totalTracks: globalData?.totalTracks ?? 0,
          totalLikes: globalData?.totalLikes ?? 0,
          activeDancers:
            activeData.sessions?.reduce(
              (acc: number, s: { listenerCount?: number }) => acc + (s.listenerCount || 0),
              0,
            ) || 0,
        });
      } catch (error) {
        logger.error("Failed to fetch analytics", error);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="h-[100dvh] w-full bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
        <div className="text-emerald-400 animate-pulse font-black tracking-widest text-[10px] uppercase">
          Compiling Network Intelligence...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/4 w-full h-[600px] bg-gradient-to-b from-blue-600/20 to-transparent blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-full h-[600px] bg-gradient-to-t from-emerald-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-16">
        {/* HEADER SECTION */}
        <div className="text-center mb-20">
          <div className="inline-flex items-center gap-3 px-6 py-2 bg-emerald-500/5 border border-emerald-500/10 rounded-full mb-10 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
            <Globe className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[9px] font-black uppercase tracking-[0.4em] text-emerald-500/80">
              GLOBAL PULSE LAYER
            </span>
          </div>
          <h1 className="text-6xl sm:text-8xl font-black text-white italic tracking-tighter mb-4 uppercase leading-none">
            NETWORK.
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.4em] sm:tracking-[0.6em] text-[9px] sm:text-[10px]">
            Global Network Pulse
          </p>
        </div>

        {/* KEY PERFORMANCE INDICATORS */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <ProCard className="p-8 text-center" glow glowColor="emerald-500" align="center">
            <div className="text-4xl font-black text-white italic tracking-tighter mb-1 font-mono">
              {stats?.activeDancers}
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.25em]">
              Live Presence
            </div>
          </ProCard>
          <ProCard className="p-8 text-center" glow glowColor="emerald-500" align="center">
            <div className="text-4xl font-black text-white italic tracking-tighter mb-1 font-mono">
              {stats?.totalSessions}
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.25em]">
              Sets Logged
            </div>
          </ProCard>
        </div>

        <ProCard
          className="p-16 mb-12 text-center overflow-hidden"
          glow
          glowColor="pink-500"
          align="center"
        >
          <div className="relative">
            <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-500 to-pink-500 rounded-[2.5rem] mb-10 shadow-2xl shadow-red-500/20">
              <Heart className="w-10 h-10 text-white fill-current" />
            </div>
            <div className="text-7xl sm:text-8xl font-black text-white italic tracking-tighter mb-4 leading-none font-mono">
              {stats?.totalLikes.toLocaleString()}
            </div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
              Community Heartbeats
            </div>
          </div>
        </ProCard>

        {/* TOP TRACKS LEADERBOARD */}
        <ProCard className="mb-12 overflow-hidden">
          <div className="px-8 sm:px-12 py-6 border-b border-white/[0.03] flex items-center justify-between bg-white/[0.02]">
            <div className="flex items-center gap-4">
              <Trophy className="w-5 h-5 text-amber-500" />
              <h3 className="font-black text-white italic uppercase tracking-widest text-xs">
                Trending Tracks.
              </h3>
            </div>
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Total Syncs
            </span>
          </div>
          <div className="divide-y divide-slate-800/30">
            {topTracks.length > 0 ? (
              topTracks.map((track, i) => (
                <div
                  key={i}
                  className="px-8 sm:px-12 py-8 flex items-center justify-between group hover:bg-white/[0.02] transition-colors relative overflow-hidden"
                >
                  <div className="flex-1 flex items-center gap-8 relative z-10 min-w-0">
                    <span className="text-slate-800 font-black italic text-2xl group-hover:text-amber-500/40 transition-colors w-10 flex-shrink-0 font-mono">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-black text-lg uppercase italic tracking-tighter group-hover:text-white transition-colors leading-none truncate pr-4">
                        {track.title}
                      </p>
                      <p className="text-slate-500 text-[10px] font-black uppercase tracking-[0.3em] mt-2 opacity-60 truncate pr-4">
                        {track.artist}
                      </p>
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-red-500/5 border border-red-500/10 rounded-xl relative z-10 min-w-[70px] justify-center">
                    <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                    <span className="text-sm font-black text-red-500 font-mono">
                      {track.likeCount}
                    </span>
                  </div>
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500 transform -translate-x-full group-hover:translate-x-0 transition-transform duration-300" />
                </div>
              ))
            ) : (
              <div className="p-12 text-center">
                <p className="text-slate-700 text-[10px] font-black uppercase tracking-widest italic">
                  No tracks have been synced yet...
                </p>
              </div>
            )}
          </div>
        </ProCard>

        {/* SYSTEM HEALTH */}
        <div className="grid gap-6 sm:grid-cols-2 mb-20">
          <ProCard className="p-8 overflow-hidden" glow glowColor="emerald-500">
            <div className="flex items-center gap-3 mb-8">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                Network Status.
              </span>
            </div>
            <div className="flex items-center gap-4 font-black italic text-emerald-400 uppercase tracking-tighter text-2xl">
              <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_15px_rgba(16,185,129,0.5)]" />
              Operational
            </div>
          </ProCard>

          <ProCard className="p-8 overflow-hidden" glow glowColor="emerald-500">
            <div className="flex items-center gap-3 mb-8">
              <PieChart className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">
                Total Tracks.
              </span>
            </div>
            <div className="text-3xl font-black italic text-white uppercase tracking-tighter font-mono">
              {stats?.totalTracks.toLocaleString()}
            </div>
          </ProCard>
        </div>

        <div className="mt-24 text-center pb-32">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-2">
            The Neural Fiber of the Connection
          </p>
          <p className="text-[9px] font-bold text-slate-700 italic uppercase tracking-widest opacity-60">
            Powered by Pika! Global Intelligence
          </p>
        </div>
      </div>
    </div>
  );
}
