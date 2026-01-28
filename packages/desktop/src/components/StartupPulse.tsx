import { useEffect, useState } from "react";

export function StartupPulse() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setActive(true), 100);
    return () => clearTimeout(t);
  }, []);

  // "Song Waveform" Pattern (Jagged transients, audio-data look)
  // [heightMultiplier, phaseDelay, speedMultiplier]
  const bars = [
    [0.15, 0.0, 1.0],
    [0.3, 0.1, 1.1],
    [0.1, 0.05, 0.9],
    [0.5, 0.15, 1.2],
    [0.25, 0.2, 1.0],
    [0.8, 0.1, 1.1],
    [1.0, 0.25, 0.9], // Main Transient
    [0.6, 0.3, 1.2],
    [0.3, 0.15, 1.0],
    [0.7, 0.2, 1.1],
    [0.4, 0.1, 0.9],
    [0.2, 0.05, 1.0],
    [0.1, 0.0, 1.1],
  ];

  return (
    <div className="flex items-center justify-center gap-[4px] h-20">
      {bars.map(([maxScale, delay, speed], i) => (
        <div
          key={i}
          className="w-1 bg-white rounded-full origin-center"
          style={{
            height: "64px", // Taller base
            background: "linear-gradient(to top, #c084fc, #db2777)",

            // Initial State
            opacity: 0,
            transform: "scaleY(0.1)",

            // Animation: Desynchronized speeds for organic feel
            animation: active
              ? `audioTransient ${1.2 * speed}s cubic-bezier(0.5, 0, 0.5, 1) infinite`
              : "none",
            animationDelay: `${delay}s`,
            animationFillMode: "both",

            // Pass max scale to keyframes
            // @ts-ignore
            "--max-scale": maxScale,

            filter: "drop-shadow(0 0 6px rgba(219,39,119,0.4))",
          }}
        />
      ))}
    </div>
  );
}
