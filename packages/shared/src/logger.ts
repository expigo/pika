/**
 * Pika! Shared Logger
 * Structured logging for production, colored output for development.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

export type ErrorReporter = (message: string, error?: unknown, context?: LogContext) => void;

class PikaLogger {
  private isDev: boolean;
  private reporter: ErrorReporter | null = null;

  constructor() {
    // Basic detection - can be overridden
    this.isDev =
      typeof process !== "undefined" &&
      (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test");
  }

  /**
   * Register a custom error reporter (e.g., Sentry)
   */
  setReporter(reporter: ErrorReporter) {
    this.reporter = reporter;
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

  warn(message: string, error?: unknown, context?: LogContext) {
    const errCtx =
      error instanceof Error
        ? {
            error: error.message,
            stack: error.stack,
            ...context,
          }
        : { error, ...context };

    console.warn(this.format("warn", message, errCtx));

    // Report warnings to external monitoring if they have an error
    if (this.reporter && error) {
      try {
        this.reporter(message, error, context);
      } catch (e) {
        console.error("❌ Logger reporter failed", e);
      }
    }
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

    // Report to external monitoring if available
    if (this.reporter) {
      try {
        this.reporter(message, error, context);
      } catch (e) {
        // Don't let reporter failures crash the logger
        console.error("❌ Logger reporter failed", e);
      }
    }
  }
}

export const logger = new PikaLogger();
