"use client";

import { Music2 } from "lucide-react";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
      <div className="mb-6 rounded-full bg-zinc-900 p-6">
        <Music2 className="h-12 w-12 text-zinc-500" />
      </div>

      <h1 className="mb-2 text-2xl font-bold">You are offline</h1>
      <p className="mb-8 max-w-sm text-zinc-400">
        Pika! works best with an internet connection. Your votes will be queued and sent
        automatically when you reconnect.
      </p>

      <div className="flex gap-4">
        <button
          onClick={() => window.location.reload()}
          className="rounded-full bg-white px-6 py-2 font-medium text-black transition hover:bg-zinc-200"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="rounded-full border border-zinc-800 px-6 py-2 font-medium transition hover:bg-zinc-900"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
