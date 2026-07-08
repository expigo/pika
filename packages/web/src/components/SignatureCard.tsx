"use client";

import { Fingerprint } from "lucide-react";
import type { DjSignatureData } from "@/lib/djLive";
import { SignatureRadar } from "./SignatureRadar";
import { ProCard } from "./ui/ProCard";
import { VibeBadge } from "./ui/VibeBadge";

interface SignatureCardProps {
  signature: DjSignatureData;
  /** Manager-preview mode: same card, framed as "what dancers will see". */
  preview?: boolean;
}

/** One 0–1 metric row: p25–p75 band on a track, median tick, % labels. Range, never a number. */
function BandRow({
  label,
  band,
}: {
  label: string;
  band: { p25: number; median: number; p75: number };
}) {
  const pct = (v: number) => Math.round(v * 100);
  return (
    <div className="flex items-center gap-4">
      <span className="w-28 shrink-0 text-left text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">
        {label}
      </span>
      <div className="relative h-2 flex-1 rounded-full bg-slate-800/60 overflow-hidden">
        <div
          className="absolute inset-y-0 rounded-full bg-purple-500/40"
          style={{
            left: `${pct(band.p25)}%`,
            width: `${Math.max(pct(band.p75) - pct(band.p25), 2)}%`,
          }}
        />
        <div
          className="absolute inset-y-0 w-[2px] bg-purple-300"
          style={{ left: `${pct(band.median)}%` }}
        />
      </div>
      <span className="w-20 shrink-0 text-right text-[10px] font-black text-slate-400 tabular-nums">
        {pct(band.p25)}–{pct(band.p75)}%
      </span>
    </div>
  );
}

/**
 * The Signature (Slice D) — the honest, computed "what to expect from this DJ". Ranges from
 * percentiles, never single numbers ("signature, never a box"), and the denominator line is
 * LOAD-BEARING: it always ships with the card so thinness stays visible (honesty is socially
 * enforced — the sample size is what makes that possible).
 */
export function SignatureCard({ signature, preview = false }: SignatureCardProps) {
  const s = signature;
  const setsWord = s.contexts.live === 1 ? "live set" : "live sets";
  const listsWord = s.contexts.imported === 1 ? "imported playlist" : "imported playlists";
  // Stale-cache tolerance: a ≤60s pre-D.1 payload has no per-source counts — fall back to the
  // old denominator instead of printing "undefined tracks".
  const hasSplit = s.contexts.liveTracks != null && s.contexts.importedTracks != null;

  return (
    <ProCard className="mb-8 p-8 sm:p-10" glow glowColor="purple-500">
      <div className="flex items-center gap-3 mb-6">
        <Fingerprint className="w-4 h-4 text-purple-500" />
        <h3 className="font-black text-white italic uppercase tracking-widest text-xs">
          {preview ? "Signature (preview)." : "Signature."}
        </h3>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-6">
        <VibeBadge variant="purple">
          {s.tempo.p25}–{s.tempo.p75} BPM core
        </VibeBadge>
        <VibeBadge variant="slate">
          {s.tempo.min}–{s.tempo.max} full range
        </VibeBadge>
        {s.eras.map((era) => (
          <VibeBadge key={era.decade} variant="amber">
            {era.decade} · {Math.round(era.share * 100)}%
          </VibeBadge>
        ))}
      </div>

      {/* Radar only with a full 4-axis corpus — never a fake zero axis (band ring, no polygon). */}
      {s.acousticness && (
        <div className="flex justify-center mb-6">
          <SignatureRadar
            energy={s.energy}
            danceability={s.danceability}
            valence={s.valence}
            acousticness={s.acousticness}
          />
        </div>
      )}

      <div className="space-y-3 mb-6">
        <BandRow label="Energy" band={s.energy} />
        <BandRow label="Danceability" band={s.danceability} />
        <BandRow label="Mood (valence)" band={s.valence} />
        {s.acousticness && <BandRow label="Acoustic" band={s.acousticness} />}
      </div>

      {/* The LOAD-BEARING denominator — never remove; it's what keeps the card honest. */}
      <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em]">
        {hasSplit ? (
          <>
            Based on {s.contexts.live} {setsWord} ({s.contexts.liveTracks} tracks) ·{" "}
            {s.contexts.imported} {listsWord} ({s.contexts.importedTracks} tracks) ·{" "}
            {Math.round(s.coverage * 100)}% feature coverage
          </>
        ) : (
          <>
            Based on {s.contexts.live} {setsWord} · {s.contexts.imported} {listsWord} ·{" "}
            {s.featuredTracks} tracks · {Math.round(s.coverage * 100)}% feature coverage
          </>
        )}
      </p>
    </ProCard>
  );
}
