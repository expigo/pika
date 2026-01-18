"use client";

import { Activity, Globe, Heart, PieChart, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { ProCard, ProHeader } from "@/components/ui/ProCard";
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
        console.error("Failed to fetch analytics:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-black tracking-widest text-[10px] uppercase">
          Compiling Network Data...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/4 w-full h-[600px] bg-gradient-to-b from-blue-600/20 to-transparent blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-full h-[600px] bg-gradient-to-t from-purple-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 py-16">
        {/* HEADER SECTION */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-slate-900 border border-slate-800 rounded-2xl mb-8">
            <Globe className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
              GLOBAL PULSE LAYER
            </span>
          </div>
          <h1 className="text-5xl sm:text-7xl font-black text-white italic tracking-tighter mb-4 uppercase leading-none">
            NETWORK
          </h1>
          <p className="text-slate-500 font-bold uppercase tracking-[0.3em] sm:tracking-[0.5em] text-[9px] sm:text-[10px]">
            Intelligence Dashboard
          </p>
        </div>

        {/* KEY PERFORMANCE INDICATORS */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <ProCard className="p-8 text-center" glow>
            <div className="text-4xl font-black text-white italic tracking-tighter mb-1">
              {stats?.activeDancers}
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Live Presence
            </div>
          </ProCard>
          <ProCard className="p-8 text-center" glow>
            <div className="text-4xl font-black text-white italic tracking-tighter mb-1">
              {stats?.totalSessions}
            </div>
            <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
              Sets Logged
            </div>
          </ProCard>
        </div>

        <ProCard className="p-16 mb-12 text-center" glow>
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-red-500 to-pink-500 rounded-[2.5rem] mb-8 shadow-2xl shadow-red-500/20">
            <Heart className="w-10 h-10 text-white fill-current" />
          </div>
          <div className="text-6xl font-black text-white italic tracking-tighter mb-3 leading-none">
            {stats?.totalLikes.toLocaleString()}
          </div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">
            Community Heartbeats
          </div>
        </ProCard>

        {/* TOP TRACKS LEADERBOARD */}
        <ProCard className="mb-12 overflow-hidden">
          <ProHeader title="The Vibe Leaders" icon={Trophy} subtitle="Network-wide syncs" />
          <div className="divide-y divide-slate-800/30">
            {topTracks.length > 0 ? (
              topTracks.map((track, i) => (
                <div
                  key={i}
                  className="px-8 py-6 flex items-center justify-between group hover:bg-slate-900/40 transition-all"
                >
                  <div className="flex items-center gap-6">
                    <span className="text-slate-800 font-black italic text-xl group-hover:text-purple-500/50 transition-colors w-8">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-white font-black text-sm uppercase italic tracking-tight group-hover:text-purple-400 transition-colors">
                        {track.title}
                      </p>
                      <p className="text-slate-500 text-[9px] font-black uppercase tracking-widest mt-1">
                        {track.artist}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-2 bg-red-500/5 border border-red-500/10 rounded-xl">
                    <Heart className="w-3.5 h-3.5 text-red-500 fill-red-500" />
                    <span className="text-[11px] font-black text-red-500">{track.likeCount}</span>
                  </div>
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
        <div className="grid gap-6 sm:grid-cols-2 mb-12">
          <ProCard className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                Network Status
              </span>
            </div>
            <div className="flex items-center gap-3 font-black italic text-emerald-400 uppercase tracking-tight text-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50" />
              Operational
            </div>
          </ProCard>

          <ProCard className="p-8">
            <div className="flex items-center gap-3 mb-6">
              <PieChart className="w-4 h-4 text-purple-400" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                Total Tracks
              </span>
            </div>
            <div className="text-2xl font-black italic text-white uppercase tracking-tight">
              {stats?.totalTracks.toLocaleString()}
            </div>
          </ProCard>
        </div>

        <div className="text-center opacity-30 mt-20 pb-32">
          <p className="text-[9px] font-black uppercase tracking-[0.4em] sm:tracking-[0.6em] text-slate-500 mb-2">
            Pika! Intelligence Layer
          </p>
          <p className="text-[8px] font-bold text-slate-600 italic uppercase tracking-[0.2em]">
            Data Driven Dance Culture
          </p>
        </div>
      </div>
    </div>
  );
}
