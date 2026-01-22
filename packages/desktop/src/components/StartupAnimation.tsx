import { useEffect, useState } from "react";
import { StartupPulse } from "./StartupPulse";

export function StartupAnimation() {
  const [visible, setVisible] = useState(() => {
    // Check constraints synchronously to prevent "blink"
    if (typeof window !== "undefined") {
      // DEV: Commented out session check for design review
      // const hasSeenIntro = sessionStorage.getItem("pika_intro_shown");
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (prefersReducedMotion) return false;
      // if (hasSeenIntro) return false;
    }
    return true;
  });

  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (!visible) return;

    // Start sequence
    sessionStorage.setItem("pika_intro_shown", "true");

    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, 2000); // Allow climax (2s)

    const removeTimer = setTimeout(() => {
      setVisible(false);
    }, 2500);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950 transition-opacity duration-500 ease-out-expo ${
        phase === "exit" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div
        className={`transform transition-all duration-700 ease-out-expo ${
          phase === "exit" ? "scale-125 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <StartupPulse />
      </div>
    </div>
  );
}
