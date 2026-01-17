import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface VibeBadgeProps {
  children: ReactNode;
  icon?: LucideIcon;
  variant?: "purple" | "red" | "amber" | "green" | "slate";
  className?: string;
}

export function VibeBadge({
  children,
  icon: Icon,
  variant = "purple",
  className = "",
}: VibeBadgeProps) {
  const variants = {
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    red: "bg-red-500/10 text-red-500 border-red-500/20",
    amber: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    slate: "bg-slate-800/50 text-slate-400 border-slate-700/50",
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest ${variants[variant]} ${className}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {children}
    </div>
  );
}
