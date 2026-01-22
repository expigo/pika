import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://pika.stream"),
  title: "Pika! - Real-time DJ Feedback for WCS",
  description:
    "The intelligent companion for West Coast Swing DJs and Dancers. Real-time track info, tempo voting, and analytics.",
  keywords: "WCS, West Coast Swing, DJ, live, real-time, feedback, dance, music analytics",
  robots: "index, follow",
  openGraph: {
    title: "Pika! - Real-time DJ Feedback",
    description:
      "Connect with the DJ booth in real-time. Vote on tempo, like tracks, and view session recaps.",
    siteName: "Pika! Live",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Pika! - Live DJ Feedback",
    description: "Real-time engagement for West Coast Swing events.",
    images: ["/twitter-image.png"],
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
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
        <BottomNav />
      </body>
    </html>
  );
}
