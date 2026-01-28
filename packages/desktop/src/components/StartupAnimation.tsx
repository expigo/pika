import { useEffect, useState } from "react";
import { StartupPulse } from "./StartupPulse";

export function StartupAnimation() {
  const [visible, setVisible] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const hasSeenIntro = sessionStorage.getItem("pika_intro_shown");
        if (hasSeenIntro) return false;
      } catch (e) {
        return true;
      }
    }
    return true;
  });

  const [phase, setPhase] = useState<"enter" | "exit">("enter");

  useEffect(() => {
    if (!visible) return;

    try {
      sessionStorage.setItem("pika_intro_shown", "true");
    } catch (_) {}

    const exitTimer = setTimeout(() => {
      setPhase("exit");
    }, 2500);

    const removeTimer = setTimeout(() => {
      setVisible(false);
    }, 3000);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      id="startup-animation-overlay"
      className={`startup-overlay transition-opacity duration-500 ease-out ${
        phase === "exit" ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div
        className={`transform transition-all duration-700 ease-out ${
          phase === "exit" ? "scale-110 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <StartupPulse />
      </div>
    </div>
  );
}
