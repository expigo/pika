import { Check, Copy, Headphones, Layers } from "lucide-react";
import { useState } from "react";

/**
 * The link rows shown under a QR code. When broadcasting to a stage we surface
 * BOTH links, each copyable:
 *   - Stage  (/stage/{id})   — the dancer-facing link; they follow DJ rotation.
 *   - This set (/live/{id})  — the direct link to this DJ's current session.
 * A stage-less session shows only the session link. The scannable QR itself is
 * always the stage (when staged), so dancers aren't pinned to one DJ.
 */
export function QrShareLinks({
  stageUrl,
  stageName,
  sessionUrl,
}: {
  stageUrl?: string | null;
  stageName?: string | null;
  sessionUrl?: string | null;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (key: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      // clipboard unavailable — the URL is still visible to type
    }
  };

  const rows: Array<{ key: string; label: string; url: string; Icon: typeof Layers }> = [];
  if (stageUrl) {
    rows.push({
      key: "stage",
      label: stageName ? `Stage · ${stageName}` : "Stage",
      url: stageUrl,
      Icon: Layers,
    });
  }
  if (sessionUrl) {
    rows.push({ key: "session", label: "This set", url: sessionUrl, Icon: Headphones });
  }
  if (rows.length === 0) return null;

  return (
    <div className="w-full space-y-2">
      {rows.map(({ key, label, url, Icon }) => (
        <div
          key={key}
          className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2"
        >
          <Icon size={13} className="shrink-0 text-pika-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 leading-none mb-0.5">
              {label}
            </p>
            <p className="text-[10px] font-mono text-slate-400 truncate">{url}</p>
          </div>
          <button
            type="button"
            onClick={() => copy(key, url)}
            className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all active:scale-90"
            title={`Copy ${label} link`}
            aria-label={`Copy ${label} link`}
          >
            {copied === key ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
          </button>
        </div>
      ))}
    </div>
  );
}
