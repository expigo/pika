import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

// This declares the value of `injectionPoint` to TypeScript.
// `injectionPoint` is the string that will be replaced by the actual precache manifest.
// By default, this string is set to "self.__SW_MANIFEST".
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true, // 11/10: Force activation for rapid staging iteration
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // NETWORK ONLY for API routes (Critical for voting/status)
      matcher: /\/api\/.*/i,
      handler: new NetworkOnly(),
    },
    {
      // NETWORK ONLY for Live routes (Critical for real-time)
      matcher: /\/live.*/i,
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
});

// Listener for skipWaiting message (from UI)
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

serwist.addEventListeners();

// ============================================================================
// Push Notifications (11/10 Implementation)
// ============================================================================

/**
 * Handle incoming push notifications
 */
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const { title, body, icon, data: payload } = data;

    const options: NotificationOptions & { vibrate?: number[] } = {
      body: body || "",
      icon: icon || "/icon-192.png",
      badge: "/icon-192.png",
      vibrate: [100, 50, 100], // Subtle haptic pattern for 11/10 feel
      data: payload,
      tag: payload?.tag || "pika-notification", // Deduplicate by tag if provided
      requireInteraction: false,
      // biome-ignore lint/suspicious/noExplicitAny: platform specific property
      silent: false,
    } as any;

    event.waitUntil(self.registration.showNotification(title || "Pika! Live", options));
  } catch (e) {
    console.error("[SW] Push event error:", e);
  }
});

/**
 * Handle notification clicks
 */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  // 11/10 Deep-linking logic
  const urlToOpen = event.notification.data?.url || "/live";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // 1. If we already have a window open to this URL, focus it
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && "focus" in client) {
            return (client as WindowClient).focus();
          }
        }
        // 2. Otherwise, open a new window
        if (self.clients.openWindow) {
          return self.clients.openWindow(urlToOpen);
        }
      })
      .catch((e) => {
        console.error("[SW] Notification click handling failed", e);
      }),
  );
});
