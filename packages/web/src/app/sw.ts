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
  skipWaiting: false, // 11/10: User controlled updates
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
