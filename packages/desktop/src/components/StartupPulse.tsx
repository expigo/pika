import { useEffect, useState } from "react";

export function StartupPulse() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setActive(true), 100);
    return () => clearTimeout(t);
  }, []);

  const bars = [
    [0.15, 0.0, 1.0],
    [0.3, 0.1, 1.1],
    [0.1, 0.05, 0.9],
    [0.5, 0.15, 1.2],
    [0.25, 0.2, 1.0],
    [0.8, 0.1, 1.1],
    [1.0, 0.25, 0.9],
    [0.6, 0.3, 1.2],
    [0.3, 0.15, 1.0],
    [0.7, 0.2, 1.1],
    [0.4, 0.1, 0.9],
    [0.2, 0.05, 1.0],
    [0.1, 0.0, 1.1],
  ];

  return (
    <div className="startup-logo-container">
      {bars.map(([maxScale, delay, speed], i) => (
        <div
          key={i}
          className={`startup-bar ${active ? "active" : ""}`}
          style={{
            // CSS Variables are generally allowed even if inline styles are strict
            // @ts-ignore
            "--max-scale": maxScale,
            "--bar-speed": `${1.2 * speed}s`,
            "--bar-delay": `${delay}s`,
          }}
        />
      ))}
    </div>
  );
}
