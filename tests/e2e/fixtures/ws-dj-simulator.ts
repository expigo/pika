/**
 * WebSocket DJ Simulator
 * Simulates a DJ session at the WebSocket protocol level.
 * Used for E2E testing without requiring the Desktop app.
 */

import WebSocket from "ws";

export interface DjSimulatorConfig {
  wsUrl?: string;
  djName?: string;
}

export interface TrackInfo {
  title: string;
  artist: string;
  bpm?: number;
  energy?: number;
  danceability?: number;
}

export class DjSimulator {
  private ws: WebSocket | null = null;
  private sessionId: string;
  private djName: string;
  private wsUrl: string;
  private receivedMessages: Record<string, unknown>[] = [];
  private likeCount = 0;
  private isRegistered = false;

  constructor(config: DjSimulatorConfig = {}) {
    this.wsUrl = config.wsUrl || "ws://localhost:3001/ws";
    this.djName = config.djName || `E2E-DJ-${Date.now()}`;
    this.sessionId = `e2e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Connect to the Cloud WebSocket and register a session.
   */
  async connect(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on("open", () => {
        // Register as DJ session
        // This must match the format expected by REGISTER_SESSION handler
        this.send({
          type: "REGISTER_SESSION",
          sessionId: this.sessionId,
          djName: this.djName,
        });
      });

      this.ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.receivedMessages.push(msg);

          // Handle session registration confirmation
          if (msg.type === "SESSION_REGISTERED") {
            this.isRegistered = true;
            console.log(`[DjSimulator] Session registered: ${this.sessionId}`);
            resolve(this.sessionId);
          }

          // Track likes received (LIKE_RECEIVED or LIKES_BATCHED from Cloud)
          if (msg.type === "LIKE_RECEIVED") {
            this.likeCount += 1;
            console.log(`[DjSimulator] Like received! Total: ${this.likeCount}`);
          }
          if (msg.type === "LIKES_BATCHED") {
            this.likeCount += msg.count || 1;
            console.log(`[DjSimulator] Likes batched: ${msg.count}. Total: ${this.likeCount}`);
          }
        } catch (e) {
          console.error("[DjSimulator] Failed to parse message:", e);
        }
      });

      this.ws.on("error", (err) => {
        console.error("[DjSimulator] WebSocket error:", err);
        reject(err);
      });

      this.ws.on("close", () => {
        console.log("[DjSimulator] Connection closed");
      });

      // Timeout after 10s
      setTimeout(() => {
        if (!this.isRegistered) {
          reject(new Error("Session registration timeout"));
        }
      }, 10000);
    });
  }

  /**
   * Broadcast a track as "Now Playing"
   * Uses BROADCAST_TRACK message type (DJ → Cloud → Audience)
   */
  broadcastTrack(track: TrackInfo): void {
    if (!this.isRegistered) {
      console.warn("[DjSimulator] Cannot broadcast - session not registered");
      return;
    }

    // BROADCAST_TRACK is the DJ client message
    // Cloud will convert this to NOW_PLAYING for audience
    this.send({
      type: "BROADCAST_TRACK",
      sessionId: this.sessionId,
      track: {
        title: track.title,
        artist: track.artist,
        bpm: track.bpm || 120,
        energy: track.energy || 0.7,
        danceability: track.danceability || 0.8,
      },
    });
    console.log(`[DjSimulator] Broadcasted track: ${track.artist} - ${track.title}`);
  }

  /**
   * Get the current like count received
   */
  getLikeCount(): number {
    return this.likeCount;
  }

  /**
   * Wait for a specific number of likes to be received
   */
  async waitForLikes(count: number, timeoutMs = 10000): Promise<boolean> {
    const start = Date.now();
    while (this.likeCount < count) {
      if (Date.now() - start > timeoutMs) {
        return false;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return true;
  }

  /**
   * Get the session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get DJ name
   */
  getDjName(): string {
    return this.djName;
  }

  /**
   * Get all received messages
   */
  getMessages(): Record<string, unknown>[] {
    return [...this.receivedMessages];
  }

  /**
   * Check if session is registered
   */
  isSessionRegistered(): boolean {
    return this.isRegistered;
  }

  /**
   * Close the connection
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isRegistered = false;
    }
  }

  private send(message: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn("[DjSimulator] Cannot send - WebSocket not open");
    }
  }
}

/**
 * Helper function for quick session setup
 */
export async function createDjSession(
  config: DjSimulatorConfig & { track?: TrackInfo } = {},
): Promise<DjSimulator> {
  const simulator = new DjSimulator(config);
  await simulator.connect();

  // Small delay to ensure registration is fully processed
  await new Promise((r) => setTimeout(r, 500));

  if (config.track) {
    simulator.broadcastTrack(config.track);
    // Small delay to ensure track is broadcasted
    await new Promise((r) => setTimeout(r, 500));
  }

  return simulator;
}
