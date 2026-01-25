"use client";

import { useState, useEffect } from "react";

/**
 * useVisibility: Reactive hook for tab visibility state
 * 🔋 11/10 Performance: Used to pause CPU/GPU heavy animations or intervals
 */
export function useVisibility() {
  const [isVisible, setIsVisible] = useState(
    typeof document !== "undefined" ? document.visibilityState === "visible" : true,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

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
