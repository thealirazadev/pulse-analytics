import { describe, expect, it } from "vitest";
import { apiError, errorBody } from "@/lib/errors";

describe("error format", () => {
  it("produces the single error body shape", () => {
    expect(errorBody("invalid_payload", "Path must start with '/'.")).toEqual({
      error: { code: "invalid_payload", message: "Path must start with '/'." },
    });
  });

  it("falls back to a default message per code", () => {
    const body = errorBody("not_found");
    expect(body.error.code).toBe("not_found");
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it("maps codes to their default HTTP status", async () => {
    expect(apiError("payload_too_large").status).toBe(413);
    expect(apiError("rate_limited").status).toBe(429);
    expect(apiError("unauthorized").status).toBe(401);
    const res = apiError("conflict");
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: { code: "conflict", message: expect.any(String) },
    });
  });
});
