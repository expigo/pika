"use client";

import { useEffect, useState } from "react";
import { use } from "react";
import { Radio, User, Calendar, Music2, Clock, ExternalLink } from "lucide-react";
import Link from "next/link";

// API base URL
function getApiBaseUrl(): string {
    if (typeof window === "undefined") return "";
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
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
    return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
    }) + " @ " + date.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
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
                    if (response.status === 404) {
                        setError("DJ not found");
                    } else {
                        setError("Failed to load profile");
                    }
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
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-slate-400 animate-pulse">Loading profile...</div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center">
                    <User className="w-20 h-20 text-slate-700 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-slate-300 mb-2">DJ Not Found</h1>
                    <p className="text-slate-500 mb-6">
                        We couldn&apos;t find a DJ with that name.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                    >
                        Go Home
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                {/* Profile Header */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden mb-6">
                    {/* Top Bar */}
                    <div className="px-6 py-4 border-b border-slate-700/50 flex items-center gap-3">
                        <Radio className="w-6 h-6 text-red-500" />
                        <h1 className="text-xl font-bold text-white">
                            Pika! <span className="text-slate-500">DJ Profile</span>
                        </h1>
                    </div>

                    {/* DJ Info */}
                    <div className="px-6 py-8 text-center">
                        <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-orange-500 to-pink-500 rounded-full mb-4">
                            <User className="w-10 h-10 text-white" />
                        </div>
                        <h2 className="text-3xl font-bold text-white mb-4">{profile.djName}</h2>

                        {/* Stats */}
                        <div className="flex justify-center gap-8">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">{profile.totalSessions}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wide">Sessions</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-white">{profile.totalTracks}</div>
                                <div className="text-xs text-slate-500 uppercase tracking-wide">Tracks Played</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sessions List */}
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl border border-slate-700/50 shadow-2xl overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-700/50">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-slate-400" />
                            Recent Sessions
                        </h3>
                    </div>

                    {profile.sessions.length === 0 ? (
                        <div className="px-6 py-8 text-center text-slate-500">
                            No sessions yet
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-700/30">
                            {profile.sessions.map((session) => (
                                <Link
                                    key={session.id}
                                    href={`/dj/${slug}/recap/${session.id}`}
                                    className="px-6 py-4 flex items-center gap-4 hover:bg-slate-700/20 transition-colors group"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-medium">
                                            {formatDate(session.startedAt)}
                                        </p>
                                        <div className="flex items-center gap-3 text-slate-500 text-sm mt-1">
                                            <span className="flex items-center gap-1">
                                                <Music2 className="w-3.5 h-3.5" />
                                                {session.trackCount} tracks
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5" />
                                                {formatDuration(session.startedAt, session.endedAt)}
                                            </span>
                                        </div>
                                    </div>
                                    <ExternalLink className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                                </Link>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="text-center mt-8 text-slate-600 text-sm">
                    <p>Powered by Pika! 🎧</p>
                </div>
            </div>
        </div>
    );
}
