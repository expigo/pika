"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function RootError({
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
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
      <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-2xl max-w-md">
        <h2 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">
          Something went wrong
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm">
          We encountered an unexpected error.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-full font-medium text-sm hover:opacity-90 transition-opacity"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
