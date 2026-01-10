"use client";

import { use } from "react";
import { LivePlayer } from "@/components/LivePlayer";

/**
 * /live/[sessionId] - Join a specific DJ session
 *
 * This is the target URL for QR codes.
 * WebSocket connects only to this specific session.
 */
export default function SessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = use(params);

  return <LivePlayer targetSessionId={sessionId} />;
}
