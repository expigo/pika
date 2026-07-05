/**
 * Night Card renderer (Slice C) — a 1080×1920 story-format share image drawn entirely
 * client-side. Album art comes through the cloud's same-origin /api/img proxy (i.scdn.co CORS
 * is unreliable, and an un-CORS'd drawImage taints the canvas → toBlob throws); on any art
 * failure the card renders art-free. The QR is composited from a QRCodeCanvas element owned by
 * the caller (NightCardButton) — no extra QR dependency.
 */

import { getApiBaseUrl } from "./api";

export interface NightCardData {
  djName: string;
  dateLabel: string;
  /** The one-line stat, e.g. "7 songs loved" or "42 ❤ from the floor". */
  headline: string;
  topTrack: { title: string; artist: string; albumArtUrl: string | null } | null;
  qrLabel: string;
}

const W = 1080;
const H = 1920;

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function loadProxiedImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // proxied same-origin-ish bytes — keeps the canvas clean
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = `${getApiBaseUrl()}/api/img?src=${encodeURIComponent(src)}`;
  });
}

/** Draw the card. Returns null only when the environment has no 2D canvas. */
export async function renderNightCard(
  data: NightCardData,
  qrCanvas: HTMLCanvasElement | null,
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background: deep slate with a purple glow (brand look, legible on any feed).
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#150c2e");
  bg.addColorStop(0.55, "#020617");
  bg.addColorStop(1, "#0b0716");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W / 2, 380, 60, W / 2, 380, 720);
  glow.addColorStop(0, "rgba(168,85,247,0.30)");
  glow.addColorStop(1, "rgba(168,85,247,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";

  ctx.fillStyle = "#c4b5fd";
  ctx.font = "900 44px system-ui, -apple-system, sans-serif";
  ctx.fillText("P I K A !", W / 2, 190);

  ctx.fillStyle = "#64748b";
  ctx.font = "700 30px system-ui, -apple-system, sans-serif";
  ctx.fillText(data.dateLabel.toUpperCase(), W / 2, 260);

  ctx.fillStyle = "#ffffff";
  ctx.font = "italic 900 92px system-ui, -apple-system, sans-serif";
  ctx.fillText(ellipsize(ctx, data.djName.toUpperCase(), W - 140), W / 2, 410);

  ctx.fillStyle = "#f472b6";
  ctx.font = "900 54px system-ui, -apple-system, sans-serif";
  ctx.fillText(ellipsize(ctx, data.headline, W - 140), W / 2, 540);

  let y = 700;
  if (data.topTrack) {
    ctx.fillStyle = "#64748b";
    ctx.font = "900 28px system-ui, -apple-system, sans-serif";
    ctx.fillText("PEAK OF THE NIGHT", W / 2, y);
    y += 70;

    const art = data.topTrack.albumArtUrl
      ? await loadProxiedImage(data.topTrack.albumArtUrl)
      : null;
    if (art) {
      const size = 340;
      const x = W / 2 - size / 2;
      ctx.save();
      roundedRectPath(ctx, x, y, size, size, 40);
      ctx.clip();
      ctx.drawImage(art, x, y, size, size);
      ctx.restore();
      y += size + 90;
    } else {
      y += 20;
    }

    ctx.fillStyle = "#ffffff";
    ctx.font = "900 52px system-ui, -apple-system, sans-serif";
    ctx.fillText(ellipsize(ctx, data.topTrack.title, W - 160), W / 2, y);
    y += 62;
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 38px system-ui, -apple-system, sans-serif";
    ctx.fillText(ellipsize(ctx, data.topTrack.artist, W - 160), W / 2, y);
  }

  if (qrCanvas) {
    const size = 260;
    const pad = 24;
    const qx = W / 2 - size / 2;
    const qy = H - 500;
    ctx.fillStyle = "#ffffff";
    roundedRectPath(ctx, qx - pad, qy - pad, size + pad * 2, size + pad * 2, 32);
    ctx.fill();
    ctx.drawImage(qrCanvas, qx, qy, size, size);
    ctx.fillStyle = "#94a3b8";
    ctx.font = "700 30px system-ui, -apple-system, sans-serif";
    ctx.fillText(data.qrLabel.toUpperCase(), W / 2, qy + size + pad + 64);
  }

  ctx.fillStyle = "#64748b";
  ctx.font = "900 34px system-ui, -apple-system, sans-serif";
  ctx.fillText("PIKA.STREAM", W / 2, H - 96);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}

export type ShareOutcome = "shared" | "downloaded" | "cancelled";

/** Native share (files) with a download fallback. A user-cancelled sheet is NOT a failure. */
export async function shareCardBlob(
  blob: Blob,
  shareText: string,
  pageUrl: string,
): Promise<ShareOutcome> {
  const file = new File([blob], "pika-night-card.png", { type: "image/png" });
  if (typeof navigator !== "undefined" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: shareText, url: pageUrl });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // real share failure → fall through to download
    }
  }
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = "pika-night-card.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
