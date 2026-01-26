"use client";

import { useEffect, useState } from "react";

/**
 * useVisibility: Reactive hook for tab visibility state
 * 🔋 11/10 Performance: Used to pause CPU/GPU heavy animations or intervals
 */
export function useVisibility() {
  // 🛡️ Fix: Always initialize to true to match server-side rendering.
  // We only update the 'real' visibility state after mount in useEffect.
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (typeof document === "undefined") return;

    // Initial check on mount
    setIsVisible(document.visibilityState === "visible");

    const handleVisibilityChange = () => {
      setIsVisible(document.visibilityState === "visible");
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return isVisible;
}
