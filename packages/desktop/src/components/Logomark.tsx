import { useMemo } from "react";

interface Props {
  className?: string;
  size?: number | string;
  animated?: boolean;
}

export function Logomark({ className = "", size = "100%", animated = false }: Props) {
  const gradientId = useMemo(() => `pika-gradient-${Math.random().toString(36).slice(2)}`, []);

  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ width: size, height: size }}
      role="img"
      aria-label="Pika! Logo"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#c084fc" /> {/* Purple-400 */}
          <stop offset="50%" stopColor="#a855f7" /> {/* Purple-500 */}
          <stop offset="100%" stopColor="#db2777" /> {/* Pink-600 */}
        </linearGradient>
        <filter id="glow-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="15" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* Glow Effect Background */}
      <circle
        cx="256"
        cy="256"
        r="220"
        fill={`url(#${gradientId})`}
        fillOpacity="0.1"
        filter="url(#glow-shadow)"
      />

      {/* Main Bolt/P Shape */}
      <path
        d="M280 40 L180 260 L260 260 L230 470 L400 180 L300 180 L340 40 Z"
        fill={`url(#${gradientId})`}
        stroke="white"
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? "animate-pulse" : ""}
        style={animated ? { animationDuration: "2s" } : {}}
      />

      {/* Decorative dots */}
      <circle
        cx="140"
        cy="140"
        r="12"
        fill="#c084fc"
        fillOpacity="0.6"
        className={animated ? "animate-ping" : ""}
        style={{ animationDuration: "3s" }}
      />
    </svg>
  );
}
