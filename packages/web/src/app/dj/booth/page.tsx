"use client";

import Link from "next/link";
import { BoothManager } from "@/components/BoothManager";
import { CrowdPleasers } from "@/components/CrowdPleasers";
import { DjWorkspaceNav } from "@/components/DjWorkspaceNav";
import { LogoutButton } from "@/components/LogoutButton";
import { PlaylistManager } from "@/components/PlaylistManager";
import { ProfileManager } from "@/components/ProfileManager";
import { useDjMe } from "@/lib/useDjMe";

/**
 * /dj/booth — the DJ's management workspace (D.1 split): profile, booth editor, playlists and
 * crowd-pleasers, split off /dj/live so Broadcast stays a focused live surface (progressive
 * disclosure: manage here, go live there — the pill-nav keeps each one tap away).
 */

const shell =
  "min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center px-6 py-10 gap-6";

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className={`${shell} justify-center text-center`}>
      <div className="max-w-md">{children}</div>
    </main>
  );
}

export default function DjBoothPage() {
  const { phase, user } = useDjMe();

  if (phase === "loading") return <Centered>Loading…</Centered>;

  if (phase === "anon") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold mb-3">Sign in to manage your booth</h1>
        <p className="text-slate-400 mb-6">Log in to edit your public page, playlists and gigs.</p>
        <Link href="/dj/login" className="text-purple-400 underline">
          Go to DJ login →
        </Link>
      </Centered>
    );
  }

  if (phase === "pending") {
    return (
      <Centered>
        <h1 className="text-xl font-semibold mb-3">Account awaiting approval</h1>
        <p className="text-slate-400">
          Thanks for registering{user ? `, ${user.displayName}` : ""}. An organizer needs to approve
          your account before you can manage your booth.
        </p>
      </Centered>
    );
  }

  return (
    <main className={shell}>
      <div className="w-full max-w-lg lg:max-w-5xl flex flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Booth</h1>
          <div className="flex items-center gap-4">
            {user && <span className="text-sm text-slate-400">{user.displayName}</span>}
            <LogoutButton />
          </div>
        </header>

        <DjWorkspaceNav slug={user?.slug} />

        {/* Two columns at lg; the column stacking keeps today's mobile order:
            profile → booth → playlists → crowd-pleasers. */}
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-6">
            {user && <ProfileManager user={user} />}
            {user && <BoothManager />}
          </div>
          <div className="flex flex-col gap-6">
            {user && <PlaylistManager />}
            {user && <CrowdPleasers />}
          </div>
        </div>
      </div>
    </main>
  );
}
