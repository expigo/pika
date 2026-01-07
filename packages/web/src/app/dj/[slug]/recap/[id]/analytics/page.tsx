"use client";

import { useEffect, useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    AreaChart,
    Area,
    ComposedChart,
    Line,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    Radar,
} from "recharts";
import { ArrowLeft, TrendingUp, Music2, Heart, Clock, Zap } from "lucide-react";
import Link from "next/link";
import { use } from "react";

// API base URL
function getApiBaseUrl(): string {
    if (typeof window === "undefined") return "";
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
}

interface TempoData {
    slower: number;
    perfect: number;
    faster: number;
}

interface RecapTrack {
    position: number;
    artist: string;
    title: string;
    bpm: number | null;
    key: string | null;
    // Fingerprint data
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
    energy: number;  // Calculated energy score
}

// Calculate tempo sentiment score (-1 to +1, where -1 = all slower, +1 = all faster)
function getTempoSentiment(tempo: TempoData | null): number {
    if (!tempo) return 0;
    const total = tempo.slower + tempo.perfect + tempo.faster;
    if (total === 0) return 0;
    return (tempo.faster - tempo.slower) / total;
}

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
    return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
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
                console.error("Failed to fetch recap:", e);
                setError("Failed to load analytics");
            } finally {
                setLoading(false);
            }
        }

        fetchRecap();
    }, [id]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-slate-400 animate-pulse">Loading analytics...</div>
            </div>
        );
    }

    if (error || !recap) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center">
                    <TrendingUp className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-slate-300 mb-2">Analytics Not Available</h1>
                    <p className="text-slate-500 mb-6">{error || "Session not found"}</p>
                    <Link
                        href={`/dj/${slug}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to DJ
                    </Link>
                </div>
            </div>
        );
    }
    // Prepare chart data with energy calculation
    // Energy is a normalized score combining BPM and engagement
    const maxBpm = Math.max(...recap.tracks.map(t => t.bpm || 0), 1);
    const minBpm = Math.min(...recap.tracks.filter(t => t.bpm).map(t => t.bpm || 0), maxBpm);

    const chartData: ChartDataPoint[] = recap.tracks.map((track) => {
        const engagement = track.likes + (track.tempo?.slower || 0) + (track.tempo?.perfect || 0) + (track.tempo?.faster || 0);
        // Normalize BPM to 0-50 range, engagement to 0-50 range
        const normalizedBpm = track.bpm
            ? ((track.bpm - minBpm) / (maxBpm - minBpm || 1)) * 50
            : 25;
        const normalizedEngagement = Math.min(engagement * 5, 50);
        const energy = normalizedBpm + normalizedEngagement;

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
        };
    });

    // Calculate summary stats
    const totalTempoVotes = chartData.reduce((sum, d) => sum + d.slower + d.perfect + d.faster, 0);
    const totalSlower = chartData.reduce((sum, d) => sum + d.slower, 0);
    const totalPerfect = chartData.reduce((sum, d) => sum + d.perfect, 0);
    const totalFaster = chartData.reduce((sum, d) => sum + d.faster, 0);

    const mostLikedTrack = chartData.reduce((max, d) => d.likes > max.likes ? d : max, chartData[0]);
    const mostEngagedTrack = chartData.reduce((max, d) => d.totalEngagement > max.totalEngagement ? d : max, chartData[0]);

    // Find tracks with tempo issues (high slower or faster votes)
    const tempoIssues = chartData.filter(d => {
        const total = d.slower + d.perfect + d.faster;
        if (total < 2) return false;
        const slowerRatio = d.slower / total;
        const fasterRatio = d.faster / total;
        return slowerRatio > 0.4 || fasterRatio > 0.4;
    });

    // Calculate set fingerprint (average of all track fingerprints)
    const tracksWithFingerprint = recap.tracks.filter(t =>
        t.energy !== null || t.danceability !== null || t.brightness !== null ||
        t.acousticness !== null || t.groove !== null
    );

    const avgFingerprint = (field: 'energy' | 'danceability' | 'brightness' | 'acousticness' | 'groove') => {
        const values = tracksWithFingerprint.map(t => t[field]).filter((v): v is number => v !== null);
        return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
    };

    const setFingerprint = [
        { metric: "Energy", value: avgFingerprint('energy'), fullMark: 100 },
        { metric: "Dance", value: avgFingerprint('danceability'), fullMark: 100 },
        { metric: "Bright", value: avgFingerprint('brightness'), fullMark: 100 },
        { metric: "Acoustic", value: avgFingerprint('acousticness'), fullMark: 100 },
        { metric: "Groove", value: avgFingerprint('groove'), fullMark: 100 },
    ];

    const hasFingerprint = setFingerprint.some(f => f.value > 0);

    // Custom tooltip - using any for recharts payload type
    const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string; payload: ChartDataPoint }> }) => {
        if (active && payload && payload.length) {
            const data = payload[0]?.payload as ChartDataPoint;
            return (
                <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl">
                    <p className="text-white font-medium text-sm mb-1">{data?.fullTitle}</p>
                    <p className="text-slate-400 text-xs mb-2">{data?.time}</p>
                    <div className="space-y-1 text-xs">
                        {payload.map((entry, index) => (
                            <div key={index} className="flex justify-between gap-4">
                                <span style={{ color: entry.color }}>{entry.name}</span>
                                <span className="text-white font-medium">{entry.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <Link
                        href={`/dj/${slug}/recap/${id}`}
                        className="inline-flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to Recap
                    </Link>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <TrendingUp className="w-8 h-8 text-purple-400" />
                        Session Analytics
                    </h1>
                    <p className="text-slate-400 mt-1">
                        {recap.djName} • {recap.trackCount} tracks • {formatTime(recap.startedAt || "")}
                    </p>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                            <Heart className="w-4 h-4" />
                            Total Likes
                        </div>
                        <div className="text-2xl font-bold text-red-400">{recap.totalLikes}</div>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                            <Zap className="w-4 h-4" />
                            Tempo Votes
                        </div>
                        <div className="text-2xl font-bold text-purple-400">{totalTempoVotes}</div>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                            <Music2 className="w-4 h-4" />
                            Most Liked
                        </div>
                        <div className="text-lg font-bold text-white truncate" title={mostLikedTrack?.fullTitle}>
                            {mostLikedTrack?.name || "-"}
                        </div>
                        <div className="text-xs text-red-400">❤️ {mostLikedTrack?.likes || 0}</div>
                    </div>
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-4">
                        <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                            <Clock className="w-4 h-4" />
                            Perfect Tempo
                        </div>
                        <div className="text-2xl font-bold text-green-400">
                            {totalTempoVotes > 0 ? Math.round((totalPerfect / totalTempoVotes) * 100) : 0}%
                        </div>
                    </div>
                </div>

                {/* Set Fingerprint Radar Chart */}
                {hasFingerprint && (
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6 mb-8">
                        <h2 className="text-xl font-bold text-white mb-4">🎵 Set Fingerprint</h2>
                        <p className="text-slate-400 text-sm mb-6">Average audio profile of this session</p>

                        <div className="flex flex-col md:flex-row items-center gap-8">
                            {/* Radar Chart */}
                            <div className="h-[280px] w-full md:w-1/2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={setFingerprint}>
                                        <PolarGrid stroke="#334155" strokeOpacity={0.5} />
                                        <PolarAngleAxis
                                            dataKey="metric"
                                            tick={{ fill: "#e2e8f0", fontSize: 12, fontWeight: 500 }}
                                            tickLine={false}
                                        />
                                        <PolarRadiusAxis
                                            angle={90}
                                            domain={[0, 100]}
                                            tick={false}
                                            axisLine={false}
                                        />
                                        <Radar
                                            name="Fingerprint"
                                            dataKey="value"
                                            stroke="#f472b6"
                                            strokeWidth={2}
                                            fill="#f472b6"
                                            fillOpacity={0.3}
                                        />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload?.length) {
                                                    const data = payload[0].payload;
                                                    return (
                                                        <div className="bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-xl">
                                                            <div className="text-slate-400 text-xs">{data.metric}</div>
                                                            <div className="text-pink-400 font-bold">{data.value}</div>
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
                            <div className="w-full md:w-1/2 grid grid-cols-2 gap-3">
                                {setFingerprint.map((f) => (
                                    <div key={f.metric} className="bg-slate-700/30 rounded-xl p-3">
                                        <div className="text-slate-400 text-xs mb-1">{f.metric}</div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-2 bg-slate-600/50 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-full transition-all"
                                                    style={{ width: `${f.value}%` }}
                                                />
                                            </div>
                                            <span className="text-white font-bold text-sm w-8 text-right">{f.value}</span>
                                        </div>
                                    </div>
                                ))}
                                <div className="col-span-2 text-center text-xs text-slate-500 mt-2">
                                    Based on {tracksWithFingerprint.length} analyzed tracks
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Engagement Timeline Chart */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6 mb-8">
                    <h2 className="text-xl font-bold text-white mb-4">Engagement Timeline</h2>
                    <p className="text-slate-400 text-sm mb-6">Likes and tempo feedback per track over the session</p>

                    <div className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="name"
                                    stroke="#64748b"
                                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis stroke="#64748b" tick={{ fill: "#94a3b8" }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ paddingTop: "20px" }}
                                    formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
                                />
                                <Bar dataKey="likes" name="Likes ❤️" fill="#ef4444" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="slower" name="Slower 🐢" stackId="tempo" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="perfect" name="Perfect ✅" stackId="tempo" fill="#22c55e" radius={[0, 0, 0, 0]} />
                                <Bar dataKey="faster" name="Faster 🐇" stackId="tempo" fill="#f97316" radius={[4, 4, 0, 0]} />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Tempo Breakdown Chart */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6 mb-8">
                    <h2 className="text-xl font-bold text-white mb-4">Tempo Preference Distribution</h2>
                    <p className="text-slate-400 text-sm mb-6">Overall tempo feedback from dancers</p>

                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="text-center p-4 bg-blue-500/10 rounded-xl border border-blue-500/30">
                            <div className="text-3xl mb-1">🐢</div>
                            <div className="text-2xl font-bold text-blue-400">{totalSlower}</div>
                            <div className="text-sm text-slate-400">Slower</div>
                        </div>
                        <div className="text-center p-4 bg-green-500/10 rounded-xl border border-green-500/30">
                            <div className="text-3xl mb-1">✅</div>
                            <div className="text-2xl font-bold text-green-400">{totalPerfect}</div>
                            <div className="text-sm text-slate-400">Perfect</div>
                        </div>
                        <div className="text-center p-4 bg-orange-500/10 rounded-xl border border-orange-500/30">
                            <div className="text-3xl mb-1">🐇</div>
                            <div className="text-2xl font-bold text-orange-400">{totalFaster}</div>
                            <div className="text-sm text-slate-400">Faster</div>
                        </div>
                    </div>

                    {/* Tempo Issues Alert */}
                    {tempoIssues.length > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                            <h3 className="text-amber-400 font-medium mb-2">⚠️ Tempo Adjustment Needed</h3>
                            <p className="text-slate-300 text-sm mb-2">These tracks had significant tempo feedback:</p>
                            <ul className="text-sm text-slate-400 space-y-1">
                                {tempoIssues.map((track) => (
                                    <li key={track.position}>
                                        <span className="text-white">{track.fullTitle}</span>
                                        {" — "}
                                        {track.slower > track.faster ? (
                                            <span className="text-blue-400">🐢 {track.slower} wanted slower</span>
                                        ) : (
                                            <span className="text-orange-400">🐇 {track.faster} wanted faster</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Cumulative Engagement Area Chart */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
                    <h2 className="text-xl font-bold text-white mb-4">Engagement Trend</h2>
                    <p className="text-slate-400 text-sm mb-6">Cumulative engagement throughout the session</p>

                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={chartData.map((d, i) => ({
                                    ...d,
                                    cumulativeLikes: chartData.slice(0, i + 1).reduce((sum, x) => sum + x.likes, 0),
                                    cumulativeEngagement: chartData.slice(0, i + 1).reduce((sum, x) => sum + x.totalEngagement, 0),
                                }))}
                                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="name"
                                    stroke="#64748b"
                                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis stroke="#64748b" tick={{ fill: "#94a3b8" }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ paddingTop: "20px" }}
                                    formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="cumulativeEngagement"
                                    name="Total Engagement"
                                    stroke="#a855f7"
                                    fill="#a855f7"
                                    fillOpacity={0.3}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="cumulativeLikes"
                                    name="Total Likes"
                                    stroke="#ef4444"
                                    fill="#ef4444"
                                    fillOpacity={0.3}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* BPM Timeline Chart */}
                {chartData.some(d => d.bpm) && (
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6 mb-8">
                        <h2 className="text-xl font-bold text-white mb-4">🎵 BPM Timeline</h2>
                        <p className="text-slate-400 text-sm mb-6">Tempo progression throughout the set</p>

                        <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart
                                    data={chartData}
                                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                                >
                                    <defs>
                                        <linearGradient id="bpmGradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#f97316" stopOpacity={0.1} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                    <XAxis
                                        dataKey="name"
                                        stroke="#64748b"
                                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                                        angle={-45}
                                        textAnchor="end"
                                        height={60}
                                    />
                                    <YAxis
                                        stroke="#64748b"
                                        tick={{ fill: "#94a3b8" }}
                                        domain={['dataMin - 10', 'dataMax + 10']}
                                        label={{ value: 'BPM', angle: -90, position: 'insideLeft', fill: '#94a3b8' }}
                                    />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Area
                                        type="monotone"
                                        dataKey="bpm"
                                        name="BPM"
                                        stroke="#f97316"
                                        fill="url(#bpmGradient)"
                                        strokeWidth={3}
                                        dot={{ fill: '#f97316', strokeWidth: 2, r: 4 }}
                                        connectNulls
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>

                        {/* BPM Stats */}
                        <div className="grid grid-cols-3 gap-4 mt-6">
                            <div className="text-center p-3 bg-slate-700/30 rounded-xl">
                                <div className="text-xl font-bold text-orange-400">
                                    {Math.min(...chartData.filter(d => d.bpm).map(d => d.bpm || 0))}
                                </div>
                                <div className="text-xs text-slate-400">Min BPM</div>
                            </div>
                            <div className="text-center p-3 bg-slate-700/30 rounded-xl">
                                <div className="text-xl font-bold text-orange-400">
                                    {Math.round(chartData.filter(d => d.bpm).reduce((sum, d) => sum + (d.bpm || 0), 0) / chartData.filter(d => d.bpm).length || 0)}
                                </div>
                                <div className="text-xs text-slate-400">Avg BPM</div>
                            </div>
                            <div className="text-center p-3 bg-slate-700/30 rounded-xl">
                                <div className="text-xl font-bold text-orange-400">
                                    {Math.max(...chartData.filter(d => d.bpm).map(d => d.bpm || 0))}
                                </div>
                                <div className="text-xs text-slate-400">Max BPM</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Energy Wave Chart */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6">
                    <h2 className="text-xl font-bold text-white mb-4">⚡ Energy Wave</h2>
                    <p className="text-slate-400 text-sm mb-6">Set flow visualization combining BPM and engagement</p>

                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart
                                data={chartData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                            >
                                <defs>
                                    <linearGradient id="energyGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                                        <stop offset="50%" stopColor="#ec4899" stopOpacity={0.5} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.1} />
                                    </linearGradient>
                                    <linearGradient id="likesGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.9} />
                                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.2} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis
                                    dataKey="name"
                                    stroke="#64748b"
                                    tick={{ fill: "#94a3b8", fontSize: 10 }}
                                    angle={-45}
                                    textAnchor="end"
                                    height={60}
                                />
                                <YAxis stroke="#64748b" tick={{ fill: "#94a3b8" }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Legend
                                    wrapperStyle={{ paddingTop: "20px" }}
                                    formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
                                />
                                <Area
                                    type="monotone"
                                    dataKey="energy"
                                    name="Energy Score"
                                    stroke="#a855f7"
                                    fill="url(#energyGradient)"
                                    strokeWidth={3}
                                />
                                <Bar
                                    dataKey="likes"
                                    name="Likes ❤️"
                                    fill="url(#likesGradient)"
                                    radius={[4, 4, 0, 0]}
                                    opacity={0.8}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="bpm"
                                    name="BPM"
                                    stroke="#f97316"
                                    strokeWidth={2}
                                    dot={false}
                                    connectNulls
                                />
                            </ComposedChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Polls Results Section */}
                {recap.polls && recap.polls.length > 0 && (
                    <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 p-6 mb-8">
                        <h2 className="text-xl font-bold text-white mb-4">📊 Poll Results</h2>
                        <p className="text-slate-400 text-sm mb-6">
                            {recap.totalPolls} poll{recap.totalPolls !== 1 ? "s" : ""} • {recap.totalPollVotes} total votes
                        </p>

                        <div className="grid gap-6">
                            {recap.polls.map((poll: PollResult): React.ReactNode => (
                                <div key={poll.id} className="bg-slate-700/30 rounded-2xl p-5">
                                    <h3 className="text-lg font-semibold text-white mb-2">{poll.question}</h3>

                                    {/* Poll context: track and time */}
                                    <div className="flex flex-wrap gap-2 mb-4 text-xs">
                                        {poll.currentTrack && (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-600/50 rounded-full text-slate-300">
                                                🎵 During: {poll.currentTrack.title}
                                            </span>
                                        )}
                                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-600/50 rounded-full text-slate-400">
                                            🕐 {new Date(poll.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>

                                    <div className="space-y-3">
                                        {poll.options.map((option: string, idx: number) => {
                                            const votes = poll.votes[idx] ?? 0;
                                            const percentage = poll.totalVotes > 0
                                                ? Math.round((votes / poll.totalVotes) * 100)
                                                : 0;
                                            const isWinner = idx === poll.winnerIndex;
                                            return (
                                                <div key={idx}>
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className={`font-medium ${isWinner ? 'text-emerald-300' : 'text-slate-300'}`}>
                                                            {isWinner && '🏆 '}{option}
                                                        </span>
                                                        <span className="text-slate-400">{votes} votes ({percentage}%)</span>
                                                    </div>
                                                    <div className="h-3 bg-slate-600/50 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${isWinner ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-gradient-to-r from-indigo-500 to-purple-500'}`}
                                                            style={{ width: `${percentage}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-4 text-xs text-slate-500">
                                        {poll.totalVotes} votes total
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
