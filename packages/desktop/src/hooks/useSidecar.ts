/**
 * useSidecar Hook
 * Manages the Python sidecar process lifecycle.
 * Spawns the sidecar, monitors its status, and provides the base URL for API calls.
 */

import { type Child, Command } from "@tauri-apps/plugin-shell";
import { useCallback, useEffect, useRef, useState } from "react";

export type SidecarStatus = "idle" | "starting" | "ready" | "error" | "browser";

export interface HealthData {
  status: string;
  version: string;
}

export interface UseSidecarResult {
  status: SidecarStatus;
  baseUrl: string | null;
  healthData: HealthData | null;
  error: string | null;
  restart: () => Promise<void>;
}

/**
 * Check if we're running inside Tauri
 */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Generate a random port in the ephemeral range (49152-65535)
 */
function getRandomPort(): number {
  return Math.floor(Math.random() * (65535 - 49152 + 1)) + 49152;
}

export function useSidecar(): UseSidecarResult {
  const [status, setStatus] = useState<SidecarStatus>("idle");
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const childRef = useRef<Child | null>(null);
  const isSpawningRef = useRef(false);

  const fetchHealth = useCallback(async (url: string) => {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        const data = (await response.json()) as HealthData;
        setHealthData(data);
      }
    } catch (err) {
      console.error("Failed to fetch health:", err);
    }
  }, []);

  const spawnSidecar = useCallback(async () => {
    // Check if we're running in Tauri
    if (!isTauri()) {
      console.warn("Not running in Tauri, sidecar not available");
      setStatus("browser");
      setError("Sidecar only available in desktop app");
      return;
    }

    // Prevent multiple spawns
    if (isSpawningRef.current) return;
    isSpawningRef.current = true;

    // Kill existing process if any
    if (childRef.current) {
      try {
        await childRef.current.kill();
      } catch {
        // Ignore kill errors
      }
      childRef.current = null;
    }

    // Reset state
    setStatus("starting");
    setBaseUrl(null);
    setHealthData(null);
    setError(null);

    const port = getRandomPort();

    try {
      // Create the sidecar command
      const command = Command.sidecar("binaries/api", ["--port", port.toString()]);

      // Listen for stdout to detect when the sidecar is ready
      command.stdout.on("data", (line: string) => {
        console.log("[Sidecar stdout]:", line);

        // Look for our ready message: "SIDECAR_READY port=XXXXX"
        if (line.includes("SIDECAR_READY")) {
          const match = line.match(/port=(\d+)/);
          if (match) {
            const detectedPort = match[1];
            const url = `http://127.0.0.1:${detectedPort}`;
            setBaseUrl(url);
            setStatus("ready");

            // Fetch health data once ready
            fetchHealth(url);
          }
        }
      });

      // Listen for stderr
      command.stderr.on("data", (line: string) => {
        console.log("[Sidecar stderr]:", line);
      });

      // Handle process close
      command.on("close", (data) => {
        console.log("[Sidecar closed]:", data);
        if (status !== "error") {
          setStatus("idle");
        }
        childRef.current = null;
        isSpawningRef.current = false;
      });

      // Handle errors
      command.on("error", (err) => {
        console.error("[Sidecar error]:", err);
        setError(String(err));
        setStatus("error");
        isSpawningRef.current = false;
      });

      // Spawn the process
      const child = await command.spawn();
      childRef.current = child;
    } catch (err) {
      console.error("Failed to spawn sidecar:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      isSpawningRef.current = false;
    }
  }, [fetchHealth, status]);

  const restart = useCallback(async () => {
    isSpawningRef.current = false;
    await spawnSidecar();
  }, [spawnSidecar]);

  // Spawn sidecar on mount
  useEffect(() => {
    spawnSidecar();

    // Cleanup on unmount
    return () => {
      if (childRef.current) {
        childRef.current.kill().catch(() => {
          // Ignore kill errors on unmount
        });
      }
    };
  }, [spawnSidecar]);

  return {
    status,
    baseUrl,
    healthData,
    error,
    restart,
  };
}
