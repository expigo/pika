import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { PIKA_VERSION } from "@pika/shared";
import { Server as SocketIOServer } from "socket.io";
import { createServer } from "node:http";

const app = new Hono();

// Middleware
app.use("*", logger());
app.use("*", cors());

// Health check endpoint
app.get("/health", (c) => {
    return c.json({
        status: "ok",
        version: PIKA_VERSION,
        timestamp: new Date().toISOString(),
    });
});

// Root endpoint
app.get("/", (c) => {
    return c.json({
        name: "Pika! Cloud",
        version: PIKA_VERSION,
        message: "Welcome to Pika! Cloud API",
    });
});

// Active sessions store
interface LiveSession {
    sessionId: string;
    djName: string;
    startedAt: string;
    currentTrack?: {
        artist: string;
        title: string;
        timestamp: string;
    };
}

const activeSessions = new Map<string, LiveSession>();

// Create HTTP server for both Hono and Socket.IO
const port = Number(process.env["PORT"] ?? 3001);
const httpServer = createServer((req, res) => {
    // Handle Hono requests
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    const headers = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
        if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    });

    const request = new Request(url.toString(), {
        method: req.method,
        headers,
    });

    app
        .fetch(request)
        .then((response) => {
            res.statusCode = response.status;
            response.headers.forEach((value, key) => {
                res.setHeader(key, value);
            });
            return response.text();
        })
        .then((body) => {
            res.end(body);
        })
        .catch((err) => {
            console.error("Request error:", err);
            res.statusCode = 500;
            res.end("Internal Server Error");
        });
});

// Initialize Socket.IO
const io = new SocketIOServer(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// Socket.IO event handlers
io.on("connection", (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // DJ registers a live session
    socket.on("register_session", (data: { sessionId: string; djName: string; startedAt: string }) => {
        console.log(`🎧 DJ going live: ${data.djName} (${data.sessionId})`);

        const session: LiveSession = {
            sessionId: data.sessionId,
            djName: data.djName,
            startedAt: data.startedAt,
        };

        activeSessions.set(data.sessionId, session);
        socket.join(`session:${data.sessionId}`);

        // Broadcast to listeners that a new session started
        io.emit("session_started", session);
    });

    // DJ sends now playing update
    socket.on("now_playing", (data: {
        sessionId: string;
        track: { artist: string; title: string; timestamp: string };
    }) => {
        console.log(`🎵 Now playing: ${data.track.artist} - ${data.track.title}`);

        const session = activeSessions.get(data.sessionId);
        if (session) {
            session.currentTrack = data.track;
            activeSessions.set(data.sessionId, session);

            // Broadcast to all listeners of this session
            io.to(`session:${data.sessionId}`).emit("track_changed", {
                sessionId: data.sessionId,
                track: data.track,
            });

            // Also broadcast globally for any dashboards
            io.emit("now_playing_update", {
                sessionId: data.sessionId,
                djName: session.djName,
                track: data.track,
            });
        }
    });

    // DJ ends session
    socket.on("end_session", (data: { sessionId: string }) => {
        console.log(`👋 Session ended: ${data.sessionId}`);

        const session = activeSessions.get(data.sessionId);
        if (session) {
            activeSessions.delete(data.sessionId);
            socket.leave(`session:${data.sessionId}`);

            io.emit("session_ended", { sessionId: data.sessionId, djName: session.djName });
        }
    });

    // Listener wants to follow a session
    socket.on("follow_session", (data: { sessionId: string }) => {
        socket.join(`session:${data.sessionId}`);
        console.log(`👀 Listener joined session: ${data.sessionId}`);

        // Send current track if available
        const session = activeSessions.get(data.sessionId);
        if (session?.currentTrack) {
            socket.emit("track_changed", {
                sessionId: data.sessionId,
                track: session.currentTrack,
            });
        }
    });

    // Get all active sessions
    socket.on("get_sessions", () => {
        socket.emit("sessions_list", Array.from(activeSessions.values()));
    });

    socket.on("disconnect", () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
    });
});

// Start the server
httpServer.listen(port, () => {
    console.log(`🚀 Pika! Cloud server running on http://localhost:${port}`);
    console.log(`📡 WebSocket server ready for live sessions`);
});
