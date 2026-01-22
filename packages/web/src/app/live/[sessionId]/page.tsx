"use client";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LivePlayer } from "@/components/LivePlayer";
import { use } from "react";

/**
 * /live/[sessionId] - Join a specific DJ session
 *
 * This is the target URL for QR codes.
 * WebSocket connects only to this specific session.
 */
export default function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);

  return (
    <ErrorBoundary>
      <LivePlayer targetSessionId={sessionId} />
    </ErrorBoundary>
  );
}
