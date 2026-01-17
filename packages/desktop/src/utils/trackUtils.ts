/**
 * Utility functions for track-related calculations and styling
 */

/**
 * Returns a color hex code based on track energy level
 */
export const getEnergyColor = (energy: number | null): string => {
  if (energy === null) return "#4b5563";
  const normalized = energy / 100;
  if (normalized < 0.4) return "#3b82f6";
  if (normalized <= 0.7) return "#22c55e";
  return "#f97316";
};

/**
 * Normalizes energy to a 0-100 percentage
 */
export const getEnergyPercent = (energy: number | null): number => {
  if (energy === null) return 0;
  return Math.max(0, Math.min(100, energy));
};
