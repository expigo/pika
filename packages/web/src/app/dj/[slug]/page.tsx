"use client";

import { logger } from "@pika/shared";
import {
  ArrowRight,
  CalendarDays,
  Clock,
  ExternalLink,
  History,
  ListMusic,
  Music2,
  User,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { CompatCard } from "@/components/CompatCard";
import { FollowButton } from "@/components/FollowButton";
import { SignatureCard } from "@/components/SignatureCard";
import { SpotifyPlaylistEmbed } from "@/components/SpotifyPlaylistEmbed";
import { ProCard } from "@/components/ui/ProCard";
import { TrackRow } from "@/components/ui/TrackRow";
import { getApiBaseUrl } from "@/lib/api";
import { type DjSignatureData, getMe } from "@/lib/djLive";
import { trackEvent } from "@/lib/events";

interface DjSession {
  id: string;
  djName: string;
  startedAt: string;
  endedAt: string | null;
  trackCount: number;
  // Playlist sync: set when the DJ shared this set's Spotify playlist → a badge linking to the recap.
  spotifyPlaylistId?: string | null;
}

interface DjPlaylist {
  id: number;
  url: string;
  spotifyPlaylistId: string | null;
  /** oEmbed display title (D.1) — optional for stale cached payloads; null when unfetched. */
  title?: string | null;
}

/** A DJ-authored upcoming gig (Slice C) — structured one-liner, not an organizer model. */
interface DjGig {
  id: number;
  date: string; // YYYY-MM-DD
  title: string;
  city: string | null;
  url: string | null;
}

/** A promoted native playlist (Slice D) — provenance drives the badge. */
interface BoothPlaylist {
  id: number;
  name: string;
  label: string | null;
  kind: string | null;
  source: string; // 'profile' → "⚡ Played live on Pika", 'csv' → "DJ's pick"
  spotifyUrl: string | null;
  trackCount: number;
  tracks: {
    title: string;
    artist: string;
    albumArtUrl: string | null;
    spotifyUrl: string;
  }[];
}

interface DjProfile {
  slug: string;
  djName: string;
  bio?: string | null; // Booth bio (Slice C)
  gigs?: DjGig[]; // upcoming gigs (Slice C)
  followerCount?: number; // present ONLY when the DJ opted into public display
  // Slice D — OPTIONAL: a ≤60s stale cached payload across a deploy must not break typing.
  signature?: DjSignatureData | null;
  boothPlaylists?: BoothPlaylist[];
  sessions: DjSession[];
  totalSessions: number;
  totalTracks: number;
  playlists?: DjPlaylist[]; // optional: tolerate a stale cached payload from before the deploy
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

function formatGigDate(dateString: string): string {
  // Date-only string — pin to local midnight so the shown day never shifts across timezones.
  const date = new Date(`${dateString}T00:00:00`);
  return date
    .toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
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
  const [isOwner, setIsOwner] = useState(false);
  const viewedFired = useRef(false);

  // Owner detection: the Booth is public; editing lives on /dj/booth (ProfileManager).
  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled && me !== null && me.slug === slug) setIsOwner(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (viewedFired.current) return;
    viewedFired.current = true;
    const ref = new URLSearchParams(window.location.search).get("ref");
    trackEvent("booth_viewed", { slug, ...(ref ? { ref } : {}) });
  }, [slug]);

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

      <div className="relative max-w-2xl lg:max-w-5xl mx-auto px-4 py-20">
        {/* PROFILE HEADER CARD */}
        <ProCard className="mb-12 p-12 text-center" glow glowColor="purple-500" align="center">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 rounded-[2.5rem] mb-6 shadow-2xl shadow-purple-500/20">
            <User className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl font-black text-white mb-6 tracking-tighter italic uppercase leading-none">
            {profile.djName}.
          </h1>
          {profile.bio && (
            <p className="text-slate-400 text-sm font-medium leading-relaxed max-w-md mx-auto mb-6 whitespace-pre-line">
              {profile.bio}
            </p>
          )}
          <div className="flex items-center justify-center gap-3 mb-6 flex-wrap">
            <FollowButton slug={profile.slug} djName={profile.djName} source="booth" />
            {typeof profile.followerCount === "number" && (
              <span className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/10 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                {profile.followerCount} follower{profile.followerCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {isOwner && (
            <Link
              href="/dj/booth"
              className="inline-block mb-6 text-[10px] font-black text-purple-400/80 uppercase tracking-widest hover:text-purple-300 transition-colors"
            >
              Manage your booth →
            </Link>
          )}
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

        {/* D.1 desktop: two columns at lg — main cards left, gigs pinned right. Every card keeps
            its DOM position (per-item col-start, no container split), so the mobile order and
            screen-reader order stay exactly as before. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-8 lg:items-start">
          {/* SIGNATURE (Slice D) — the honest, computed "what to expect"; null below the floors
            or when the DJ hid it. The denominator inside the card is load-bearing. */}
          {profile.signature && (
            <div className="min-w-0 lg:col-start-1">
              <SignatureCard signature={profile.signature} />
            </div>
          )}

          {/* YOUR MATCH (Slice D) — per-viewer, fetched via /api/me (never the cached payload) */}
          <div className="min-w-0 lg:col-start-1">
            <CompatCard slug={profile.slug} djName={profile.djName} />
          </div>

          {/* PLAYLISTS (Slice D + D.1) — ONE music section: native promoted lists first (the data
            we own, provenance badges), then external embeds as named collapsed rows. */}
          {((profile.boothPlaylists?.length ?? 0) > 0 || (profile.playlists?.length ?? 0) > 0) && (
            <div className="min-w-0 lg:col-start-1">
              <ProCard className="mb-8">
                <div className="px-8 sm:px-12 py-6 border-b border-white/[0.03] flex items-center gap-4 bg-white/[0.02]">
                  <ListMusic className="w-4 h-4 text-purple-500" />
                  <h3 className="font-black text-white italic uppercase tracking-widest text-xs">
                    Crates &amp; Sets.
                  </h3>
                </div>
                <div className="divide-y divide-white/[0.03]">
                  {profile.boothPlaylists?.map((pl) => (
                    <div key={pl.id} className="px-6 sm:px-10 py-6">
                      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="text-white font-black uppercase italic tracking-tight truncate">
                            {pl.name}
                          </p>
                          {pl.source === "profile" ? (
                            <span className="flex items-center gap-1 rounded-md bg-emerald-600/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-400 shrink-0">
                              <Zap className="w-2.5 h-2.5" /> Played live on Pika
                            </span>
                          ) : (
                            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                              DJ&apos;s pick
                            </span>
                          )}
                        </div>
                        {pl.spotifyUrl && (
                          <a
                            href={pl.spotifyUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[9px] font-black text-emerald-500/80 uppercase tracking-widest hover:text-emerald-400 transition-colors shrink-0"
                          >
                            <ExternalLink className="w-3 h-3" /> Spotify
                          </a>
                        )}
                      </div>
                      {pl.label && (
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-3">
                          {pl.label}
                          {pl.kind ? ` · ${pl.kind}` : ""}
                        </p>
                      )}
                      <div className="space-y-1">
                        {pl.tracks.map((t) => (
                          <TrackRow
                            key={`${pl.id}-${t.spotifyUrl}`}
                            title={t.title}
                            artist={t.artist}
                            albumArtUrl={t.albumArtUrl}
                            spotifyUrl={t.spotifyUrl}
                          />
                        ))}
                      </div>
                      {pl.trackCount > pl.tracks.length && (
                        <p className="mt-2 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                          +{pl.trackCount - pl.tracks.length} more tracks
                        </p>
                      )}
                    </div>
                  ))}
                  {/* External embeds (Slice 5, merged here in D.1) — named rows, player behind a tap.
                  No provenance badge: an external embed is neither witnessed-live nor imported. */}
                  {profile.playlists?.map((pl) =>
                    pl.spotifyPlaylistId ? (
                      <div key={`embed-${pl.id}`} className="px-6 sm:px-10 py-6">
                        <div className="flex items-center gap-2 mb-3 min-w-0">
                          <p className="text-white font-black uppercase italic tracking-tight truncate">
                            {pl.title ?? `${profile.djName} playlist`}
                          </p>
                          <span className="flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-slate-400 shrink-0">
                            <Music2 className="w-2.5 h-2.5" /> Spotify playlist
                          </span>
                        </div>
                        <SpotifyPlaylistEmbed
                          spotifyPlaylistId={pl.spotifyPlaylistId}
                          title={pl.title ?? `${profile.djName} playlist`}
                          collapsed
                        />
                      </div>
                    ) : null,
                  )}
                </div>
              </ProCard>
            </div>
          )}

          {/* UPCOMING GIGS (Slice C) — DJ-authored one-liners; the night-planning hook.
            At lg it becomes the sticky right-hand aside (dancers plan the night around it). */}
          {profile.gigs && profile.gigs.length > 0 && (
            <div className="min-w-0 lg:col-start-2 lg:row-start-1 lg:row-span-4 lg:sticky lg:top-8">
              <ProCard className="mb-8">
                <div className="px-8 sm:px-12 py-6 border-b border-white/[0.03] flex items-center gap-4 bg-white/[0.02]">
                  <CalendarDays className="w-4 h-4 text-purple-500" />
                  <h3 className="font-black text-white italic uppercase tracking-widest text-xs">
                    Upcoming Gigs.
                  </h3>
                </div>
                <div className="divide-y divide-white/[0.03]">
                  {profile.gigs.map((gig) => (
                    <div
                      key={gig.id}
                      className="px-8 sm:px-12 py-6 flex items-center justify-between gap-4"
                    >
                      <div className="min-w-0">
                        <p className="text-white font-black uppercase italic tracking-tight truncate">
                          {gig.title}
                        </p>
                        <p className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em] mt-1">
                          {formatGigDate(gig.date)}
                          {gig.city ? ` · ${gig.city}` : ""}
                        </p>
                      </div>
                      {gig.url && (
                        <a
                          href={gig.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => trackEvent("gig_link_clicked", { slug })}
                          aria-label={`${gig.title} details`}
                          className="p-3 rounded-xl border border-white/5 bg-white/5 text-slate-500 hover:text-white hover:border-purple-500/30 hover:bg-purple-500/10 transition-all shrink-0"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </ProCard>
            </div>
          )}

          {/* RECENT SESSIONS LIST */}
          <div className="min-w-0 lg:col-start-1">
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
                          {session.spotifyPlaylistId && (
                            <span className="flex items-center gap-2 text-emerald-500/70 group-hover:text-emerald-400 transition-colors">
                              <ListMusic className="w-3 h-3" />
                              Playlist
                            </span>
                          )}
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
          </div>
        </div>

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
