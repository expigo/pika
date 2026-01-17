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

// Global key for sidecar child
const SIDE_PROCESS_KEY = "__PIKA_SIDECAR_CHILD__";

export function useSidecar(): UseSidecarResult {
  const [status, setStatus] = useState<SidecarStatus>("idle");
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

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
    if (!isTauri()) {
      setStatus("browser");
      return;
    }

    if (isSpawningRef.current) return;
    isSpawningRef.current = true;

    // Aggressive cleanup using globalThis
    const existingChild = (globalThis as Record<string, unknown>)[SIDE_PROCESS_KEY] as
      | Child
      | undefined;
    if (existingChild) {
      try {
        await existingChild.kill();
      } catch (_e) {
        // Ignore kill errors
      }
      (globalThis as Record<string, unknown>)[SIDE_PROCESS_KEY] = undefined;
    }

    setStatus("starting");
    setBaseUrl(null);
    setHealthData(null);
    setError(null);

    const port = getRandomPort();

    try {
      const command = Command.sidecar("binaries/api", ["--port", port.toString()]);

      command.stdout.on("data", (line: string) => {
        if (line.includes("SIDECAR_READY")) {
          const match = line.match(/port=(\d+)/);
          if (match) {
            const detectedPort = match[1];
            const url = `http://127.0.0.1:${detectedPort}`;
            setBaseUrl(url);
            setStatus("ready");
            fetchHealth(url);
          }
        }
        console.log("[Sidecar stdout]:", line);
      });

      command.stderr.on("data", (line: string) => {
        console.log("[Sidecar stderr]:", line);
        if (line.includes("address already in use")) {
          setStatus("error");
          setError("Port collision. Retrying...");
          isSpawningRef.current = false;
        }
      });

      command.on("close", (data) => {
        console.log("[Sidecar closed]:", data);
        setStatus((prev) => (prev !== "error" ? "idle" : prev));
        (globalThis as Record<string, unknown>)[SIDE_PROCESS_KEY] = undefined;
        isSpawningRef.current = false;
      });

      command.on("error", (err) => {
        console.error("[Sidecar error]:", err);
        setError(String(err));
        setStatus("error");
        isSpawningRef.current = false;
      });

      const child = await command.spawn();
      (globalThis as Record<string, unknown>)[SIDE_PROCESS_KEY] = child;
    } catch (err) {
      console.error("Failed to spawn sidecar:", err);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      isSpawningRef.current = false;
    }
  }, [fetchHealth]);

  const restart = useCallback(async () => {
    isSpawningRef.current = false;
    await spawnSidecar();
  }, [spawnSidecar]);

  useEffect(() => {
    spawnSidecar();
    return () => {
      const child = (globalThis as Record<string, unknown>)[SIDE_PROCESS_KEY] as Child | undefined;
      if (child) {
        child.kill().catch(() => {});
        (globalThis as Record<string, unknown>)[SIDE_PROCESS_KEY] = undefined;
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
