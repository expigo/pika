"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Radio, Music2, Heart, Clock, Calendar, User, Share2, Check, ChevronDown, ChevronUp, ArrowLeft, TrendingUp } from "lucide-react";
import Link from "next/link";

// API base URL
function getApiBaseUrl(): string {
    if (typeof window === "undefined") return "";
    return process.env.NEXT_PUBLIC_CLOUD_API_URL || "http://localhost:3001";
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
    tempo: {
        slower: number;
        perfect: number;
        faster: number;
    } | null;
}

interface SessionRecap {
    sessionId: string;
    djName: string;
    startedAt: string;
    endedAt: string;
    trackCount: number;
    totalLikes: number;
    tracks: RecapTrack[];
}

// Format date nicely
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    });
}

// Format time
function formatTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
    });
}

// Calculate duration
function formatDuration(start: string, end: string): string {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffMs = endDate.getTime() - startDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 60) return `${diffMins} min`;
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

// Convert DJ name to slug
function slugify(name: string): string {
    return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
}

interface RecapPageProps {
    params: Promise<{ slug: string; id: string }>;
}

export default function DjRecapPage({ params }: RecapPageProps) {
    const { slug, id: sessionId } = use(params);

    const [recap, setRecap] = useState<SessionRecap | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [showAllTracks, setShowAllTracks] = useState(false);

    useEffect(() => {
        async function fetchRecap() {
            try {
                const baseUrl = getApiBaseUrl();
                const response = await fetch(`${baseUrl}/api/session/${sessionId}/recap`);

                if (!response.ok) {
                    if (response.status === 404) {
                        setError("Session not found");
                    } else {
                        setError("Failed to load recap");
                    }
                    return;
                }

                const data = await response.json();
                setRecap(data);
            } catch (e) {
                console.error("Failed to fetch recap:", e);
                setError("Failed to connect to server");
            } finally {
                setLoading(false);
            }
        }

        if (sessionId) {
            fetchRecap();
        }
    }, [sessionId]);

    const handleShare = async () => {
        const url = window.location.href;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Set Recap - ${recap?.djName || "DJ"}`,
                    text: `Check out this DJ set: ${recap?.trackCount} tracks played!`,
                    url,
                });
            } catch {
                // User cancelled or error
            }
        } else {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    // Show limited tracks initially
    const INITIAL_TRACK_COUNT = 10;
    const visibleTracks = showAllTracks
        ? recap?.tracks
        : recap?.tracks.slice(0, INITIAL_TRACK_COUNT);
    const hasMoreTracks = (recap?.tracks.length || 0) > INITIAL_TRACK_COUNT;

    // Get DJ slug from recap data (for the back link)
    const djSlug = recap ? slugify(recap.djName) : slug;

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-slate-400 animate-pulse">Loading recap...</div>
            </div>
        );
    }

    if (error || !recap) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center">
                    <Radio className="w-16 h-16 text-slate-600 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-slate-300 mb-2">Session Not Found</h1>
                    <p className="text-slate-500 mb-6">This session recap may have expired or doesn&apos;t exist.</p>
                    <Link
                        href={`/dj/${slug}`}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Back to DJ Profile
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Header Card */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden mb-6">
                    {/* Top Bar */}
                    <div className="px-6 py-4 border-b border-slate-700/50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Radio className="w-6 h-6 text-red-500" />
                            <h1 className="text-xl font-bold text-white">
                                Pika! <span className="text-red-500">Recap</span>
                            </h1>
                        </div>
                        <button
                            onClick={handleShare}
                            className="flex items-center gap-2 px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 text-sm transition-colors"
                        >
                            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
                            {copied ? "Copied!" : "Share"}
                        </button>
                    </div>

                    {/* DJ Info */}
                    <div className="px-6 py-6 text-center border-b border-slate-700/50">
                        <Link
                            href={`/dj/${djSlug}`}
                            className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-4 hover:scale-105 transition-transform"
                        >
                            <User className="w-8 h-8 text-white" />
                        </Link>
                        <Link href={`/dj/${djSlug}`}>
                            <h2 className="text-2xl font-bold text-white mb-2 hover:text-purple-400 transition-colors">
                                {recap.djName}
                            </h2>
                        </Link>
                        <div className="flex items-center justify-center gap-4 text-slate-400 text-sm">
                            <span className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4" />
                                {formatDate(recap.startedAt)}
                            </span>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-3 divide-x divide-slate-700/50">
                        <div className="px-4 py-4 text-center">
                            <div className="text-2xl font-bold text-white">{recap.trackCount}</div>
                            <div className="text-xs text-slate-500 uppercase tracking-wide">Tracks</div>
                        </div>
                        <div className="px-4 py-4 text-center">
                            <div className="text-2xl font-bold text-white">
                                {formatDuration(recap.startedAt, recap.endedAt)}
                            </div>
                            <div className="text-xs text-slate-500 uppercase tracking-wide">Duration</div>
                        </div>
                        <div className="px-4 py-4 text-center">
                            <div className="text-2xl font-bold text-red-400 flex items-center justify-center gap-1">
                                <Heart className="w-5 h-5 fill-current" />
                                {recap.totalLikes}
                            </div>
                            <div className="text-xs text-slate-500 uppercase tracking-wide">Likes</div>
                        </div>
                    </div>
                </div>

                {/* Analytics Link */}
                <Link
                    href={`/dj/${slug}/recap/${sessionId}/analytics`}
                    className="block bg-gradient-to-r from-purple-500/10 to-pink-500/10 backdrop-blur-xl rounded-2xl border border-purple-500/30 hover:border-purple-500/50 p-4 mb-6 transition-all hover:shadow-lg hover:shadow-purple-500/10"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <TrendingUp className="w-6 h-6 text-purple-400" />
                            <div>
                                <div className="font-semibold text-white">View Analytics</div>
                                <div className="text-sm text-slate-400">Detailed engagement charts & tempo analysis</div>
                            </div>
                        </div>
                        <span className="text-purple-400">→</span>
                    </div>
                </Link>

                {/* Track List */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-700/50">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Music2 className="w-5 h-5 text-slate-400" />
                            Tracklist
                        </h3>
                    </div>

                    <div className="divide-y divide-slate-700/30">
                        {visibleTracks?.map((track) => (
                            <div
                                key={track.position}
                                className="px-6 py-3 flex items-center gap-4 hover:bg-slate-700/20 transition-colors"
                            >
                                <span className="text-slate-600 font-mono text-sm w-8">
                                    {String(track.position).padStart(2, "0")}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-medium truncate">{track.title}</p>
                                    <p className="text-slate-500 text-sm truncate">{track.artist}</p>
                                </div>
                                {/* Tempo feedback */}
                                {track.tempo && (track.tempo.slower > 0 || track.tempo.perfect > 0 || track.tempo.faster > 0) && (
                                    <div className="flex items-center gap-1 text-xs">
                                        {track.tempo.slower > 0 && (
                                            <span className="text-blue-400" title="Slower">
                                                🐢{track.tempo.slower}
                                            </span>
                                        )}
                                        {track.tempo.perfect > 0 && (
                                            <span className="text-green-400" title="Perfect">
                                                ✅{track.tempo.perfect}
                                            </span>
                                        )}
                                        {track.tempo.faster > 0 && (
                                            <span className="text-orange-400" title="Faster">
                                                🐇{track.tempo.faster}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {track.likes > 0 && (
                                    <span className="flex items-center gap-1 text-red-400 text-sm">
                                        <Heart className="w-3.5 h-3.5 fill-current" />
                                        {track.likes}
                                    </span>
                                )}
                                <span className="text-slate-600 text-xs">
                                    {formatTime(track.playedAt)}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Show More/Less */}
                    {hasMoreTracks && (
                        <button
                            onClick={() => setShowAllTracks(!showAllTracks)}
                            className="w-full px-6 py-3 border-t border-slate-700/50 text-slate-400 hover:text-white hover:bg-slate-700/20 transition-colors flex items-center justify-center gap-2 text-sm"
                        >
                            {showAllTracks ? (
                                <>
                                    <ChevronUp className="w-4 h-4" />
                                    Show Less
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="w-4 h-4" />
                                    Show All {recap.trackCount} Tracks
                                </>
                            )}
                        </button>
                    )}
                </div>

                {/* Back Link & Footer */}
                <div className="mt-6 text-center">
                    <Link
                        href={`/dj/${djSlug}`}
                        className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors text-sm"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        View all sessions by {recap.djName}
                    </Link>
                </div>

                <div className="text-center mt-6 text-slate-600 text-sm">
                    <p>Powered by Pika! 🎧</p>
                </div>
            </div>
        </div>
    );
}
