"use client";

import { ArrowRight, Download, Globe, LayoutGrid, LogIn, Smartphone, UserPlus } from "lucide-react";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";
import { NotificationToggle } from "@/components/pwa/NotificationToggle";

export default function MenuPage() {
  const menuGroups = [
    {
      title: "The Floor.",
      items: [
        {
          label: "About Pika!",
          href: "/",
          icon: Globe,
          description: "Our Vision & Connection",
          color: "pink",
        },
        {
          label: "Install Web App",
          href: "/for/dancers",
          icon: Smartphone,
          description: "Add to Home Screen",
          color: "pink",
        },
      ],
    },
    {
      title: "The Booth.",
      items: [
        {
          label: "DJ Dashboard",
          href: "/dj/login",
          icon: LogIn,
          description: "Access the booth",
          color: "purple",
        },
        {
          label: "Desktop App",
          href: "/download",
          icon: Download,
          description: "Download for Mac/Win",
          color: "purple",
        },
        {
          label: "Join as DJ",
          href: "/dj/register",
          icon: UserPlus,
          description: "Register your profile",
          color: "purple",
        },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-32">
      {/* Background Ambience */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[120px]" />
      </div>

      <div className="relative max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-slate-900 border border-slate-800 rounded-3xl mb-6 shadow-2xl">
            <LayoutGrid className="w-8 h-8 text-slate-400" />
          </div>
          <h1 className="text-5xl font-black text-white italic tracking-tighter uppercase mb-4 leading-none">
            Core Access.
          </h1>
          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.4em]">
            Configuration & Presence
          </p>
        </div>

        {/* Menu Groups */}
        <div className="space-y-8">
          {/* Notifications */}
          <div>
            <h3 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.3em] mb-4 ml-2 italic">
              Alerts
            </h3>
            <NotificationToggle />
          </div>

          {menuGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[11px] font-black text-slate-600 uppercase tracking-[0.3em] mb-4 ml-2 italic">
                {group.title}
              </h3>
              <ProCard className="overflow-hidden">
                <div className="divide-y divide-white/[0.03]">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-5 p-6 hover:bg-white/[0.02] transition-colors group active:bg-white/[0.04] relative overflow-hidden"
                    >
                      <div
                        className={`w-12 h-12 rounded-2xl bg-slate-950 border border-white/[0.05] flex items-center justify-center transition-all group-hover:scale-110 ${
                          item.color === "pink"
                            ? "group-hover:border-pink-500/30 group-hover:bg-pink-500/5 group-hover:shadow-[0_0_15px_rgba(236,72,153,0.1)]"
                            : "group-hover:border-purple-500/30 group-hover:bg-purple-500/5 group-hover:shadow-[0_0_15px_rgba(168,85,247,0.1)]"
                        }`}
                      >
                        <item.icon
                          className={`w-5 h-5 transition-colors ${
                            item.color === "pink"
                              ? "text-pink-500/40 group-hover:text-pink-400"
                              : "text-purple-500/40 group-hover:text-purple-400"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-black text-white uppercase italic tracking-tight group-hover:text-white transition-colors">
                          {item.label}
                        </div>
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1.5 opacity-60">
                          {item.description}
                        </div>
                      </div>
                      <ArrowRight
                        className={`w-5 h-5 transition-all transform ${
                          item.color === "pink"
                            ? "text-pink-900 group-hover:text-pink-500"
                            : "text-purple-900 group-hover:text-purple-500"
                        } group-hover:translate-x-1`}
                      />

                      {/* Selection Beam */}
                      <div
                        className={`absolute left-0 top-0 bottom-0 w-1 transition-transform duration-300 transform -translate-x-full group-hover:translate-x-0 ${
                          item.color === "pink" ? "bg-pink-500" : "bg-purple-500"
                        }`}
                      />
                    </Link>
                  ))}
                </div>
              </ProCard>
            </div>
          ))}
        </div>

        {/* Version Info */}
        <div className="mt-24 text-center pb-32">
          <p className="text-[10px] font-black uppercase tracking-[0.5em] text-slate-600 mb-2">
            The Neural Fiber Architecture
          </p>
          <p className="text-[9px] font-bold text-emerald-500/40 italic uppercase tracking-[0.2em]">
            v0.3.1. GRID SECURE
          </p>
        </div>
      </div>
    </div>
  );
}
