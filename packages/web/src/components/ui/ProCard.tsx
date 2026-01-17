import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ProCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}

export function ProCard({ children, className = "", glow = false }: ProCardProps) {
  return (
    <div
      className={`relative group/card bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl transition-all duration-500 hover:border-purple-500/30 ${className}`}
    >
      {glow && (
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none" />
      )}
      <div className="relative z-10">{children}</div>
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
