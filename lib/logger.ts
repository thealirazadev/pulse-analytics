/**
 * Structured JSON logger: one line per event, machine-parseable.
 *
 * Privacy invariant: it is a programming error to log a visitor IP or raw
 * user agent, so the logger refuses field names that would carry them. The
 * only permitted uses of IP/UA live inside the collect handler and never
 * reach a log call.
 */

export type LogLevel = "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const FORBIDDEN_FIELDS = new Set(["ip", "ipAddress", "userAgent", "user_agent"]);

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  if (fields) {
    for (const key of Object.keys(fields)) {
      if (FORBIDDEN_FIELDS.has(key)) {
        throw new Error(
          `logger: refusing to log privacy-forbidden field "${key}"`,
        );
      }
    }
  }

  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};
