"use client";

import { Radio, RotateCcw } from "lucide-react";
import Link from "next/link";

/**
 * Error boundary for live session pages.
 * Catches errors and allows user to retry or navigate away.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 selection:bg-purple-500/30">
      <div className="w-full max-w-md text-center">
        <div className="w-16 h-16 bg-red-500/10 border-2 border-red-500/30 rounded-2xl flex items-center justify-center mx-auto mb-8">
          <Radio className="w-8 h-8 text-red-500" />
        </div>

        <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter mb-3">
          Connection Lost
        </h2>
        <p className="text-slate-500 text-sm font-medium mb-8">
          {error.message || "Something went wrong while connecting to the session."}
        </p>

        <div className="flex flex-col gap-4">
          <button
            onClick={reset}
            className="w-full py-4 px-6 bg-white text-slate-950 font-black uppercase text-xs tracking-widest rounded-2xl transition-all shadow-xl hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
          >
            <RotateCcw className="w-4 h-4" />
            Try Again
          </button>

          <Link
            href="/"
            className="w-full py-4 px-6 bg-slate-900 border border-slate-800 text-white font-black uppercase text-xs tracking-widest rounded-2xl transition-all hover:bg-slate-800 text-center"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
