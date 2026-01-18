"use client";

import { ArrowRight, Download, Globe, LayoutGrid, LogIn, Smartphone, UserPlus } from "lucide-react";
import Link from "next/link";
import { ProCard } from "@/components/ui/ProCard";

export default function MenuPage() {
  const menuGroups = [
    {
      title: "For Dancers",
      items: [
        {
          label: "About Pika!",
          href: "/",
          icon: Globe,
          description: "What is this thing?",
        },
        {
          label: "Install Web App",
          href: "/guide/web-app",
          icon: Smartphone,
          description: "Add to Home Screen",
        },
      ],
    },
    {
      title: "For DJs",
      items: [
        {
          label: "Enter Booth",
          href: "/dj/login",
          icon: LogIn,
          description: "Manage your profile",
        },
        {
          label: "Desktop Sidecar",
          href: "/download",
          icon: Download,
          description: "Get the Mac/Win App",
        },
        {
          label: "Register DJ",
          href: "/dj/register",
          icon: UserPlus,
          description: "Join the network",
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
          <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase mb-2">
            System Menu
          </h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">
            Configuration & Access
          </p>
        </div>

        {/* Menu Groups */}
        <div className="space-y-8">
          {menuGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em] mb-4 ml-2">
                {group.title}
              </h3>
              <ProCard className="overflow-hidden">
                <div className="divide-y divide-slate-800/50">
                  {group.items.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-4 p-5 hover:bg-slate-900/50 transition-colors group active:bg-slate-900"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center group-hover:border-purple-500/30 group-hover:bg-purple-500/5 transition-all">
                        <item.icon className="w-5 h-5 text-slate-500 group-hover:text-purple-400 transition-colors" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-black text-white uppercase italic tracking-tight group-hover:text-purple-300 transition-colors">
                          {item.label}
                        </div>
                        <div className="text-[9px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">
                          {item.description}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" />
                    </Link>
                  ))}
                </div>
              </ProCard>
            </div>
          ))}
        </div>

        {/* Version Info */}
        <div className="text-center mt-16 opacity-30">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500">
            Pika! Web Client
          </p>
          <p className="text-[9px] font-medium text-slate-600 mt-1">v0.3.1 (Staging)</p>
        </div>
      </div>
    </div>
  );
}
