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
      minReconnectionDelay: 1000,
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 5000,
      maxRetries: Infinity,
    });

    socketRef.current = socket;

    socket.onopen = () => {
      console.log("[Connection] Connected to cloud");
      setStatus("connected");
      lastPongRef.current = Date.now();

      // Send initial message based on context
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
    };

    socket.onclose = (event) => {
      console.log(
        `[Connection] Disconnected from cloud (Code: ${event.code}, Reason: ${event.reason})`,
      );
      setStatus("disconnected");
    };

    socket.onerror = (error) => {
      console.log("[Connection] WebSocket error:", error);
      setStatus("disconnected");
    };

    // Heartbeat monitor
    const heartbeatInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "PING" }));
      }

      // Only check for stale connection AFTER we've received at least one PONG
      // This prevents reconnection loops on initial load
      if (hasReceivedPongRef.current) {
        const elapsed = Date.now() - lastPongRef.current;
        if (elapsed > 30000 && socket.readyState === WebSocket.OPEN) {
          console.log("[Connection] Heartbeat timeout, reconnecting...");
          setStatus("connecting");
          hasReceivedPongRef.current = false; // Reset for next connection
          socket.reconnect();
        }
      }
    }, 10000);

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
      if (document.visibilityState === "visible") {
        console.log("[Connection] Tab visible, checking connection...");

        // Only check staleness if we've established connection before
        if (hasReceivedPongRef.current) {
          const elapsed = Date.now() - lastPongRef.current;

          if (elapsed > 15000) {
            console.log("[Connection] Stale connection, reconnecting...");
            setStatus("connecting");
            hasReceivedPongRef.current = false; // Reset for next connection
            socket.reconnect();
            return;
          }
        }

        // Re-request current state if socket is open
        if (socket.readyState === WebSocket.OPEN) {
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
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      socket.close();
      socketRef.current = null;
    };
  }, [targetSessionId]); // Removed 'status' dependency to prevent infinite loops

  // Update lastPong on PONG messages (called from parent)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const originalOnMessage = socket.onmessage;
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "PONG") {
          lastPongRef.current = Date.now();
          hasReceivedPongRef.current = true; // Mark that we've received at least one PONG
          setLastHeartbeat(Date.now());
        }
      } catch {
        // Ignore parse errors
      }

      // Call original handler
      originalOnMessage?.call(socket, event);
    };
  }, []);

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
