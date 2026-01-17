"use client";

import { Activity, Heart, Radio, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { label: "Live", icon: Radio, href: "/live" },
    { label: "Hearts", icon: Heart, href: "/my-likes" },
    { label: "Network", icon: Activity, href: "/analytics" },
    { label: "Booth", icon: User, href: "/dj/login" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-lg border-t border-slate-800/50 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:hidden transition-all duration-300">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {navItems.map((item) => {
          // Robust active check for nested routes
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center gap-1.5 p-2 transition-all duration-300 active:scale-95 touch-manipulation ${
                isActive ? "text-purple-500" : "text-slate-500"
              }`}
            >
              <item.icon
                className={`w-6 h-6 transition-transform ${
                  isActive ? "fill-purple-500/10 scale-110" : "scale-100"
                }`}
              />
              <span className="text-[9px] font-black uppercase tracking-[0.15em] leading-none">
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-purple-500 rounded-full shadow-[0_0_12px_rgba(168,85,247,0.8)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
