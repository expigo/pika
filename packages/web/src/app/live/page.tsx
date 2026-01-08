"use client";

import { LivePlayer } from "@/components/LivePlayer";

/**
 * /live - Auto-join the first active DJ session
 * 
 * This is where WebSocket connections happen.
 * Used when a dancer wants to "find any live session".
 */
export default function LivePage() {
    return <LivePlayer />;
}
