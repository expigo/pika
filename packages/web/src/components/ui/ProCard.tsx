import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Image from "next/image";

interface ProCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  bgImage?: string;
}

export function ProCard({ children, className = "", glow = false, bgImage }: ProCardProps) {
  return (
    <div
      className={`relative group/card bg-slate-900 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl transition-all duration-700 hover:border-white/10 flex flex-col ${className}`}
    >
      {/* Ambient Texture Layer */}
      {bgImage && (
        <div className="absolute inset-0 z-0 opacity-[0.4] group-hover/card:opacity-[0.6] transition-opacity duration-1000 grayscale group-hover/card:grayscale-0 pointer-events-none">
          <Image
            src={bgImage}
            alt=""
            fill
            className="object-cover scale-110 group-hover/card:scale-100 transition-transform duration-[3s]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
        </div>
      )}

      {/* Atmospheric Glow */}
      {glow && (
        <div className="absolute inset-0 z-10 bg-gradient-to-br from-purple-500/15 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none" />
      )}

      {/* Main Content */}
      <div className="relative z-20 flex flex-col h-full flex-1">{children}</div>
    </div>
  );
}

export function ProHeader({
  title,
  subtitle,
  icon: Icon,
}: {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="px-8 py-6 border-b border-slate-800 flex items-center justify-between bg-slate-800/20">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-5 h-5 text-purple-500" />}
        <h3 className="font-black text-white uppercase text-sm tracking-widest">{title}</h3>
      </div>
      {subtitle && (
        <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">
          {subtitle}
        </span>
      )}
    </div>
  );
}
