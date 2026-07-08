/**
 * Pure geometry tests for the Signature radar (bun runner — no DOM). The doctrine-critical
 * property: the path is a BAND RING (two subpaths), never a single-value polygon.
 */

import { describe, expect, test } from "bun:test";
import { radarPath } from "./SignatureRadar";

const CX = 100;
const CY = 100;
const R = 80;

function subpaths(d: string): string[] {
  return d
    .split("M")
    .map((s) => s.trim())
    .filter(Boolean);
}

function points(subpath: string): [number, number][] {
  return subpath
    .replace(/Z$/, "")
    .split("L")
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return [x ?? Number.NaN, y ?? Number.NaN];
    });
}

describe("radarPath", () => {
  test("emits exactly two subpaths (outer p75 + inner p25) with one point per axis", () => {
    const bands = Array.from({ length: 4 }, () => ({ p25: 0.3, p75: 0.7 }));
    const parts = subpaths(radarPath(bands, CX, CY, R));
    expect(parts.length).toBe(2);
    for (const part of parts) {
      expect(points(part).length).toBe(4);
      expect(part.endsWith("Z")).toBe(true);
    }
  });

  test("axis 0 points straight up: x stays centered, y scales with the values", () => {
    const bands = [
      { p25: 0.25, p75: 0.75 },
      { p25: 0.5, p75: 0.5 },
      { p25: 0.5, p75: 0.5 },
      { p25: 0.5, p75: 0.5 },
    ];
    const [outer, inner] = subpaths(radarPath(bands, CX, CY, R));
    const outerTop = points(outer ?? "")[0];
    expect(outerTop?.[0]).toBe(CX);
    expect(outerTop?.[1]).toBe(CY - 0.75 * R);
    // Inner subpath walks in reverse, so axis 0 is its FIRST point too (n-1-i wraps to 3,2,1,0
    // … actually reverse order starts at the last axis; axis 0 is the final point).
    const innerPts = points(inner ?? "");
    const innerTop = innerPts[innerPts.length - 1];
    expect(innerTop?.[0]).toBe(CX);
    expect(innerTop?.[1]).toBe(CY - 0.25 * R);
  });

  test("a collapsed band (p25 === p75) still renders a visible ring, clamped to [0,1]", () => {
    const bands = Array.from({ length: 4 }, () => ({ p25: 0.5, p75: 0.5 }));
    const [outer, inner] = subpaths(radarPath(bands, CX, CY, R));
    const outerTopY = points(outer ?? "")[0]?.[1] ?? Number.NaN;
    const innerPts = points(inner ?? "");
    const innerTopY = innerPts[innerPts.length - 1]?.[1] ?? Number.NaN;
    // The ring keeps ≥ MIN_BAND (0.02) of radial thickness.
    expect(innerTopY - outerTopY).toBeGreaterThanOrEqual(0.02 * R - 0.2);

    // At the extremes the clamp never leaves the [0,1] radius.
    const extreme = radarPath(
      Array.from({ length: 4 }, () => ({ p25: 1, p75: 1 })),
      CX,
      CY,
      R,
    );
    const topY = points(subpaths(extreme)[0] ?? "")[0]?.[1] ?? Number.NaN;
    expect(topY).toBeGreaterThanOrEqual(CY - R);
  });

  test("swapped inputs (p75 < p25) are normalized instead of inverting the ring", () => {
    const swapped = radarPath(
      Array.from({ length: 4 }, () => ({ p25: 0.7, p75: 0.3 })),
      CX,
      CY,
      R,
    );
    const normal = radarPath(
      Array.from({ length: 4 }, () => ({ p25: 0.3, p75: 0.7 })),
      CX,
      CY,
      R,
    );
    expect(swapped).toBe(normal);
  });
});
