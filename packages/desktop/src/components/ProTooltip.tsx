import { useState } from "react";
import { useSettings } from "../hooks/useSettings";

interface Props {
  content: string;
  children: React.ReactNode;
  delay?: number;
}

/**
 * ProTooltip Component
 * A consistent, elegant tooltip that follows the app's Pro design.
 * Respects the 'display.showTooltips' setting.
 */
export function ProTooltip({ content, children, delay = 400 }: Props) {
  const { settings } = useSettings();
  const [isVisible, setIsVisible] = useState(false);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  if (!settings["display.showTooltips"]) {
    return <>{children}</>;
  }

  const handleMouseEnter = () => {
    const t = setTimeout(() => setIsVisible(true), delay);
    setTimer(t);
  };

  const handleMouseLeave = () => {
    if (timer) clearTimeout(timer);
    setIsVisible(false);
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-950/95 border border-white/10 backdrop-blur-md rounded-lg shadow-2xl z-[2000] whitespace-nowrap animate-in fade-in zoom-in-95 duration-150">
          <span className="text-[10px] font-black text-white uppercase tracking-widest">
            {content}
          </span>
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950/95" />
        </div>
      )}
    </div>
  );
}

export default ProTooltip;
