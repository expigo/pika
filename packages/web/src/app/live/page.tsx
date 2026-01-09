"use client";

import { useState, useEffect } from "react";
import { LivePlayer } from "@/components/LivePlayer";
import { Radio, Users, Music2, ChevronRight } from "lucide-react";

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
}

interface SessionsResponse {
    live: boolean;
    count: number;
    sessions: ActiveSession[];
}

/**
 * /live - Join a live DJ session
 * 
 * If multiple DJs are live, shows a session picker.
 * If only one DJ is live, auto-joins that session.
 */
export default function LivePage() {
    const [sessions, setSessions] = useState<ActiveSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

    // Fetch active sessions on mount
    useEffect(() => {
        const fetchSessions = async () => {
            try {
                const apiUrl = process.env["NEXT_PUBLIC_CLOUD_API_URL"] || "http://localhost:3001";
                const response = await fetch(`${apiUrl}/api/sessions/active`);
                if (response.ok) {
                    const data: SessionsResponse = await response.json();
                    setSessions(data.sessions || []);

                    // Auto-select if only one session
                    if (data.sessions?.length === 1) {
                        setSelectedSessionId(data.sessions[0].sessionId);
                    }
                }
            } catch (error) {
                console.error("Failed to fetch sessions:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchSessions();
    }, []);

    // If a session is selected, show the player
    if (selectedSessionId) {
        return <LivePlayer targetSessionId={selectedSessionId} />;
    }

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="text-center">
                    <Radio className="w-12 h-12 text-purple-400 animate-pulse mx-auto mb-4" />
                    <p className="text-slate-400">Finding live sessions...</p>
                </div>
            </div>
        );
    }

    // No sessions
    if (sessions.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="w-20 h-20 rounded-full bg-slate-800/50 flex items-center justify-center mx-auto mb-6">
                        <Radio className="w-10 h-10 text-slate-500" />
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-3">No Live Sessions</h1>
                    <p className="text-slate-400 mb-6">
                        There&apos;s no DJ streaming right now. Check back soon!
                    </p>
                    <a
                        href="/"
                        className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full transition-colors"
                    >
                        Go to Homepage
                    </a>
                </div>
            </div>
        );
    }

    // Multiple sessions - show picker
    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 p-4">
            <div className="max-w-lg mx-auto pt-8">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-2 text-red-400 mb-4">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                        </span>
                        <span className="text-sm font-medium uppercase tracking-wider">
                            {sessions.length} DJs Live
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-white mb-2">Choose a Room</h1>
                    <p className="text-slate-400">
                        Multiple DJs are streaming. Pick a session to join.
                    </p>
                </div>

                {/* Session Cards */}
                <div className="space-y-4">
                    {sessions.map((session) => (
                        <button
                            key={session.sessionId}
                            onClick={() => setSelectedSessionId(session.sessionId)}
                            className="w-full bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 hover:border-purple-500/50 rounded-xl p-4 transition-all duration-200 group text-left"
                        >
                            <div className="flex items-center gap-4">
                                {/* DJ Avatar */}
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xl font-bold text-white">
                                        {session.djName?.charAt(0) || "D"}
                                    </span>
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-semibold text-white text-lg truncate">
                                            {session.djName || "DJ"}
                                        </span>
                                        {session.listenerCount !== undefined && session.listenerCount > 0 && (
                                            <span className="flex items-center gap-1 text-xs text-slate-400">
                                                <Users className="w-3 h-3" />
                                                {session.listenerCount}
                                            </span>
                                        )}
                                    </div>

                                    {session.currentTrack ? (
                                        <div className="flex items-center gap-2">
                                            <Music2 className="w-3 h-3 text-green-400 flex-shrink-0" />
                                            <span className="text-sm text-slate-300 truncate">
                                                {session.currentTrack.title}
                                            </span>
                                            {session.currentTrack.bpm && (
                                                <span className="flex-shrink-0 px-1.5 py-0.5 bg-purple-500/20 rounded text-xs text-purple-400">
                                                    {Math.round(session.currentTrack.bpm)}
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-slate-500">Starting up...</p>
                                    )}
                                </div>

                                {/* Arrow */}
                                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-purple-400 group-hover:translate-x-1 transition-all flex-shrink-0" />
                            </div>
                        </button>
                    ))}
                </div>

                {/* Back to homepage */}
                <div className="text-center mt-8">
                    <a href="/" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
                        ← Back to homepage
                    </a>
                </div>
            </div>
        </div>
    );
}
