/**
 * Structured Logger
 *
 * Provides leveled logging with consistent formatting.
 * Respects environment (quieter in production).
 *
 * @package @pika/desktop
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LoggerConfig {
  minLevel: LogLevel;
  enableTimestamps: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_EMOJI: Record<LogLevel, string> = {
  debug: "🔍",
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
};

class Logger {
  private config: LoggerConfig;

  constructor() {
    // Default: debug in dev, info in production
    const isDev = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

    this.config = {
      minLevel: isDev ? "debug" : "info",
      enableTimestamps: false,
    };
  }

  /**
   * Configure logger settings
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Set minimum log level
   */
  setLevel(level: LogLevel): void {
    this.config.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  private formatMessage(module: string, message: string): string {
    const timestamp = this.config.enableTimestamps ? `[${new Date().toISOString()}] ` : "";
    return `${timestamp}[${module}] ${message}`;
  }

  private log(level: LogLevel, module: string, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;

    const formattedMessage = this.formatMessage(module, message);
    const prefix = LOG_EMOJI[level];

    // Choose appropriate console method
    const consoleMethod = level === "debug" ? "log" : level;

    if (data !== undefined) {
      console[consoleMethod](`${prefix} ${formattedMessage}`, data);
    } else {
      console[consoleMethod](`${prefix} ${formattedMessage}`);
    }
  }

  /**
   * Debug level - verbose development information
   */
  debug(module: string, message: string, data?: unknown): void {
    this.log("debug", module, message, data);
  }

  /**
   * Info level - general operational information
   */
  info(module: string, message: string, data?: unknown): void {
    this.log("info", module, message, data);
  }

  /**
   * Warn level - potential issues that don't break functionality
   */
  warn(module: string, message: string, data?: unknown): void {
    this.log("warn", module, message, data);
  }

  /**
   * Error level - errors that affect functionality
   */
  error(module: string, message: string, data?: unknown): void {
    this.log("error", module, message, data);
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();
