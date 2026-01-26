"use client";

import { usePushNotifications } from "@/hooks/live";
import { Bell, BellOff, Loader2 } from "lucide-react";

export function NotificationToggle() {
  const { permissionState, isSubscribing, subscribe, isSupported } = usePushNotifications();

  if (!isSupported) return null;

  if (permissionState === "granted") {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-green-500/20 bg-green-500/10 px-4 py-3 text-green-400">
        <Bell className="h-5 w-5" />
        <div className="flex-1 text-sm font-medium">Notifications Enabled</div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-pink-500/10 p-2 text-pink-500">
          <Bell className="h-5 w-5" />
        </div>
        <div>
          <h4 className="font-semibold text-zinc-100">Get Live Alerts</h4>
          <p className="text-sm text-zinc-400">
            Be the first to know when the DJ goes live or starts a poll.
          </p>
        </div>
      </div>

      <button
        onClick={subscribe}
        disabled={isSubscribing || permissionState === "denied"}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-pink-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-pink-500 disabled:opacity-50"
      >
        {isSubscribing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Enabling...
          </>
        ) : permissionState === "denied" ? (
          <>
            <BellOff className="h-4 w-4" />
            Notifications Blocked
          </>
        ) : (
          "Enable Notifications"
        )}
      </button>

      {permissionState === "denied" && (
        <p className="text-xs text-red-400 text-center">
          You have blocked notifications. Please enable them in your browser settings.
        </p>
      )}

      {/* iOS Warning */}
      {typeof navigator !== "undefined" &&
        /iPad|iPhone|iPod/.test(navigator.userAgent) &&
        !(window as any).MSStream &&
        !window.matchMedia("(display-mode: standalone)").matches && (
          <p className="text-xs text-amber-400 text-center mt-2">
            iOS users: Tap "Share" → "Add to Home Screen" to enable notifications.
          </p>
        )}
    </div>
  );
}
