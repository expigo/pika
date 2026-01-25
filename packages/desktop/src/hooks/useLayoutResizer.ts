import { useState, useCallback, useEffect, useRef } from "react";

export interface LayoutResizer {
  splitOffset: number;
  topHeight: number;
  topSplitOffset: number;
  isResizingH: boolean;
  isResizingV: boolean;
  isResizingTopH: boolean;
  isAnyResizing: boolean;
  startResizingH: (e: React.MouseEvent) => void;
  startResizingV: (e: React.MouseEvent) => void;
  startResizingTopH: (e: React.MouseEvent) => void;
}

export function useLayoutResizer(): LayoutResizer {
  // Resizer state
  const [splitOffset, setSplitOffset] = useState(65); // Percentage for horizontal split (Library vs Selected)
  const [topHeight, setTopHeight] = useState(300); // Initial height for top row in pixels
  const [topSplitOffset, setTopSplitOffset] = useState(75); // Percentage for top row split (X-Ray vs Stats)

  const [isResizingH, setIsResizingH] = useState(false);
  const [isResizingV, setIsResizingV] = useState(false);
  const [isResizingTopH, setIsResizingTopH] = useState(false);

  // Refs to store start values for delta calculation
  const startRef = useRef({ x: 0, y: 0, width: 0, height: 0 });

  // Top Horizontal Resizer (X-Ray vs Stats)
  const startResizingTopH = useCallback(
    (e: React.MouseEvent) => {
      setIsResizingTopH(true);
      startRef.current = { x: e.clientX, y: 0, width: topSplitOffset, height: 0 };
    },
    [topSplitOffset],
  );

  // 🛡️ Issue 26 Fix: Stable listeners using refs to prevent churn
  // Each effect below only runs when resizing starts/stops, not during mouse movement.

  // Top Horizontal Resizer (X-Ray vs Stats)
  useEffect(() => {
    if (!isResizingTopH) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startRef.current.x;
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      setTopSplitOffset(Math.min(90, Math.max(50, startRef.current.width + deltaPercent)));
    };

    const handleMouseUp = () => setIsResizingTopH(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingTopH]);

  // Vertical Resizer (Top Row Height)
  const startResizingV = useCallback(
    (e: React.MouseEvent) => {
      setIsResizingV(true);
      startRef.current = { x: 0, y: e.clientY, width: 0, height: topHeight };
    },
    [topHeight],
  );

  useEffect(() => {
    if (!isResizingV) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = e.clientY - startRef.current.y;
      setTopHeight(Math.min(600, Math.max(120, startRef.current.height + deltaY)));
    };

    const handleMouseUp = () => setIsResizingV(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingV]);

  // Main Horizontal Resizer (Library vs Sidecar)
  const startResizingH = useCallback(
    (e: React.MouseEvent) => {
      setIsResizingH(true);
      startRef.current = { x: e.clientX, y: 0, width: splitOffset, height: 0 };
    },
    [splitOffset],
  );

  useEffect(() => {
    if (!isResizingH) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startRef.current.x;
      const deltaPercent = (deltaX / window.innerWidth) * 100;
      setSplitOffset(Math.min(85, Math.max(15, startRef.current.width + deltaPercent)));
    };

    const handleMouseUp = () => setIsResizingH(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingH]);

  return {
    splitOffset,
    topHeight,
    topSplitOffset,
    isResizingH,
    isResizingV,
    isResizingTopH,
    isAnyResizing: isResizingH || isResizingV || isResizingTopH,
    startResizingH,
    startResizingV,
    startResizingTopH,
  };
}
