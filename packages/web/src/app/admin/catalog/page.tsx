"use client";

/**
 * Admin "Songs Catalog" (B3) — read-only visualizer over the seeded repertoire. Makes the CSV-seeded
 * data legible: feature distributions (tempo / key / energy), coverage, per-DJ counts, and the tracks
 * curated by more than one DJ (cross-DJ overlap = the analytics-moat signal). Pure reads.
 */

import { useEffect, useState } from "react";
import { type AdminCatalog, getCatalog } from "@/lib/admin";
import { SongsBrowser } from "./SongsBrowser";

const PITCH = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

function pct(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function Card({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl bg-slate-900 px-4 py-3">
      <div className="text-2xl font-semibold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-600">{sub}</div>}
    </div>
  );
}

const CHART_H = 144; // px — bars sized in absolute px so they don't depend on parent-height resolution

function Bars({ title, data }: { title: string; data: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-2xl bg-slate-900 p-4">
      <div className="mb-3 text-sm font-medium text-slate-200">{title}</div>
      <div className="mb-1 flex items-end gap-1" style={{ height: CHART_H }}>
        {data.map((d) => (
          <div
            key={d.label}
            className="flex-1 rounded-t bg-purple-600/80"
            style={{ height: Math.max(2, Math.round((d.value / max) * CHART_H)) }}
            title={`${d.label}: ${d.value}`}
          />
        ))}
      </div>
      <div className="flex gap-1">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[10px] text-slate-500">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminCatalogPage() {
  const [cat, setCat] = useState<AdminCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCatalog()
      .then(setCat)
      .catch(() => setError("Couldn't load catalog."));
  }, []);

  if (error) return <div className="text-sm text-amber-300">{error}</div>;
  if (!cat) return <div className="text-sm text-slate-500">Loading…</div>;

  const { totals, coverage } = cat;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-white">Songs Catalog</h1>
        <p className="mt-1 text-sm text-slate-500">
          Seeded repertoire across all DJs — canonical Spotify features and cross-DJ overlap.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Unique tracks" value={totals.tracks} />
        <Card
          label="With features"
          value={totals.features}
          sub={`${pct(coverage.tempo, totals.features)} tempo · ${pct(coverage.genres, totals.features)} genres`}
        />
        <Card label="DJs curating" value={totals.djs} />
        <Card label="Cross-DJ overlap" value={totals.overlap} sub="curated by ≥2 DJs" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Bars
          title="Tempo (BPM)"
          data={cat.tempo.map((t) => ({ label: String(t.bucket), value: t.count }))}
        />
        <Bars
          title="Key"
          data={cat.keys.map((k) => ({ label: PITCH[k.key] ?? String(k.key), value: k.count }))}
        />
        <Bars
          title="Energy"
          data={cat.energy.map((e) => ({ label: e.bucket.toFixed(1), value: e.count }))}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl bg-slate-900 p-4">
          <div className="mb-3 text-sm font-medium text-slate-200">Tracks per DJ</div>
          <ul className="space-y-1 text-sm">
            {cat.perDj.map((d) => (
              <li key={d.djName} className="flex justify-between">
                <span className="truncate text-slate-300">{d.djName}</span>
                <span className="text-slate-500">{d.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-slate-900 p-4">
          <div className="mb-3 text-sm font-medium text-slate-200">
            Most-shared tracks (across DJs)
          </div>
          {cat.topOverlap.length === 0 ? (
            <div className="text-xs text-slate-600">No tracks curated by more than one DJ yet.</div>
          ) : (
            <ul className="space-y-1 text-sm">
              {cat.topOverlap.map((t) => (
                <li key={`${t.artists}-${t.name}`} className="flex items-baseline gap-2">
                  <span className="shrink-0 rounded bg-purple-600/20 px-1.5 text-xs text-purple-300">
                    {t.djCount} DJs
                  </span>
                  <span className="truncate text-slate-300">
                    {t.artists} – {t.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-600">
        Generated {new Date(cat.generatedAt).toLocaleString()}
      </div>

      <SongsBrowser />
    </div>
  );
}
