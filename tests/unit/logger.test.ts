import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "@/lib/logger";

describe("logger", () => {
  afterEach(() => vi.restoreAllMocks());

  it("emits one structured JSON line with level, event, and fields", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("ingest_accepted", { siteId: 3, status: 202 });
    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      level: "info",
      event: "ingest_accepted",
      siteId: 3,
      status: 202,
    });
    expect(typeof parsed.ts).toBe("string");
  });

  it("writes errors to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("rollup_failed", { code: "internal" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("refuses to log an ip field", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => logger.info("x", { ip: "203.0.113.5" })).toThrow(/ip/);
  });

  it("refuses to log a userAgent field", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(() => logger.info("x", { userAgent: "Mozilla/5.0" })).toThrow(
      /userAgent/,
    );
  });
});
