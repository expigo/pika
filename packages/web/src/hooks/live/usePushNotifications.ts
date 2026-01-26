import { useState, useCallback, useEffect } from "react";
import { logger } from "@pika/shared";
import { getOrCreateClientId } from "@/lib/client";

// Helper to convert VAPID key
function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/\-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushPermissionState = "default" | "granted" | "denied" | "unsupported";

export function usePushNotifications() {
  const [permissionState, setPermissionState] = useState<PushPermissionState>("default");
  const [isSubscribing, setIsSubscribing] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPermissionState("unsupported");
      return;
    }
    setPermissionState(Notification.permission as PushPermissionState);
  }, []);

  const subscribe = useCallback(async () => {
    if (permissionState === "denied") {
      logger.warn("[Push] Permission denied");
      return false;
    }

    // 11/10 UX: iOS Check
    // On iOS, push only works if installed to home screen (standalone)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

    if (isIOS && !isStandalone) {
      // We can return a specific error code or just handle this in UI
      // Ideally, the UI shouldn't even show the button if this is true
      logger.info("[Push] iOS user not in standalone mode");
      return false;
    }

    setIsSubscribing(true);

    try {
      const registration = await navigator.serviceWorker.ready;

      // Get Public Key from Env (Injected via Next.js)
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        logger.error("[Push] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
        throw new Error("Push configuration missing");
      }

      const convertedKey = urlBase64ToUint8Array(vapidKey);

      // Subscribe via Browser PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });

      // Send to Backend
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Pika-Client": "pika-web", // CSRF check
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: {
            p256dh: btoa(
              String.fromCharCode.apply(
                null,
                Array.from(new Uint8Array(subscription.getKey("p256dh")!)),
              ),
            ),
            auth: btoa(
              String.fromCharCode.apply(
                null,
                Array.from(new Uint8Array(subscription.getKey("auth")!)),
              ),
            ),
          },
          clientId: getOrCreateClientId(),
        }),
      });

      if (!response.ok) {
        throw new Error("Backend registration failed");
      }

      setPermissionState("granted");
      logger.info("[Push] Successfully subscribed");
      return true;
    } catch (e) {
      logger.error("[Push] Subscription failed", e);
      if (Notification.permission === "denied") {
        setPermissionState("denied");
      }
      return false;
    } finally {
      setIsSubscribing(false);
    }
  }, [permissionState]);

  return {
    permissionState,
    isSubscribing,
    subscribe,
    isSupported: permissionState !== "unsupported",
  };
}
