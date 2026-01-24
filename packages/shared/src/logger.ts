/**
 * Pika! Shared Logger
 * Structured logging for production, colored output for development.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

class PikaLogger {
  private isDev: boolean;

  constructor() {
    // Basic detection - can be overridden
    this.isDev =
      typeof process !== "undefined" &&
      (process.env["NODE_ENV"] === "development" || process.env["NODE_ENV"] === "test");
  }

  private format(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();

    if (this.isDev) {
      // Colorized output for Dev
      const colors = {
        debug: "\x1b[34m", // Blue
        info: "\x1b[32m", // Green
        warn: "\x1b[33m", // Yellow
        error: "\x1b[31m", // Red
        reset: "\x1b[0m",
      };

      const icon = {
        debug: "🐛",
        info: "ℹ️",
        warn: "⚠️",
        error: "❌",
      };

      const ctxStr = context ? `\n${JSON.stringify(context, null, 2)}` : "";
      return `${colors[level]}${icon[level]} [${timestamp}] ${message}${colors.reset}${ctxStr}`;
    }

    // JSON structure for Production (Datadog/Splunk/CloudWatch friendly)
    // Strip emojis from the message for cleaner querying
    // Matches common emoji ranges: Miscellaneous Symbols and Pictographs, Dingbats, Emoticons, Transport/Map
    const cleanMessage = message
      .replace(
        /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu,
        "",
      )
      .trim();

    return JSON.stringify({
      timestamp,
      level,
      message: cleanMessage,
      ...context,
    });
  }

  debug(message: string, context?: LogContext) {
    if (this.isDev) {
      console.debug(this.format("debug", message, context));
    }
  }

  info(message: string, context?: LogContext) {
    console.info(this.format("info", message, context));
  }

  warn(message: string, context?: LogContext) {
    console.warn(this.format("warn", message, context));
  }

  error(message: string, error?: unknown, context?: LogContext) {
    const errCtx =
      error instanceof Error
        ? {
            error: error.message,
            stack: error.stack,
            ...context,
          }
        : { error, ...context };

    console.error(this.format("error", message, errCtx));
  }
}

export const logger = new PikaLogger();
