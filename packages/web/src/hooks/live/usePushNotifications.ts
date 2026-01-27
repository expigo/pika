import { useState, useCallback, useEffect } from "react";
import { logger } from "@pika/shared";
import { getOrCreateClientId } from "@/lib/client";
import { toast } from "sonner";
import { getApiBaseUrl } from "@/lib/api";

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
      logger.info("[Push] Notifications not supported in this browser environment");
      setPermissionState("unsupported");
      return;
    }
    if (typeof Notification !== "undefined") {
      logger.info("[Push] Notification permission state found", { state: Notification.permission });
      setPermissionState(Notification.permission as PushPermissionState);
    } else {
      logger.info("[Push] Notification global not found (expected on some iOS)");
      setPermissionState("unsupported");
    }
  }, []);

  const subscribe = useCallback(async () => {
    if (permissionState === "denied") {
      logger.warn("[Push] Permission denied");
      return false;
    }

    // 11/10 UX: iOS Check
    // On iOS, push only works if installed to home screen (standalone)
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !(window as unknown as { MSStream: unknown }).MSStream;
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches;

    if (isIOS && !isStandalone) {
      // We can return a specific error code or just handle this in UI
      // Ideally, the UI shouldn't even show the button if this is true
      logger.info("[Push] iOS user not in standalone mode");
      return false;
    }

    setIsSubscribing(true);
    const id = toast.loading("Connecting to Booth...");
    logger.info("[Push] Starting subscription process...");

    try {
      // Check for VAPID key immediately
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) {
        toast.error("VAPID Key Missing! Check environment vars.", { id });
        logger.error("[Push] Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");
        return false;
      }

      // 11/10 UX: Explicitly request permission first
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        logger.info("[Push] Requesting Notification permission...");
        const permission = await Notification.requestPermission();
        setPermissionState(permission as PushPermissionState);
        if (permission !== "granted") {
          toast.error("Permission Denied 🚫", { id });
          logger.warn("[Push] User denied notification permission");
          return false;
        }
      }

      // Timeout for Service Worker Ready
      const swTimeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Service Worker timeout")), 5000),
      );

      logger.info("[Push] Waiting for Service Worker...");
      const registration = (await Promise.race([
        navigator.serviceWorker.ready,
        swTimeout,
      ])) as ServiceWorkerRegistration;

      logger.info("[Push] Service Worker ready, subscribing via PushManager...");

      const convertedKey = urlBase64ToUint8Array(vapidKey);

      // Subscribe via Browser PushManager
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedKey,
      });

      // Send to Backend (Cloud Server)
      const response = await fetch(`${getApiBaseUrl()}/api/push/subscribe`, {
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
                Array.from(new Uint8Array(subscription.getKey("p256dh") || new ArrayBuffer(0))),
              ),
            ),
            auth: btoa(
              String.fromCharCode.apply(
                null,
                Array.from(new Uint8Array(subscription.getKey("auth") || new ArrayBuffer(0))),
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
