import type { LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

interface ProCardProps {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  glowColor?: string; // Example: 'purple-500' or 'pink-500'
  bgImage?: string;
  variant?: "default" | "hero";
  align?: "start" | "center" | "end";
}

export function ProCard({
  children,
  className = "",
  glow = false,
  glowColor = "purple-500",
  bgImage,
  variant = "default",
  align,
}: ProCardProps) {
  // Map common colors to gradient classes to ensure Tailwind pick them up
  const glowClasses: Record<string, string> = {
    "purple-500": "from-purple-500/20",
    "pink-500": "from-pink-500/20",
    "emerald-500": "from-emerald-500/20",
    "blue-500": "from-blue-500/20",
  };

  const alignmentClasses = {
    start: "items-start",
    center: "items-center",
    end: "items-end",
  };

  const gradientClass = glowClasses[glowColor] || "from-purple-500/20";
  const radiusClass = variant === "hero" ? "rounded-[2.5rem]" : "rounded-3xl";

  return (
    <div
      className={`relative group/card bg-slate-900 border border-slate-800 ${radiusClass} overflow-hidden shadow-2xl transition-all duration-700 hover:border-white/10 flex flex-col ${className}`}
    >
      {/* Ambient Texture Layer */}
      {bgImage && (
        <div className="absolute inset-0 z-0 opacity-[0.4] group-hover/card:opacity-[0.6] transition-opacity duration-1000 grayscale group-hover/card:grayscale-0 pointer-events-none">
          <Image
            src={bgImage}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover scale-110 group-hover/card:scale-100 transition-transform duration-[3s]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />
        </div>
      )}

      {/* Atmospheric Glow */}
      {glow && (
        <div
          className={`absolute inset-0 z-10 bg-gradient-to-br ${gradientClass} via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-700 pointer-events-none`}
        />
      )}

      {/* Main Content */}
      <div
        className={`relative z-20 flex flex-col h-full flex-1 ${
          align ? alignmentClasses[align] : ""
        }`}
      >
        {children}
      </div>
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
