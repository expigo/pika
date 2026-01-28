import { useEffect, useState } from "react";
import { StartupPulse } from "./StartupPulse";

export function StartupAnimation() {
  const [visible, setVisible] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const hasSeenIntro = sessionStorage.getItem("pika_intro_shown");

        // DEBUG: Log explicitly as strings for easier reading in screenshots
        console.info(`[Startup] hasSeenIntro: ${hasSeenIntro}`);

        if (hasSeenIntro) {
          console.info("[Startup] Skipping - intro already shown");
          return false;
        }
      } catch (e) {
        console.warn("[Startup] Storage error", e);
        return true;
      }
    }
    return true;
  });

  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (!visible) return;

    console.log("[Startup] !!! VISUAL SEQUENCE INITIATED !!!");

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

  if (!visible) {
    console.log("[Startup] Component is NOT VISIBLE (returning null)");
    return null;
  }

  return (
    <div
      id="startup-animation-overlay"
      style={{ zIndex: 9999999, background: "#020617" }}
      className={`fixed inset-0 flex items-center justify-center transition-opacity duration-500 ease-out-expo ${
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
