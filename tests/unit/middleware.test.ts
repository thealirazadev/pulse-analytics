import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "@/middleware";
import { SESSION_COOKIE } from "@/lib/auth/constants";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("middleware guard", () => {
  it("redirects unauthenticated page requests to /login", () => {
    const res = middleware(request("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("returns 401 for unauthenticated api requests", () => {
    const res = middleware(request("/api/sites"));
    expect(res.status).toBe(401);
  });

  it("lets requests with a session cookie through", () => {
    const res = middleware(request("/dashboard", `${SESSION_COOKIE}=anything`));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
