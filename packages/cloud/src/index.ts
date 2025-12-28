import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { PIKA_VERSION } from "@pika/shared";

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

const port = process.env["PORT"] ?? 3000;

console.log(`🚀 Pika! Cloud server running on http://localhost:${port}`);

export default {
    port,
    fetch: app.fetch,
};
