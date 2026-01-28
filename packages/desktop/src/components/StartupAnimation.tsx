import { useEffect, useState } from "react";
import { StartupPulse } from "./StartupPulse";

export function StartupAnimation() {
  const [visible, setVisible] = useState(() => {
    // Check constraints synchronously to prevent "blink"
    if (typeof window !== "undefined") {
      try {
        const hasSeenIntro = sessionStorage.getItem("pika_intro_shown");
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        console.info("[Startup] Checking constraints:", { hasSeenIntro, prefersReducedMotion });

        if (prefersReducedMotion) {
          console.warn("[Startup] Skipping due to prefers-reduced-motion");
          return false;
        }
        if (hasSeenIntro) {
          console.info("[Startup] Skipping - intro already shown in this session");
          return false;
        }
      } catch (e) {
        console.warn("[Startup] Storage access restrictions prevented checks", e);
        return true;
      }
    }
    return true;
  });

  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (!visible) return;

    console.log("[Startup] Initiating intro sequence...");

    // Mark as shown AFTER the first successful mount
    try {
      sessionStorage.setItem("pika_intro_shown", "true");
    } catch (_) {}

    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, 2000);

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
      id="startup-animation-overlay"
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
