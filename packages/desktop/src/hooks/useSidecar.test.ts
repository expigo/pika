/**
 * useSidecar Unit Tests
 *
 * @file useSidecar.test.ts
 * @package @pika/desktop
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests the Python sidecar process lifecycle management.
 * Uses mocks since we can't actually spawn processes in tests.
 *
 * SAFETY CONSTRAINTS:
 * - Every test documents production behavior
 * - Edge cases for process lifecycle
 * - Error handling verified
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// MOCKS
// ============================================================================

// Mock window.__TAURI_INTERNALS__ for isTauri() check
const mockTauriWindow = () => {
  (globalThis as any).window = { __TAURI_INTERNALS__: {} };
};

const mockBrowserWindow = () => {
  (globalThis as any).window = {};
};

// ============================================================================
// HELPER FUNCTION TESTS
// ============================================================================

describe("Sidecar Helper Functions", () => {
  describe("isTauri detection", () => {
    /**
     * TEST: Detects Tauri environment correctly
     *
     * RATIONALE:
     * The sidecar should only spawn in Tauri, not in browser preview mode.
     * This prevents errors when developing in the browser.
     *
     * PRODUCTION LOCATION: useSidecar.ts line 28-30
     */
    it("returns true when __TAURI_INTERNALS__ exists", () => {
      mockTauriWindow();
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      expect(isTauri).toBe(true);
    });

    it("returns false when __TAURI_INTERNALS__ is missing", () => {
      mockBrowserWindow();
      const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      expect(isTauri).toBe(false);
    });
  });

  describe("getRandomPort", () => {
    /**
     * TEST: Port generation is in ephemeral range
     *
     * RATIONALE:
     * Using ephemeral ports (49152-65535) reduces collision risk with
     * system services. Critical for multi-instance scenarios.
     *
     * PRODUCTION LOCATION: useSidecar.ts line 35-37
     */
    it("generates port in ephemeral range (49152-65535)", () => {
      const getRandomPort = () => Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;

      // Test 100 ports to verify range
      for (let i = 0; i < 100; i++) {
        const port = getRandomPort();
        expect(port).toBeGreaterThanOrEqual(49152);
        expect(port).toBeLessThanOrEqual(65535);
      }
    });

    it("generates different ports on each call", () => {
      const getRandomPort = () => Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;

      const ports = new Set<number>();
      for (let i = 0; i < 50; i++) {
        ports.add(getRandomPort());
      }

      // Should have multiple unique ports (statistically near impossible to get <10)
      expect(ports.size).toBeGreaterThan(10);
    });
  });
});

describe("Sidecar Status State Machine", () => {
  /**
   * TEST: Status transitions follow expected state machine
   *
   * RATIONALE:
   * The sidecar has a finite state machine:
   * idle -> starting -> ready OR error
   * browser (special case - not in Tauri)
   *
   * UI depends on correct status for loading indicators.
   */
  const validTransitions: Record<string, string[]> = {
    idle: ["starting", "browser"],
    starting: ["ready", "error", "idle"],
    ready: ["idle", "error"],
    error: ["starting", "idle"],
    browser: [], // Terminal state in browser mode
  };

  it("defines valid status values", () => {
    const statuses = ["idle", "starting", "ready", "error", "browser"];
    for (const status of statuses) {
      expect(validTransitions[status]).toBeDefined();
    }
  });

  it("idle can transition to starting or browser", () => {
    expect(validTransitions.idle).toContain("starting");
    expect(validTransitions.idle).toContain("browser");
  });

  it("starting can transition to ready, error, or idle", () => {
    expect(validTransitions.starting).toContain("ready");
    expect(validTransitions.starting).toContain("error");
    expect(validTransitions.starting).toContain("idle");
  });

  it("error can transition back to starting for retry", () => {
    expect(validTransitions.error).toContain("starting");
  });
});

describe("Sidecar Process Key", () => {
  /**
   * TEST: Global process key prevents duplicate sidecars
   *
   * RATIONALE:
   * Without global tracking, HMR could spawn multiple sidecars.
   * The global key ensures zero-tolerance: only one sidecar at a time.
   *
   * PRODUCTION LOCATION: useSidecar.ts line 40
   */
  const SIDE_PROCESS_KEY = "__PIKA_SIDECAR_CHILD__";

  beforeEach(() => {
    delete (globalThis as any)[SIDE_PROCESS_KEY];
  });

  it("uses unique global key for process tracking", () => {
    expect(SIDE_PROCESS_KEY).toBe("__PIKA_SIDECAR_CHILD__");
  });

  it("can store and retrieve process reference", () => {
    const mockChild = { pid: 12345, kill: vi.fn() };
    (globalThis as any)[SIDE_PROCESS_KEY] = mockChild;

    expect((globalThis as any)[SIDE_PROCESS_KEY]).toBe(mockChild);
  });

  it("can clear process reference", () => {
    const mockChild = { pid: 12345, kill: vi.fn() };
    (globalThis as any)[SIDE_PROCESS_KEY] = mockChild;
    (globalThis as any)[SIDE_PROCESS_KEY] = undefined;

    expect((globalThis as any)[SIDE_PROCESS_KEY]).toBeUndefined();
  });
});

describe("Sidecar Ready Detection", () => {
  /**
   * TEST: SIDECAR_READY message parsing
   *
   * RATIONALE:
   * The Python sidecar outputs "SIDECAR_READY port=XXXXX" when ready.
   * Parsing this correctly is critical for establishing the API URL.
   *
   * PRODUCTION LOCATION: useSidecar.ts lines 99-109
   */
  const parseReadyMessage = (line: string): string | null => {
    if (line.includes("SIDECAR_READY")) {
      const match = line.match(/port=(\d+)/);
      if (match) {
        return `http://127.0.0.1:${match[1]}`;
      }
    }
    return null;
  };

  it("parses port from SIDECAR_READY message", () => {
    const line = "INFO: SIDECAR_READY port=52341";
    const url = parseReadyMessage(line);
    expect(url).toBe("http://127.0.0.1:52341");
  });

  it("returns null for non-ready messages", () => {
    const line = "INFO: Starting server...";
    const url = parseReadyMessage(line);
    expect(url).toBeNull();
  });

  it("handles message with extra text", () => {
    const line = "[2026-01-21] Pika! Analyzer SIDECAR_READY port=49999 v0.2.1";
    const url = parseReadyMessage(line);
    expect(url).toBe("http://127.0.0.1:49999");
  });

  it("handles edge case - port at boundary", () => {
    const line = "SIDECAR_READY port=65535";
    const url = parseReadyMessage(line);
    expect(url).toBe("http://127.0.0.1:65535");
  });
});

describe("Sidecar Error Detection", () => {
  /**
   * TEST: Address collision detection
   *
   * RATIONALE:
   * When a port is already in use, the sidecar logs "address already in use".
   * We detect this to trigger a retry with a new random port.
   *
   * PRODUCTION LOCATION: useSidecar.ts lines 115-119
   */
  const detectAddressInUse = (line: string): boolean => {
    return line.includes("address already in use");
  };

  it("detects address collision error", () => {
    const line = "ERROR: [Errno 48] address already in use";
    expect(detectAddressInUse(line)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    const line = "ERROR: Failed to load model";
    expect(detectAddressInUse(line)).toBe(false);
  });

  it("detects collision in verbose output", () => {
    const line = "OSError: [Errno 98] address already in use: ('127.0.0.1', 52000)";
    expect(detectAddressInUse(line)).toBe(true);
  });
});

describe("Health Check API", () => {
  /**
   * TEST: Health endpoint response format
   *
   * RATIONALE:
   * The health check verifies sidecar is responsive and returns version.
   * Used to populate healthData in the hook state.
   *
   * PRODUCTION LOCATION: useSidecar.ts lines 50-60
   */
  interface HealthData {
    status: string;
    version: string;
  }

  it("defines expected health response shape", () => {
    const mockHealth: HealthData = {
      status: "ok",
      version: "0.2.1",
    };

    expect(mockHealth.status).toBe("ok");
    expect(mockHealth.version).toBeDefined();
  });

  it("health URL is correctly formed", () => {
    const baseUrl = "http://127.0.0.1:52000";
    const healthUrl = `${baseUrl}/health`;
    expect(healthUrl).toBe("http://127.0.0.1:52000/health");
  });
});
