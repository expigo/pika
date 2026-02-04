/**
 * Pika! API Client
 * Centralized fetch wrapper using Tauri's native HTTP plugin to bypass CORS.
 * Automatically handles auth headers and client identification.
 */

import { fetch } from "@tauri-apps/plugin-http";
import { getAuthToken } from "./settingsService";
import { logger } from "../utils/logger";

const DEFAULT_TIMEOUT = 10000;

/**
 * Enhanced fetch that uses Tauri's native HTTP implementation.
 * Bypasses CORS and automatically adds required Pika headers.
 */
export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Pika-Client": "pika-desktop",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  // Default timeout if no signal provided
  const signal = options.signal || AbortSignal.timeout(DEFAULT_TIMEOUT);

  logger.debug("API", `-> ${options.method || "GET"} ${url}`);

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      signal,
    });

    logger.debug("API", `<- ${response.status} ${url}`);
    return response;
  } catch (error) {
    logger.error("API", `!! Fail ${url}`, error);
    throw error;
  }
}
