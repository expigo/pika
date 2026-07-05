"use client";

import { ImageDown } from "lucide-react";
import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { trackEvent } from "@/lib/events";
import { type NightCardData, renderNightCard, shareCardBlob } from "@/lib/nightCard";

// Lazy like the share-QR in LivePlayer — the lib only loads when a card is actually made.
const QRCodeCanvas = dynamic(() => import("qrcode.react").then((m) => m.QRCodeCanvas), {
  ssr: false,
});

interface NightCardButtonProps {
  data: NightCardData;
  /** QR target — the DJ's Booth when known, else the app origin. */
  qrUrl: string;
  shareText: string;
  pageUrl: string;
  /** Telemetry source tag. */
  source: string;
  className?: string;
}

/**
 * "Night Card" share button (Slice C): draws the 1080×1920 story image on demand and hands it
 * to the native share sheet (Instagram Stories appears when installed; iOS 15+), falling back
 * to a plain download. The hidden QRCodeCanvas below is the compositing source for the card's
 * QR — canvas drawing works regardless of CSS visibility.
 */
export function NightCardButton({
  data,
  qrUrl,
  shareText,
  pageUrl,
  source,
  className = "",
}: NightCardButtonProps) {
  const qrHost = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);

  const handleTap = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const qrCanvas = qrHost.current?.querySelector("canvas") ?? null;
      const blob = await renderNightCard(data, qrCanvas);
      if (!blob) return;
      trackEvent("card_generated", { source });
      const outcome = await shareCardBlob(blob, shareText, pageUrl);
      if (outcome !== "cancelled") trackEvent("card_shared", { source, outcome });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void handleTap()}
        disabled={busy}
        className={`flex items-center gap-2 px-4 py-2 hover:bg-slate-900 text-[10px] font-black text-slate-500 hover:text-white rounded-lg transition-all border border-transparent hover:border-slate-800 uppercase tracking-widest active:scale-95 disabled:opacity-50 ${className}`}
      >
        <ImageDown className="w-3.5 h-3.5" />
        {busy ? "Rendering…" : "Night Card"}
      </button>
      <div ref={qrHost} className="hidden" aria-hidden="true">
        <QRCodeCanvas value={qrUrl} size={520} level="M" />
      </div>
    </>
  );
}
