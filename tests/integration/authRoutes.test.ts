import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { SESSION_COOKIE } from "@/lib/auth/constants";
import { resetLoginLimits } from "@/lib/auth/loginLimit";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { resetEnvCache } from "@/lib/env";

const EMAIL = "admin@example.com";
const PASSWORD = "s3cret-pass-123";

function loginRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "10.0.0.1",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe("auth routes", () => {
  beforeAll(() => {
    process.env.ADMIN_EMAIL = EMAIL;
    process.env.ADMIN_PASSWORD_HASH = hashPassword(PASSWORD);
    resetEnvCache();
  });
  beforeEach(resetLoginLimits);

  it("sets an HttpOnly SameSite=Lax cookie on correct credentials", async () => {
    const res = await login(loginRequest({ email: EMAIL, password: PASSWORD }));
    expect(res.status).toBe(204);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=lax");
  });

  it("rejects wrong credentials with 401 and no cookie", async () => {
    const res = await login(loginRequest({ email: EMAIL, password: "nope" }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({
      error: { code: "invalid_credentials" },
    });
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("does not reveal which field was wrong", async () => {
    const wrongEmail = await login(
      loginRequest({ email: "someone@else.com", password: PASSWORD }),
    );
    const wrongPass = await login(
      loginRequest({ email: EMAIL, password: "bad" }),
    );
    const a = await wrongEmail.json();
    const b = await wrongPass.json();
    expect(a).toEqual(b);
  });

  it("rate limits after five attempts", async () => {
    let last = 200;
    for (let i = 0; i < 6; i++) {
      const res = await login(loginRequest({ email: EMAIL, password: "x" }));
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it("logout clears the cookie when authenticated", async () => {
    const token = createSession(EMAIL);
    const req = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    const res = await logout(req);
    expect(res.status).toBe(204);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie.toLowerCase()).toMatch(/max-age=0|expires=/);
  });

  it("logout without a valid session returns 401", async () => {
    const req = new NextRequest("http://localhost:3000/api/auth/logout", {
      method: "POST",
    });
    const res = await logout(req);
    expect(res.status).toBe(401);
  });
});
