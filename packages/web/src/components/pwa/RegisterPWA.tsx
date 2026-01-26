"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export function RegisterPWA() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
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

          // Check for updates on interval (every hour)
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
              newWorker.addEventListener("statechange", () => {
                if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                  // New service worker available
                  console.log("🔄 New service worker available. Reload to update.");
                  Sentry.captureMessage("Service Worker update available", "info");
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

      // Listen for controller change (new SW activated)
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        console.log("🔄 Service Worker controller changed. Reloading page...");
        window.location.reload();
      });
    }
  }, []);

  return null;
}
