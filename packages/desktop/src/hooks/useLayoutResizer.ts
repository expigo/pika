import { useState, useCallback } from "react";

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

  const startResizingTopH = useCallback(
    (e: React.MouseEvent) => {
      setIsResizingTopH(true);
      const startX = e.clientX;
      const startWidth = topSplitOffset;

      const handleMouseMove = (mmE: MouseEvent) => {
        const deltaX = mmE.clientX - startX;
        const deltaPercent = (deltaX / window.innerWidth) * 100;
        setTopSplitOffset(Math.min(90, Math.max(50, startWidth + deltaPercent)));
      };

      const handleMouseUp = () => {
        setIsResizingTopH(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [topSplitOffset],
  );

  const startResizingV = useCallback(
    (e: React.MouseEvent) => {
      setIsResizingV(true);
      const startY = e.clientY;
      const startHeight = topHeight;

      const handleMouseMove = (mmE: MouseEvent) => {
        const deltaY = mmE.clientY - startY;
        setTopHeight(Math.min(600, Math.max(120, startHeight + deltaY)));
      };

      const handleMouseUp = () => {
        setIsResizingV(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [topHeight],
  );

  const startResizingH = useCallback(
    (e: React.MouseEvent) => {
      setIsResizingH(true);
      const startX = e.clientX;
      const startWidth = splitOffset;

      const handleMouseMove = (mmE: MouseEvent) => {
        const deltaX = mmE.clientX - startX;
        const deltaPercent = (deltaX / window.innerWidth) * 100;
        setSplitOffset(Math.min(85, Math.max(15, startWidth + deltaPercent)));
      };

      const handleMouseUp = () => {
        setIsResizingH(false);
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };

      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    },
    [splitOffset],
  );

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
