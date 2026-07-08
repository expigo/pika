"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The DJ workspace pill-nav (D.1) — Booth (manage) ⁄ Broadcast (go live), each one tap from the
 * other, plus the public-page escape hatch. Rendered on BOTH workspace pages at ALL widths
 * (BottomNav is dancer-only and mobile-only; this is the DJ's navigation).
 */
export function DjWorkspaceNav({ slug }: { slug?: string | null }) {
  const pathname = usePathname();
  const pill = (active: boolean) =>
    `rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest transition-colors ${
      active ? "bg-purple-600 text-white" : "bg-white/5 text-slate-400 hover:text-white"
    }`;

  return (
    <nav aria-label="DJ workspace" className="flex w-full items-center gap-2">
      <Link
        href="/dj/booth"
        aria-current={pathname === "/dj/booth" ? "page" : undefined}
        className={pill(pathname === "/dj/booth")}
      >
        Booth
      </Link>
      <Link
        href="/dj/live"
        aria-current={pathname === "/dj/live" ? "page" : undefined}
        className={pill(pathname === "/dj/live")}
      >
        Broadcast
      </Link>
      {slug ? (
        <Link
          href={`/dj/${slug}`}
          className="ml-auto text-xs text-slate-400 underline-offset-2 hover:text-purple-300 hover:underline"
        >
          View public →
        </Link>
      ) : null}
    </nav>
  );
}
