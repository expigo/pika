"use client";

import { calculateVibeFriction, getHarmonicCompatibility, type TrackInfo } from "@pika/shared";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Clock,
  Flame,
  Heart,
  Music2,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ProCard, ProHeader } from "@/components/ui/ProCard";
import { VibeBadge } from "@/components/ui/VibeBadge";

import { getApiBaseUrl } from "@/lib/api";
import { logger } from "@pika/shared";

interface TempoData {
  slower: number;
  perfect: number;
  faster: number;
}

interface RecapTrack
  extends Omit<
    TrackInfo,
    "bpm" | "key" | "energy" | "danceability" | "brightness" | "acousticness" | "groove"
  > {
  position: number;
  bpm: number | null;
  key: string | null;
  energy: number | null;
  danceability: number | null;
  brightness: number | null;
  acousticness: number | null;
  groove: number | null;
  playedAt: string;
  likes: number;
  tempo: TempoData | null;
}

interface PollResult {
  id: number;
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  winnerIndex: number;
  winner: string | null;
  startedAt: string;
  endedAt: string | null;
  // Track context: what was playing when poll was created
  currentTrack?: { artist: string; title: string } | null;
}

interface SessionRecap {
  sessionId: string;
  djName: string;
  startedAt: string;
  endedAt: string;
  trackCount: number;
  totalLikes: number;
  tracks: RecapTrack[];
  polls?: PollResult[];
  totalPolls?: number;
  totalPollVotes?: number;
}

// Chart data point
interface ChartDataPoint {
  name: string;
  position: number;
  likes: number;
  bpm: number | null;
  key: string | null;
  slower: number;
  perfect: number;
  faster: number;
  totalEngagement: number;
  time: string;
  fullTitle: string;
  energy: number; // Calculated energy score
  friction: number;
  harmonic: { color: string; label: string; score: number } | null;
  prevBpm: number | null;
}

// Calculate tempo sentiment score (-1 to +1, where -1 = all slower, +1 = all faster)
function _getTempoSentiment(tempo: TempoData | null): number {
  if (!tempo) return 0;
  const total = tempo.slower + tempo.perfect + tempo.faster;
  if (total === 0) return 0;
  return (tempo.faster - tempo.slower) / total;
}

// INTELLIGENCE UTILITIES (MOVED TO @PIKA/SHARED)

// Format time
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// Truncate text
function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.substring(0, maxLength)}...` : text;
}

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  const resolvedParams = use(params);
  const { slug, id } = resolvedParams;

  const [recap, setRecap] = useState<SessionRecap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecap() {
      try {
        const baseUrl = getApiBaseUrl();
        const response = await fetch(`${baseUrl}/api/session/${id}/recap`);

        if (!response.ok) {
          setError("Session not found");
          return;
        }

        const data: SessionRecap = await response.json();
        setRecap(data);
      } catch (e) {
        logger.error("Failed to fetch recap", e);
        setError("Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }

    fetchRecap();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-purple-400 animate-pulse font-black tracking-widest text-[10px] uppercase">
          Synthesizing Intelligence...
        </div>
      </div>
    );
  }

  if (error || !recap) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[500px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
        </div>
        <div className="text-center relative">
          <TrendingUp className="w-16 h-16 text-slate-800 mx-auto mb-6" />
          <h1 className="text-2xl font-black text-white mb-2 italic uppercase tracking-tighter">
            Data Stream Fragmented
          </h1>
          <p className="text-slate-500 font-bold mb-8 uppercase tracking-widest text-[10px]">
            {error || "Session intelligence is currently unreachable."}
          </p>
          <Link
            href={`/dj/${slug}`}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl transition-all font-bold border border-slate-800 uppercase text-[10px] tracking-widest"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Archive
          </Link>
        </div>
      </div>
    );
  }
  // Prepare chart data with energy calculation
  // Energy is a normalized score combining BPM and engagement
  const maxBpm = Math.max(...recap.tracks.map((t) => t.bpm || 0), 1);
  const minBpm = Math.min(...recap.tracks.filter((t) => t.bpm).map((t) => t.bpm || 0), maxBpm);

  const chartData: ChartDataPoint[] = recap.tracks.map((track, index) => {
    const engagement =
      track.likes +
      (track.tempo?.slower || 0) +
      (track.tempo?.perfect || 0) +
      (track.tempo?.faster || 0);
    // Normalize BPM to 0-50 range, engagement to 0-50 range
    const normalizedBpm = track.bpm ? ((track.bpm - minBpm) / (maxBpm - minBpm || 1)) * 50 : 25;
    const normalizedEngagement = Math.min(engagement * 5, 50);
    const energy = normalizedBpm + normalizedEngagement;

    // Transition Intelligence (comparison with previous track)
    const prevTrack = index > 0 ? recap.tracks[index - 1] : null;
    // Map RecapTrack (with nulls) to TrackInfo (with undefineds) for shared logic
    const friction = prevTrack
      ? calculateVibeFriction(prevTrack as unknown as TrackInfo, track as unknown as TrackInfo)
      : 0;
    const harmonic = prevTrack ? getHarmonicCompatibility(prevTrack.key, track.key) : null;

    return {
      name: truncate(track.title, 15),
      position: track.position,
      likes: track.likes,
      bpm: track.bpm,
      key: track.key,
      slower: track.tempo?.slower || 0,
      perfect: track.tempo?.perfect || 0,
      faster: track.tempo?.faster || 0,
      totalEngagement: engagement,
      time: formatTime(track.playedAt),
      fullTitle: `${track.artist} - ${track.title}`,
      energy,
      // Metadata for transition analysis
      friction,
      harmonic,
      prevBpm: prevTrack?.bpm,
    } as ChartDataPoint;
  });

  // Identify "The Drift" Segments
  // A drift occurs when (BPM increases and crowd says Slower) OR (BPM decreases and crowd says Faster)
  const driftSegments = chartData.filter((d) => {
    if (d.prevBpm === undefined || d.bpm === null || d.prevBpm === null) return false;
    const bpmDelta = d.bpm - d.prevBpm;
    const totalVotes = d.slower + d.perfect + d.faster;
    if (totalVotes < 3) return false; // Need some consensus

    const crowdSentiment = (d.faster - d.slower) / totalVotes; // positive = faster, negative = slower

    // If BPM went UP by > 2 but crowd significantly wants SLOWER
    if (bpmDelta > 2 && crowdSentiment < -0.4) return true;
    // If BPM went DOWN by > 2 but crowd significantly wants FASTER
    if (bpmDelta < -2 && crowdSentiment > 0.4) return true;

    return false;
  });

  // Calculate summary stats
  const avgBpm = Math.round(
    chartData.filter((d) => d.bpm).reduce((sum, d) => sum + (d.bpm || 0), 0) /
      chartData.filter((d) => d.bpm).length || 0,
  );
  const minBpmVal = Math.min(...chartData.filter((d) => d.bpm).map((d) => d.bpm || 0));
  const maxBpmVal = Math.max(...chartData.filter((d) => d.bpm).map((d) => d.bpm || 0));
  const totalTempoVotes = chartData.reduce((sum, d) => sum + d.slower + d.perfect + d.faster, 0);
  const totalSlower = chartData.reduce((sum, d) => sum + d.slower, 0);
  const totalPerfect = chartData.reduce((sum, d) => sum + d.perfect, 0);
  const totalFaster = chartData.reduce((sum, d) => sum + d.faster, 0);

  const mostLikedTrack = chartData.reduce(
    (max, d) => (d.likes > max.likes ? d : max),
    chartData[0],
  );
  const _mostEngagedTrack = chartData.reduce(
    (max, d) => (d.totalEngagement > max.totalEngagement ? d : max),
    chartData[0],
  );

  // Find tracks with tempo issues (high slower or faster votes)
  const tempoIssues = chartData.filter((d) => {
    const total = d.slower + d.perfect + d.faster;
    if (total < 2) return false;
    const slowerRatio = d.slower / total;
    const fasterRatio = d.faster / total;
    return slowerRatio > 0.4 || fasterRatio > 0.4;
  });

  // Calculate set fingerprint (average of all track fingerprints)
  const tracksWithFingerprint = recap.tracks.filter(
    (t) =>
      t.energy !== null ||
      t.danceability !== null ||
      t.brightness !== null ||
      t.acousticness !== null ||
      t.groove !== null,
  );

  const avgFingerprint = (
    field: "energy" | "danceability" | "brightness" | "acousticness" | "groove",
  ) => {
    const values = tracksWithFingerprint
      .map((t) => t[field])
      .filter((v): v is number => v !== null);
    return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  };

  const setFingerprint = [
    { metric: "Energy", value: avgFingerprint("energy"), fullMark: 100 },
    { metric: "Dance", value: avgFingerprint("danceability"), fullMark: 100 },
    { metric: "Bright", value: avgFingerprint("brightness"), fullMark: 100 },
    { metric: "Acoustic", value: avgFingerprint("acousticness"), fullMark: 100 },
    { metric: "Groove", value: avgFingerprint("groove"), fullMark: 100 },
  ];

  const hasFingerprint = setFingerprint.some((f) => f.value > 0);

  // Custom tooltip - using any for recharts payload type
  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ value: number; name: string; color: string; payload: ChartDataPoint }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 pb-3 border-b border-white/5">
            <p className="text-white font-black italic uppercase tracking-tight text-sm leading-tight">
              {data?.fullTitle}
            </p>
            <div className="flex justify-between items-center mt-1">
              <span className="text-slate-500 text-[9px] font-black uppercase tracking-widest">
                {data?.time}
              </span>
              {data?.bpm && (
                <span className="text-orange-400 font-black italic text-xs">{data.bpm} BPM</span>
              )}
            </div>
          </div>
          <div className="space-y-2">
            {payload.map((entry, index) => (
              <div key={index} className="flex justify-between gap-6 items-center">
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                    {entry.name}
                  </span>
                </div>
                <span className="text-white font-black italic text-xs leading-none">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
          {data?.harmonic && (
            <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                Resonance
              </span>
              <VibeBadge
                variant={
                  data.harmonic.color === "emerald" || data.harmonic.color === "green"
                    ? "green"
                    : data.harmonic.color === "blue"
                      ? "purple"
                      : "slate"
                }
                className="text-[8px] py-0.5"
              >
                {data.harmonic.label}
              </VibeBadge>
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 selection:bg-purple-500/30">
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-[600px] bg-gradient-to-b from-purple-600/20 to-transparent blur-[120px]" />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="mb-12">
          <Link
            href={`/dj/${slug}/recap/${id}`}
            className="inline-flex items-center gap-2 text-slate-600 hover:text-white transition-all mb-8 group"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            <span className="text-[10px] font-black uppercase tracking-widest">Back to Recap</span>
          </Link>
          <div className="flex items-center gap-4 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-purple-400" />
            </div>
            <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">
              Deep Intelligence
            </h1>
          </div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] ml-1">
            {recap.djName} • {recap.trackCount} Tracks • {formatTime(recap.startedAt || "")}
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-6 mb-12">
          <ProCard glow className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3">
                <Heart className="w-3.5 h-3.5 text-red-500" />
                Dancer Syncs
              </div>
              <div className="text-4xl font-black text-white italic tracking-tight leading-none mb-1">
                {recap.totalLikes}
              </div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                Total Heart Signals
              </div>
            </div>
          </ProCard>

          <ProCard glow className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3">
                <Zap className="w-3.5 h-3.5 text-purple-500" />
                Tempo Input
              </div>
              <div className="text-4xl font-black text-white italic tracking-tight leading-none mb-1">
                {totalTempoVotes}
              </div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                Total Rhythm Votes
              </div>
            </div>
          </ProCard>

          <ProCard glow className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3">
                <Music2 className="w-3.5 h-3.5 text-blue-500" />
                Global BPM
              </div>
              <div className="text-4xl font-black text-white italic tracking-tight leading-none mb-1">
                {avgBpm}
              </div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1">
                <Activity className="w-2.5 h-2.5" /> {minBpmVal} - {maxBpmVal} Range
              </div>
            </div>
          </ProCard>

          <ProCard glow className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                Peak Moment
              </div>
              <div
                className="text-lg font-black text-white italic tracking-tight truncate leading-tight mb-1 uppercase"
                title={mostLikedTrack?.fullTitle}
              >
                {mostLikedTrack?.name || "-"}
              </div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1">
                <Heart className="w-2.5 h-2.5 text-red-500 fill-current" />
                {mostLikedTrack?.likes || 0} Highest Engagement
              </div>
            </div>
          </ProCard>

          <ProCard glow className="p-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 text-slate-500 text-[10px] font-black uppercase tracking-widest mb-3">
                <Activity className="w-3.5 h-3.5 text-green-500" />
                Rhythm Match
              </div>
              <div className="text-4xl font-black text-white italic tracking-tight leading-none mb-1">
                {totalTempoVotes > 0 ? Math.round((totalPerfect / totalTempoVotes) * 100) : 0}%
              </div>
              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                Satisfied Floor
              </div>
            </div>
          </ProCard>
        </div>

        {/* The Drift Alert */}
        {driftSegments.length > 0 && (
          <div className="mb-12 relative overflow-hidden rounded-[2rem] border border-red-500/20 bg-red-500/5 p-8 flex flex-col md:flex-row items-center gap-8 group">
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative w-16 h-16 rounded-[1.5rem] bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 animate-pulse">
              <Flame className="w-8 h-8 text-red-500" />
            </div>
            <div className="relative text-center md:text-left">
              <h2 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                "The Drift" Detected
              </h2>
              <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-xl">
                Intelligence indicates several segments where crowd sentiment
                <span className="text-red-400 font-bold mx-1">diverged</span>
                dramatically from your BPM trajectory. Your flow moved one way, but the floor's
                kinetic feedback moved the other.
              </p>
            </div>
            <div className="relative ml-auto grid grid-cols-2 gap-3">
              {driftSegments.slice(0, 4).map((d) => (
                <div
                  key={d.position}
                  className="bg-slate-900 border border-slate-800 px-4 py-3 rounded-2xl flex flex-col items-center"
                >
                  <span className="text-white font-black italic text-sm">{d.bpm} BPM</span>
                  <span className="text-[8px] font-black text-red-500 uppercase tracking-widest mt-1">
                    Disconnect
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transition Intelligence Section */}
        <ProCard className="mb-12">
          <ProHeader
            title="Transition Intelligence"
            icon={TrendingUp}
            subtitle="Vibe & Harmonic Resonance"
          />
          <div className="p-10">
            <div className="flex overflow-x-auto gap-4 pb-6 scrollbar-hide">
              {chartData.slice(1).map((d, i) => (
                <div
                  key={d.position}
                  className="flex-shrink-0 w-64 p-5 bg-slate-900/50 rounded-3xl border border-white/5 hover:border-purple-500/20 transition-all group"
                >
                  <div className="text-[8px] font-black text-slate-600 uppercase tracking-widest mb-3">
                    Transition {i + 1} → {i + 2}
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex flex-col">
                      <span className="text-slate-400 text-[10px] font-black uppercase tracking-tight mb-0.5">
                        Vibe Distance
                      </span>
                      <span
                        className={`text-lg font-black italic ${d.friction > 40 ? "text-red-400" : d.friction > 20 ? "text-amber-400" : "text-emerald-400"}`}
                      >
                        {d.friction}%
                      </span>
                    </div>
                    {d.harmonic && (
                      <VibeBadge
                        variant={
                          d.harmonic.color === "emerald" || d.harmonic.color === "green"
                            ? "green"
                            : d.harmonic.color === "blue"
                              ? "purple"
                              : "slate"
                        }
                        className="text-[8px]"
                      >
                        {d.harmonic.label}
                      </VibeBadge>
                    )}
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full transition-all duration-1000 ${d.friction < 30 ? "bg-emerald-500" : d.friction < 50 ? "bg-amber-500" : "bg-red-500"}`}
                      style={{ width: `${100 - d.friction}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-2 truncate">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    <span
                      className="text-[10px] font-black text-slate-300 uppercase truncate"
                      title={d.fullTitle}
                    >
                      {d.name}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ProCard>

        {/* Set Fingerprint Radar Chart */}
        {hasFingerprint && (
          <ProCard className="mb-12">
            <ProHeader title="Sonic Fingerprint" icon={Music2} subtitle="Audio Profile" />
            <div className="p-10">
              <div className="flex flex-col md:flex-row items-center gap-12">
                {/* Radar Chart */}
                <div className="h-[320px] w-full md:w-1/2">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={setFingerprint}>
                      <PolarGrid stroke="#334155" strokeOpacity={0.5} />
                      <PolarAngleAxis
                        dataKey="metric"
                        tick={{ fill: "#94a3b8", fontSize: 10, fontWeight: 900 }}
                        tickLine={false}
                      />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar
                        name="Fingerprint"
                        dataKey="value"
                        stroke="#a855f7"
                        strokeWidth={4}
                        fill="#a855f7"
                        fillOpacity={0.2}
                      />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (active && payload?.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-2xl">
                                <div className="text-slate-500 text-[9px] font-black uppercase tracking-widest mb-1">
                                  {data.metric}
                                </div>
                                <div className="text-white font-black italic text-lg leading-none">
                                  {data.value}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>

                {/* Fingerprint Stats */}
                <div className="w-full md:w-1/2 grid grid-cols-1 gap-4">
                  {setFingerprint.map((f) => (
                    <div key={f.metric} className="group/metric">
                      <div className="flex justify-between items-end mb-2">
                        <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest group-hover/metric:text-purple-400 transition-colors">
                          {f.metric}
                        </span>
                        <span className="text-white font-black italic text-xs">{f.value}%</span>
                      </div>
                      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-600 to-pink-600 rounded-full transition-all duration-1000 group-hover/metric:scale-x-[1.02]"
                          style={{ width: `${f.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  <div className="mt-4 pt-4 border-t border-slate-800/50 text-center text-[9px] font-black text-slate-600 uppercase tracking-widest">
                    Based on {tracksWithFingerprint.length} telemetry points
                  </div>
                </div>
              </div>
            </div>
          </ProCard>
        )}

        {/* Engagement Timeline Chart */}
        <ProCard className="mb-12">
          <ProHeader
            title="Engagement Dynamics"
            icon={Activity}
            subtitle="Syncs & Tempo Feedback"
          />
          <div className="p-10">
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    wrapperStyle={{ paddingBottom: "30px", fontSize: "9px", fontWeight: "900" }}
                    formatter={(value) => (
                      <span className="text-slate-500 uppercase tracking-widest">{value}</span>
                    )}
                  />
                  <Bar dataKey="likes" name="Syncs" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar
                    dataKey="slower"
                    name="Slower"
                    stackId="tempo"
                    fill="#3b82f6"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="perfect"
                    name="Perfect"
                    stackId="tempo"
                    fill="#22c55e"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="faster"
                    name="Faster"
                    stackId="tempo"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ProCard>

        {/* Tempo Breakdown Chart */}
        <ProCard className="mb-12">
          <ProHeader title="Rhythm Distribution" icon={Zap} subtitle="Global Sentiment" />
          <div className="p-10">
            <div className="grid grid-cols-3 gap-8 mb-10">
              <div className="flex flex-col items-center p-6 bg-blue-500/5 rounded-[2rem] border border-blue-500/10">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center text-xl mb-3">
                  🐢
                </div>
                <div className="text-3xl font-black text-blue-400 italic mb-1">{totalSlower}</div>
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Slower Votes
                </div>
              </div>
              <div className="flex flex-col items-center p-6 bg-green-500/5 rounded-[2rem] border border-green-500/10">
                <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center text-xl mb-3">
                  ✅
                </div>
                <div className="text-3xl font-black text-green-400 italic mb-1">{totalPerfect}</div>
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Perfect Votes
                </div>
              </div>
              <div className="flex flex-col items-center p-6 bg-orange-500/5 rounded-[2rem] border border-orange-500/10">
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center text-xl mb-3">
                  🐇
                </div>
                <div className="text-3xl font-black text-orange-400 italic mb-1">{totalFaster}</div>
                <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                  Faster Votes
                </div>
              </div>
            </div>

            {/* Tempo Issues Alert */}
            {tempoIssues.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-4 h-4 text-amber-500" />
                  <h3 className="text-amber-500 font-black uppercase text-[10px] tracking-widest">
                    Tempo Alerts Detected
                  </h3>
                </div>
                <div className="grid gap-3">
                  {tempoIssues.map((track) => (
                    <div
                      key={track.position}
                      className="flex items-center justify-between text-[11px] bg-slate-900/50 p-3 rounded-xl border border-slate-800"
                    >
                      <span className="text-slate-300 font-bold uppercase truncate max-w-[70%]">
                        {track.fullTitle}
                      </span>
                      <div className="flex items-center gap-2">
                        {track.slower > track.faster ? (
                          <VibeBadge variant="purple" className="text-[9px] px-2 shadow-sm">
                            TURTLE MODE
                          </VibeBadge>
                        ) : (
                          <VibeBadge variant="amber" className="text-[9px] px-2 shadow-sm">
                            RABBIT MODE
                          </VibeBadge>
                        )}
                        <span className="text-slate-500 font-black italic">
                          {Math.max(track.slower, track.faster)} VOTES
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ProCard>

        {/* Engagement Trend Chart */}
        <ProCard className="mb-12">
          <ProHeader title="Momentum Index" icon={Flame} subtitle="Cumulative Interaction" />
          <div className="p-10">
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={chartData.map((d, i) => ({
                    ...d,
                    cumulativeLikes: chartData.slice(0, i + 1).reduce((sum, x) => sum + x.likes, 0),
                    cumulativeEngagement: chartData
                      .slice(0, i + 1)
                      .reduce((sum, x) => sum + x.totalEngagement, 0),
                  }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                >
                  <defs>
                    <linearGradient id="engagementGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="cumulativeEngagement"
                    name="Total Interaction"
                    stroke="#a855f7"
                    fill="url(#engagementGradient)"
                    strokeWidth={3}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulativeLikes"
                    name="Heart Signals"
                    stroke="#ef4444"
                    fill="transparent"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ProCard>

        {/* BPM Timeline Chart */}
        {chartData.some((d) => d.bpm) && (
          <ProCard className="mb-12">
            <ProHeader title="Tempo Propagation" icon={Activity} subtitle="BPM Progression" />
            <div className="p-10">
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <defs>
                      <linearGradient id="bpmGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="name"
                      stroke="#475569"
                      tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                      angle={-45}
                      textAnchor="end"
                      height={60}
                      axisLine={false}
                    />
                    <YAxis
                      stroke="#475569"
                      tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                      domain={["dataMin - 10", "dataMax + 10"]}
                      axisLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="bpm"
                      name="BPM"
                      stroke="#f97316"
                      fill="url(#bpmGradient)"
                      strokeWidth={4}
                      dot={{ fill: "#f97316", strokeWidth: 2, r: 4 }}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* BPM Stats */}
              <div className="grid grid-cols-3 gap-6 mt-8">
                <div className="text-center p-6 bg-slate-900 rounded-3xl border border-slate-800">
                  <div className="text-2xl font-black text-orange-400 italic leading-none mb-2">
                    {Math.min(...chartData.filter((d) => d.bpm).map((d) => d.bpm || 0))}
                  </div>
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Min BPM
                  </div>
                </div>
                <div className="text-center p-6 bg-slate-900 rounded-3xl border border-slate-800">
                  <div className="text-2xl font-black text-orange-400 italic leading-none mb-2">
                    {Math.round(
                      chartData.filter((d) => d.bpm).reduce((sum, d) => sum + (d.bpm || 0), 0) /
                        chartData.filter((d) => d.bpm).length || 0,
                    )}
                  </div>
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Avg BPM
                  </div>
                </div>
                <div className="text-center p-6 bg-slate-900 rounded-3xl border border-slate-800">
                  <div className="text-2xl font-black text-orange-400 italic leading-none mb-2">
                    {Math.max(...chartData.filter((d) => d.bpm).map((d) => d.bpm || 0))}
                  </div>
                  <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest">
                    Max BPM
                  </div>
                </div>
              </div>
            </div>
          </ProCard>
        )}

        {/* Energy Wave Chart */}
        <ProCard className="mb-12">
          <ProHeader title="Energy Signature" icon={BarChart3} subtitle="Composite Flow" />
          <div className="p-10">
            <div className="h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                >
                  <defs>
                    <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#a855f7" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#ec4899" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    axisLine={false}
                  />
                  <YAxis
                    stroke="#475569"
                    tick={{ fill: "#64748b", fontSize: 9, fontWeight: 900 }}
                    axisLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="step"
                    dataKey="energy"
                    name="Energy Multiplier"
                    stroke="#a855f7"
                    fill="url(#energyGradient)"
                    strokeWidth={3}
                  />
                  <Bar
                    dataKey="likes"
                    name="Engagement"
                    fill="#ef4444"
                    radius={[4, 4, 0, 0]}
                    opacity={0.6}
                  />
                  <Line
                    type="monotone"
                    dataKey="bpm"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
        </ProCard>

        {/* Polls Results Section */}
        {recap.polls && recap.polls.length > 0 && (
          <ProCard className="mb-12">
            <ProHeader title="Public Sentiment" icon={BarChart3} subtitle="Live Poll Results" />
            <div className="p-10">
              <div className="grid gap-12">
                {recap.polls.map(
                  (poll: PollResult): React.ReactNode => (
                    <div key={poll.id} className="relative">
                      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                        <div>
                          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">
                            {poll.question}
                          </h3>
                          <div className="flex items-center gap-3">
                            {poll.currentTrack && (
                              <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest flex items-center gap-1.5">
                                <Music2 className="w-3 h-3" />
                                During: {poll.currentTrack.title}
                              </span>
                            )}
                            <span className="text-[10px] font-black uppercase text-purple-500/50 tracking-widest flex items-center gap-1.5">
                              <Clock className="w-3 h-3" />
                              {new Date(poll.startedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {poll.totalVotes} Total Broadcasts
                        </div>
                      </div>

                      <div className="grid gap-6">
                        {poll.options.map((option: string, idx: number) => {
                          const votes = poll.votes[idx] ?? 0;
                          const percentage =
                            poll.totalVotes > 0 ? Math.round((votes / poll.totalVotes) * 100) : 0;
                          const isWinner = idx === poll.winnerIndex;
                          return (
                            <div key={idx} className="relative">
                              <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-2">
                                  {isWinner && <Trophy className="w-4 h-4 text-amber-500" />}
                                  <span
                                    className={`text-sm font-black uppercase tracking-tight ${isWinner ? "text-white italic" : "text-slate-500"}`}
                                  >
                                    {option}
                                  </span>
                                </div>
                                <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                  {votes} SYNC ({percentage}%)
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-900 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-all duration-1000 ${isWinner ? "bg-gradient-to-r from-amber-500 to-yellow-400" : "bg-gradient-to-r from-purple-600 to-indigo-600"}`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </ProCard>
        )}
      </div>
    </div>
  );
}
