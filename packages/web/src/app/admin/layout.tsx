"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogoutButton } from "@/components/LogoutButton";
import { type AdminMe, getAdminMe } from "@/lib/admin";

/**
 * Admin gate. The REAL gate is the server (every /api/admin route 404s non-admins); this is UX —
 * it confirms admin via /api/admin/me and redirects everyone else home, rendering nothing until
 * confirmed so the panel never flashes.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<AdminMe | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    getAdminMe()
      .then((m) => {
        if (!active) return;
        if (!m) return router.replace("/");
        setMe(m);
        setChecked(true);
      })
      .catch(() => {
        if (active) router.replace("/");
      });
    return () => {
      active = false;
    };
  }, [router]);

  if (!checked || !me) return null;

  const tab = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`rounded-full px-4 py-1.5 text-sm ${active ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"}`}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Admin</span>
          <nav className="ml-4 flex gap-1">
            {tab("/admin", "Overview")}
            {tab("/admin/djs", "DJs")}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{me.displayName}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="px-6 py-8">{children}</main>
    </div>
  );
}
