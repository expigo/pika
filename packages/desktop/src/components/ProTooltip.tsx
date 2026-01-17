import { useState } from "react";
import { createPortal } from "react-dom";
import { useSettings } from "../hooks/useSettings";

interface Props {
  content: string;
  children: React.ReactNode;
  delay?: number;
}

export function ProTooltip({ content, children, delay = 400 }: Props) {
  const { settings } = useSettings();
  const [isVisible, setIsVisible] = useState(false);
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  if (!settings["display.showTooltips"]) {
    return <>{children}</>;
  }

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCoords({
      x: rect.left + rect.width / 2,
      y: rect.top,
    });
    const t = setTimeout(() => setIsVisible(true), delay);
    setTimer(t);
  };

  const handleMouseLeave = () => {
    if (timer) clearTimeout(timer);
    setIsVisible(false);
  };

  return (
    <div className="inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {children}
      {isVisible &&
        createPortal(
          <div
            className="fixed bottom-auto left-auto -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-950/95 border border-white/10 backdrop-blur-md rounded-lg shadow-2xl z-[9999] whitespace-nowrap animate-in fade-in zoom-in-95 duration-150 pointer-events-none"
            style={{
              top: `${coords.y - 10}px`,
              left: `${coords.x}px`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <span className="text-[10px] font-black text-white uppercase tracking-widest">
              {content}
            </span>
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-950/95" />
          </div>,
          document.body,
        )}
    </div>
  );
}

export default ProTooltip;
