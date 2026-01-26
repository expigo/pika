"use client";

import * as Sentry from "@sentry/nextjs";
import { Download, Share, X } from "lucide-react";
import { useEffect, useState } from "react";

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // Handle Android/Desktop "beforeinstallprompt"
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Determine if we should show it (e.g. check local storage if dismissed recently)
      // For now, show after 10 seconds of usage
      setTimeout(() => setIsVisible(true), 10000);
    };

    // Detect iOS
    const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIosDevice) {
      setIsIOS(true);
      setTimeout(() => setIsVisible(true), 10000);
    }

    // Handle App Installed Event (Analytics)
    const handleAppInstalled = () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      Sentry.captureMessage("PWA Installed", "info");
      Sentry.setTag("pwa_mode", "installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!isVisible) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    }
  };

  return (
    <div className="fixed bottom-[5.5rem] left-4 right-4 z-[100] animate-in slide-in-from-bottom duration-500 md:bottom-4 md:left-auto md:right-8 md:w-96">
      <div className="flex items-start gap-4 rounded-xl border border-zinc-800 bg-zinc-900/95 p-4 shadow-2xl backdrop-blur-md">
        <button
          onClick={() => setIsVisible(false)}
          className="absolute right-2 top-2 rounded-full p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="rounded-lg bg-zinc-800 p-2">
          <Download className="h-6 w-6 text-pink-500" />
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-white">Install Pika!</h3>
          <p className="mt-1 text-sm text-zinc-400">
            {isIOS
              ? "Install specifically for offline usage and better performance."
              : "Add to home screen for offline usage and instant access."}
          </p>

          {isIOS ? (
            <div className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
              <span>Tap</span>
              <Share className="h-4 w-4" />
              <span>then "Add to Home Screen"</span>
            </div>
          ) : (
            <button
              onClick={handleInstallClick}
              className="mt-3 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200"
            >
              Install App
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
