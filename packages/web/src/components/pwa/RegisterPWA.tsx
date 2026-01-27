"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function RegisterPWA() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Reliability: Recover from chunk load failures (404s)
    // This happens when the browser tries to load old chunk hashes after a deploy
    const handleError = (e: ErrorEvent | PromiseRejectionEvent) => {
      // 1. Get the target resource URL if possible
      const target =
        e instanceof ErrorEvent
          ? (e.target as unknown as { src?: string; href?: string })?.src ||
            (e.target as unknown as { src?: string; href?: string })?.href
          : "";

      // 2. Ignore non-critical resource errors (like source maps, images, etc.)
      if (
        typeof target === "string" &&
        (target.endsWith(".map") || !target.includes("/_next/static/"))
      ) {
        return;
      }

      const message = "message" in e ? e.message : String(e.reason);

      // 3. Only reload for critical Next.js chunk/script failures
      const isChunkError =
        message.includes("Loading chunk") ||
        message.includes("Script error") ||
        message.includes("failed to fetch") ||
        (e instanceof ErrorEvent && (e.target as HTMLElement)?.tagName === "SCRIPT");

      if (isChunkError) {
        console.warn("Detected critical chunk load failure, syncing with server...", {
          message,
          target,
        });

        // 4. Stricter Reload Guard: Don't flip out. Wait at least 30s between force-reloads.
        const lastReload = sessionStorage.getItem("pika_last_chunk_reload");
        const now = Date.now();
        if (!lastReload || now - Number.parseInt(lastReload) > 30000) {
          sessionStorage.setItem("pika_last_chunk_reload", now.toString());
          // Best Practice: Explicitly request permission first
          setTimeout(() => window.location.reload(), 500);
        } else {
          console.error("Critical error loop detected. Stopping auto-reload.");
        }
      }
    };

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleError);

    if (process.env.NODE_ENV === "production") {
      // 🛡️ Security/Stability: Remove dynamic query params from SW registration.
      // These cause infinite reload loops because the browser sees a "new" SW on every mount.
      navigator.serviceWorker
        .register("/sw.js", {
          scope: "/",
        })
        .then((registration) => {
          console.log("✅ Service Worker registered successfully:", registration.scope);

          // Track successful registration
          Sentry.addBreadcrumb({
            category: "pwa",
            message: "Service Worker registered",
            level: "info",
            data: { scope: registration.scope },
          });

          // Check for updates on mount and every hour
          registration.update();
          setInterval(
            () => {
              registration.update();
            },
            60 * 60 * 1000,
          );

          // Handle updates
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener("statechange", async () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // New service worker available
                  console.log("🔄 New service worker available. User verification required.");
                  Sentry.captureMessage("Service Worker update available", "info");

                  // Show Update Toast
                  const { toast } = await import("sonner");
                  toast.info("Update Available", {
                    description: "A new version of Pika! is available.",
                    action: {
                      label: "Refresh Now",
                      onClick: () => {
                        newWorker.postMessage({ type: "SKIP_WAITING" });
                      },
                    },
                    duration: Infinity,
                  });
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error("❌ Service Worker registration failed:", error);
          Sentry.captureException(error, {
            tags: { component: "pwa", action: "sw_registration" },
          });
        });

      // Listen for controller change (new SW activated after SKIP_WAITING)
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("🔄 Service Worker controller changed. Reloading page...");
        window.location.reload();
      });
    }

    return () => {
      window.removeEventListener("error", handleError, true);
      window.removeEventListener("unhandledrejection", handleError);
    };
  }, []);

  return null;
}
