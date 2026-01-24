"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-white antialiased font-sans">
        <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.1),transparent_50%)]">
          <div className="w-full max-w-md">
            <div className="w-20 h-20 bg-red-500/10 border-2 border-red-500/20 rounded-3xl flex items-center justify-center mx-auto mb-8 animate-pulse">
              <svg
                className="w-10 h-10 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h2 className="text-3xl font-black italic uppercase tracking-tighter mb-4 bg-clip-text text-transparent bg-gradient-to-br from-white to-slate-400">
              Critical Breakdown
            </h2>

            <p className="text-slate-400 font-medium mb-12 max-w-sm mx-auto">
              A serious error occurred at the application root. We've notified our team, but you can
              try to recover.
            </p>

            <div className="flex flex-col gap-4">
              <button
                onClick={() => reset()}
                className="w-full py-4 px-6 bg-white text-slate-950 font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:scale-[1.02] active:scale-[0.98]"
              >
                Restart Application
              </button>

              <button
                onClick={() => window.location.assign("/")}
                className="w-full py-4 px-6 bg-slate-900 border border-slate-800 text-slate-400 font-black uppercase text-xs tracking-widest rounded-2xl transition-all hover:bg-slate-800 hover:text-white"
              >
                Back to Safety
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
