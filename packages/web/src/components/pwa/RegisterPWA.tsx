"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function RegisterPWA() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // 11/10 Reliability: Recover from chunk load failures (404s)
    // This happens when the browser tries to load old chunk hashes after a deploy
    const handleError = (e: ErrorEvent | PromiseRejectionEvent) => {
      const message = "message" in e ? e.message : String(e.reason);
      if (
        message.includes("Loading chunk") ||
        message.includes("Script error") ||
        message.includes("failed to fetch")
      ) {
        console.warn(
          "Detected chunk load failure, forcing refresh to sync with server...",
          message,
        );
        // Only reload if we are not already in a reload loop
        const lastReload = sessionStorage.getItem("pika_last_chunk_reload");
        const now = Date.now();
        if (!lastReload || now - Number.parseInt(lastReload) > 10000) {
          sessionStorage.setItem("pika_last_chunk_reload", now.toString());
          window.location.reload();
        }
      }
    };

    window.addEventListener("error", handleError, true);
    window.addEventListener("unhandledrejection", handleError);

    if (process.env.NODE_ENV === "production") {
      // 11/10 Cache Busting: Ensure we always try to get the latest SW description
      const swVersion = process.env.NEXT_PUBLIC_APP_VERSION || Date.now().toString();

      navigator.serviceWorker
        .register(`/sw.js?v=${swVersion}`, {
          scope: "/",
        })
        .then((registration) => {
          console.log("✅ Service Worker registered successfully:", registration.scope);

          // Track successful registration
          Sentry.addBreadcrumb({
            category: "pwa",
            message: "Service Worker registered",
            level: "info",
            data: { scope: registration.scope, version: swVersion },
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
