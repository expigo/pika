"use client";

import { useCallback, useEffect, useState } from "react";
import { VibeBadge } from "@/components/ui/VibeBadge";
import { useVisibility } from "@/hooks/ui/useVisibility";
import { type AdminOverview, getOverview } from "@/lib/admin";

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl bg-slate-900 p-5">
      <div className="text-3xl font-black text-white">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-widest text-slate-500">{label}</div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState(false);
  const isVisible = useVisibility();

  const refresh = useCallback(async () => {
    try {
      setData(await getOverview());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  // Visibility-aware ~15s polling — pause when the tab is hidden.
  useEffect(() => {
    refresh();
    if (!isVisible) return;
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh, isVisible]);

  if (!data) {
    return <p className="text-slate-500">{error ? "Failed to load overview." : "Loading…"}</p>;
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Connections" value={data.connections} />
        <Stat label="Live sessions" value={data.sessions.length} />
        <Stat label="Spotify pollers" value={data.pollers.length} />
        <Stat label="Stages / Events" value={`${data.stages.length} / ${data.events.length}`} />
      </section>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-slate-500">Active sessions</h2>
        {data.sessions.length === 0 ? (
          <p className="text-slate-600">No live sessions.</p>
        ) : (
          <div className="divide-y divide-white/[0.04] rounded-2xl bg-slate-900">
            {data.sessions.map((s) => (
              <div key={s.sessionId} className="flex items-center justify-between px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white">{s.djName}</span>
                    <VibeBadge variant={s.source === "spotify" ? "green" : "slate"}>
                      {s.source}
                    </VibeBadge>
                    {s.stageName && <span className="text-xs text-slate-500">@ {s.stageName}</span>}
                  </div>
                  <div className="truncate text-sm text-slate-400">
                    {s.currentTrack ? `${s.currentTrack.title} — ${s.currentTrack.artist}` : "—"}
                  </div>
                </div>
                <div className="shrink-0 text-right text-sm text-slate-400">
                  {s.listeners} listening
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {data.stages.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs uppercase tracking-widest text-slate-500">Stages</h2>
          <div className="flex flex-wrap gap-2">
            {data.stages.map((st) => (
              <span
                key={st.id}
                className="rounded-full bg-slate-900 px-3 py-1 text-sm text-slate-300"
              >
                {st.name}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
