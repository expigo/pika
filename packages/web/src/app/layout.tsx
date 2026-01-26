import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { WebVitals } from "@/components/WebVitals";
import "./globals.css";
import { logger } from "@pika/shared";
import * as Sentry from "@sentry/nextjs";

// Register Sentry as the reporter for the shared logger
logger.setReporter((message, error, context) => {
  if (error instanceof Error) {
    Sentry.captureException(error, {
      extra: { logMessage: message, ...context },
    });
  } else {
    Sentry.captureMessage(message, {
      level: "error",
      extra: { error, ...context },
    });
  }
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { RegisterPWA } from "@/components/pwa/RegisterPWA";
import { Toaster } from "sonner";
// ... existing imports

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://pika.stream"),
  manifest: "/manifest.json",
  title: "Pika! - Real-time DJ Feedback for WCS",
  description:
    "The intelligent companion for West Coast Swing DJs and Dancers. Real-time track info, tempo voting, and analytics.",
  applicationName: "Pika!",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pika!",
  },
  formatDetection: {
    telephone: false,
  },
  keywords: "WCS, West Coast Swing, DJ, live, real-time, feedback, dance, music analytics",
  robots: "index, follow",
  openGraph: {
    title: "Pika! - Real-time DJ Feedback",
    description:
      "Connect with the DJ booth in real-time. Vote on tempo, like tracks, and view session recaps.",
    siteName: "Pika! Live",
    images: [{ url: "/og-image.jpg", width: 1024, height: 1024 }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pika! - Live DJ Feedback",
    description: "Real-time engagement for West Coast Swing events.",
    images: ["/twitter-image.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased text-slate-200 bg-slate-950 selection:bg-pink-500/30 selection:text-pink-200"
        suppressHydrationWarning
      >
        <Toaster
          position="bottom-center"
          toastOptions={{
            style: { background: "#1e293b", border: "1px solid #334155", color: "#f8fafc" },
          }}
        />
        <WebVitals />
        {/* Skip to content link for keyboard navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-purple-600 focus:text-white focus:rounded-lg focus:font-bold focus:text-sm"
        >
          Skip to content
        </a>
        <main id="main-content" className="pb-20 sm:pb-0">
          {children}
        </main>
        <RegisterPWA />
        <InstallPrompt />
        <BottomNav />
      </body>
    </html>
  );
}
