/**
 * Hook for managing WebSocket connection lifecycle
 * Handles connect, disconnect, reconnect, heartbeat, and visibility changes
 */

import { MESSAGE_TYPES } from "@pika/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";
import { getWebSocketUrl } from "@/lib/api";
import { getOrCreateClientId } from "@/lib/client";
import type { ConnectionStatus } from "./types";

interface UseWebSocketConnectionProps {
  targetSessionId?: string;
  onReconnect?: () => void;
}

interface UseWebSocketConnectionReturn {
  socketRef: React.RefObject<ReconnectingWebSocket | null>;
  status: ConnectionStatus;
  sessionId: string | null;
  djName: string | null;
  listenerCount: number;
  send: (message: object) => boolean;
  setSessionId: (id: string | null) => void;
  setDjName: (name: string | null) => void;
  setListenerCount: (count: number) => void;
  lastHeartbeat: number;
}

export function useWebSocketConnection({
  targetSessionId,
}: UseWebSocketConnectionProps): UseWebSocketConnectionReturn {
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const statusRef = useRef<ConnectionStatus>("connecting");

  // Sync ref with state
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const [sessionId, setSessionId] = useState<string | null>(targetSessionId ?? null);
  const [djName, setDjName] = useState<string | null>(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());

  const socketRef = useRef<ReconnectingWebSocket | null>(null);
  const lastPongRef = useRef<number>(Date.now());
  const hasReceivedPongRef = useRef<boolean>(false); // Track if we've received at least one PONG

  // Send a message if connected
  const send = useCallback((message: object): boolean => {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Main WebSocket effect
  useEffect(() => {
    const wsUrl = getWebSocketUrl();
    const clientId = getOrCreateClientId();

    console.log("[Connection] Creating WebSocket:", wsUrl);

    const socket = new ReconnectingWebSocket(wsUrl, [], {
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 1000 + Math.random() * 1000, // 11/10: Randomized jitter
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 5000,
      maxRetries: Infinity,
    });

    socketRef.current = socket;

    // Event handlers
    const handleOpen = () => {
      console.log("[Connection] Connected to cloud");
      setStatus("connected");
      lastPongRef.current = Date.now();
      setLastHeartbeat(Date.now());

      // Send initial message based on context
      if (socket.readyState === WebSocket.OPEN) {
        if (targetSessionId) {
          socket.send(
            JSON.stringify({
              type: MESSAGE_TYPES.SUBSCRIBE,
              clientId,
              sessionId: targetSessionId,
            }),
          );
        } else {
          socket.send(
            JSON.stringify({
              type: "GET_SESSIONS",
              clientId,
            }),
          );
        }
      }
    };

    const handleClose = (event: CloseEvent) => {
      console.log(
        `[Connection] Disconnected from cloud (Code: ${event.code}, Reason: ${event.reason})`,
      );
      setStatus("disconnected");
    };

    const handleError = (error: Event) => {
      console.log("[Connection] WebSocket error:", error);
      setStatus("disconnected");
    };

    // Handle PONG messages for heartbeat
    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "PONG") {
          lastPongRef.current = Date.now();
          hasReceivedPongRef.current = true;
          setLastHeartbeat(Date.now());
        }
      } catch {
        // Ignore parse errors
      }
    };

    socket.addEventListener("open", handleOpen);
    // biome-ignore lint/suspicious/noExplicitAny: WebSocket event types can mismatch between lib and package
    socket.addEventListener("close", handleClose as any);
    // biome-ignore lint/suspicious/noExplicitAny: WebSocket event types can mismatch between lib and package
    socket.addEventListener("error", handleError as any);
    socket.addEventListener("message", handleMessage);

    // 🚀 11/10 Performance: Zero-allocation heartbeat string
    const PING_STR = JSON.stringify({ type: "PING" });

    // Heartbeat monitor (Adaptive)
    const heartbeatInterval = setInterval(() => {
      const isBackground = document.visibilityState === "hidden";

      // Skip heartbeats if backgrounded for too long or not connected
      // This saves battery for dancers who leave the tab open in their pocket
      // 🔋 11/10 Performance: Skip heartbeats if backgrounded
      if (isBackground) return;

      // Send PING (using constant string to avoid GC churn)
      socket.send(PING_STR);

      // Check for stale connection
      if (hasReceivedPongRef.current) {
        const elapsed = Date.now() - lastPongRef.current;
        // Higher threshold for background tabs to avoid aggressive kills
        const timeoutThreshold = isBackground ? 60000 : 30000;

        if (elapsed > timeoutThreshold) {
          console.log(
            `[Connection] Heartbeat timeout (${isBackground ? "BG" : "FG"}), reconnecting...`,
          );
          setStatus("connecting");
          hasReceivedPongRef.current = false;
          socket.reconnect();
        }
      }
    }, 10000); // Check every 10s, but threshold is adaptive

    // Handle browser offline/online events
    const handleOffline = () => {
      console.log("[Connection] Browser offline");
      setStatus("disconnected");
    };

    const handleOnline = () => {
      console.log("[Connection] Browser online, reconnecting...");
      socket.reconnect();
    };

    // Handle visibility change (phone wake from sleep)
    const handleVisibilityChange = () => {
      const readyState = socket.readyState;
      const currentStatus = statusRef.current;

      if (document.visibilityState === "visible") {
        console.log("[Connection] Tab visible, checking connection...");

        // Proactive sync for Safari
        if (readyState === WebSocket.OPEN && currentStatus !== "connected") {
          setStatus("connected");
        }

        // If explicitly disconnected or stale, hammer it back to life
        const isStale = hasReceivedPongRef.current && Date.now() - lastPongRef.current > 30000;

        if (
          readyState === WebSocket.CLOSED ||
          readyState === WebSocket.CLOSING ||
          currentStatus === "disconnected" ||
          isStale
        ) {
          console.log("[Connection] Connection lost or stale, forcing reconnect...");
          setStatus("connecting");
          hasReceivedPongRef.current = false;
          socket.reconnect();
          return;
        }

        // Re-request current state if socket is open
        if (readyState === WebSocket.OPEN) {
          console.log("[Connection] Re-syncing state...");
          lastPongRef.current = Date.now();
          setLastHeartbeat(Date.now());

          if (targetSessionId) {
            socket.send(
              JSON.stringify({
                type: MESSAGE_TYPES.SUBSCRIBE,
                clientId,
                sessionId: targetSessionId,
              }),
            );
          } else {
            socket.send(
              JSON.stringify({
                type: "GET_SESSIONS",
                clientId,
              }),
            );
          }
        }
      }
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    // Safari-specific: handle page restoration from cache
    window.addEventListener("pageshow", handleVisibilityChange);

    return () => {
      clearInterval(heartbeatInterval);
      socket.removeEventListener("open", handleOpen);
      // biome-ignore lint/suspicious/noExplicitAny: mismatching websocket event types
      socket.removeEventListener("close", handleClose as any);
      // biome-ignore lint/suspicious/noExplicitAny: mismatching websocket event types
      socket.removeEventListener("error", handleError as any);
      socket.removeEventListener("message", handleMessage);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pageshow", handleVisibilityChange);
      socket.close();
      socketRef.current = null;
    };
  }, [targetSessionId]);

  return {
    socketRef,
    status,
    sessionId,
    djName,
    listenerCount,
    send,
    setSessionId,
    setDjName,
    setListenerCount,
    lastHeartbeat,
  };
}
