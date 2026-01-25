/**
 * Hook for managing WebSocket connection lifecycle
 * Handles connect, disconnect, reconnect, heartbeat, and visibility changes
 */

import { MESSAGE_TYPES, logger } from "@pika/shared";
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

  const [sessionId, setSessionIdState] = useState<string | null>(targetSessionId ?? null);
  const sessionIdRef = useRef<string | null>(targetSessionId ?? null);

  // Sync ref with state
  const setSessionId = useCallback((id: string | null) => {
    setSessionIdState(id);
    sessionIdRef.current = id;
  }, []);

  const [djName, setDjName] = useState<string | null>(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [lastHeartbeat, setLastHeartbeat] = useState<number>(Date.now());

  const socketRef = useRef<ReconnectingWebSocket | null>(null);
  const lastPongRef = useRef<number>(Date.now());
  const lastHiddenAtRef = useRef<number | null>(null); // Track when tab went background
  const hasReceivedPongRef = useRef<boolean>(false); // Track if we've received at least one PONG
  const isHardReconnectingRef = useRef<boolean>(false); // Prevent redundant hard reconnects

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

    logger.debug("[Connection] Creating WebSocket", { wsUrl });

    const socket = new ReconnectingWebSocket(wsUrl, [], {
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 1000 + Math.random() * 1000, // 11/10: Randomized jitter
      reconnectionDelayGrowFactor: 1.3,
      connectionTimeout: 5000,
      maxRetries: Infinity,
    });

    socketRef.current = socket;
    isHardReconnectingRef.current = false;

    // Event handlers
    const handleOpen = () => {
      logger.info("[Connection] Connected to cloud");
      setStatus("connected");
      isHardReconnectingRef.current = false;
      lastPongRef.current = Date.now();
      setLastHeartbeat(Date.now());

      // Send initial message based on context
      // Use ref to get latest discovered sessionId if targetSessionId isn't provided (Audit Item 1)
      const sid = targetSessionId || sessionIdRef.current;

      if (socket.readyState === WebSocket.OPEN) {
        if (sid) {
          logger.debug("[Connection] Subscribing to session", { sessionId: sid });
          socket.send(
            JSON.stringify({
              type: MESSAGE_TYPES.SUBSCRIBE,
              clientId,
              sessionId: sid,
            }),
          );
        } else {
          logger.debug("[Connection] Listing sessions");
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
      // Demote to debug if it's a normal close or if we're already reconnecting
      const level = event.wasClean ? "debug" : "info";
      logger[level]("[Connection] Disconnected from cloud", {
        code: event.code,
        reason: event.reason,
        clean: event.wasClean,
      });
      setStatus("disconnected");
    };

    const handleError = (_error: Event) => {
      // 🛡️ MOBILE STABILITY: Errors are common on mobile during network transitions.
      // Don't flood stdout with errors unless they are persistent.
      logger.warn("[Connection] WebSocket error (will retry)", {
        status: statusRef.current,
        readyState: socket.readyState,
      });
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

      const now = Date.now();

      // Send PING (using constant string to avoid GC churn)
      socket.send(PING_STR);

      // Check for stale connection
      if (hasReceivedPongRef.current) {
        const elapsed = now - lastPongRef.current;
        // Higher threshold for background tabs to avoid aggressive kills
        const timeoutThreshold = isBackground ? 60000 : 30000;

        if (elapsed > timeoutThreshold) {
          logger.warn("[Connection] Heartbeat timeout", {
            mode: isBackground ? "BG" : "FG",
            elapsed,
          });
          setStatus("connecting");
          hasReceivedPongRef.current = false;
          socket.reconnect();
        }
      }
    }, 10000); // Check every 10s, but threshold is adaptive

    // Handle browser offline/online events
    const handleOffline = () => {
      logger.info("[Connection] Browser offline");
      setStatus("disconnected");
    };

    const handleOnline = () => {
      logger.info("[Connection] Browser online, reconnecting...");
      socket.reconnect();
    };

    // Handle visibility change (phone wake from sleep)
    const handleVisibilityChange = () => {
      const readyState = socket.readyState;
      const currentStatus = statusRef.current;

      if (document.visibilityState === "visible") {
        logger.debug("[Connection] Tab visible, checking connection");
        const now = Date.now();
        const backgroundDuration = lastHiddenAtRef.current ? now - lastHiddenAtRef.current : 0;
        lastHiddenAtRef.current = null;

        // Proactive sync for Safari
        if (readyState === WebSocket.OPEN && currentStatus !== "connected") {
          setStatus("connected");
        }

        // 🛡️ RECOVERY: If backgrounded for > 5s, the socket is likely aborted by iOS.
        // Even if readyState says OPEN, we hammer it back to life to avoid "Software caused connection abort" (Audit Item 1).
        const isStale = hasReceivedPongRef.current && now - lastPongRef.current > 30000;
        const needsHardRefresh = backgroundDuration > 5000 || isStale;

        if (
          !isHardReconnectingRef.current &&
          (readyState === WebSocket.CLOSED ||
            readyState === WebSocket.CLOSING ||
            currentStatus === "disconnected" ||
            needsHardRefresh)
        ) {
          logger.info("[Connection] Connection lost or stale, forcing hard reconnect", {
            duration: backgroundDuration,
            isStale,
            readyState,
          });
          setStatus("connecting");
          hasReceivedPongRef.current = false;
          isHardReconnectingRef.current = true;
          // Use hard reset (socket.reconnect handles clean close/open)
          // 🛡️ RACE PROTECTION: We return immediately and wait for handleOpen
          socket.reconnect();
          return;
        }

        // 🟢 SYNC PATH: If the socket is ALREADY open (e.g. quick tab switch),
        // we just re-request state to catch up on anything missed while hidden.
        if (readyState === WebSocket.OPEN && !isHardReconnectingRef.current) {
          logger.debug("[Connection] Re-syncing state (Socket already open)");
          lastPongRef.current = Date.now();
          setLastHeartbeat(Date.now());

          // Use ref to get latest session ID (Audit Item 1)
          const sid = targetSessionId || sessionIdRef.current;

          try {
            if (sid) {
              socket.send(
                JSON.stringify({
                  type: MESSAGE_TYPES.SUBSCRIBE,
                  clientId,
                  sessionId: sid,
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
          } catch (e) {
            logger.warn("[Connection] Failed to send re-sync, reconnecting...", e);
            socket.reconnect();
          }
        }
      } else if (document.visibilityState === "hidden") {
        lastHiddenAtRef.current = Date.now();
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
