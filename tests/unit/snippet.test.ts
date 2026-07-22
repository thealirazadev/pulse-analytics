// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SNIPPET_PATH = resolve("public/p.js");
const code = readFileSync(SNIPPET_PATH, "utf8");

describe("snippet budget and safety", () => {
  it("is at most 1536 bytes", () => {
    expect(Buffer.byteLength(code, "utf8")).toBeLessThanOrEqual(1536);
  });

  it("never touches cookies or storage", () => {
    expect(code).not.toMatch(/cookie/i);
    expect(code).not.toMatch(/localStorage/i);
    expect(code).not.toMatch(/sessionStorage/i);
  });
});

describe("snippet behavior", () => {
  const beacon = vi.fn<(url: string, body?: BodyInit | null) => boolean>();
  const nativePush = history.pushState.bind(history);
  const nativeReplace = history.replaceState.bind(history);

  function installScript() {
    document.querySelectorAll("script[data-site]").forEach((el) => el.remove());
    const s = document.createElement("script");
    s.setAttribute("data-site", "pk_test0001");
    s.src = "https://app.example/p.js";
    document.body.appendChild(s);
  }

  function run() {
    new Function(code)();
  }

  function lastBody(): { sid: string; p: string } {
    const call = beacon.mock.calls.at(-1)!;
    return JSON.parse(String(call[1]));
  }

  beforeEach(() => {
    beacon.mockReset().mockReturnValue(true);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
    });
    Object.defineProperty(navigator, "doNotTrack", {
      value: null,
      configurable: true,
    });
    Object.defineProperty(navigator, "globalPrivacyControl", {
      value: undefined,
      configurable: true,
    });
    // undo any wrapping from a previous run before re-evaluating the snippet
    history.pushState = nativePush;
    history.replaceState = nativeReplace;
    history.replaceState({}, "", "/");
    document.body.innerHTML = "";
  });

  it("sends one beacon on load with the current path", () => {
    installScript();
    run();
    expect(beacon).toHaveBeenCalledTimes(1);
    const body = lastBody();
    expect(body.sid).toBe("pk_test0001");
    expect(body.p).toBe("/");
    expect(beacon.mock.calls[0]![0]).toBe("https://app.example/api/collect");
  });

  it("sends a beacon on pushState navigation", () => {
    installScript();
    run();
    history.pushState({}, "", "/pricing?x=1");
    expect(beacon).toHaveBeenCalledTimes(2);
    expect(lastBody().p).toBe("/pricing");
  });

  it("does not re-send for the same path", () => {
    installScript();
    run();
    history.pushState({}, "", "/");
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when Do Not Track is enabled", () => {
    Object.defineProperty(navigator, "doNotTrack", {
      value: "1",
      configurable: true,
    });
    installScript();
    run();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("sends nothing when Global Privacy Control is set", () => {
    Object.defineProperty(navigator, "globalPrivacyControl", {
      value: true,
      configurable: true,
    });
    installScript();
    run();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("records a named custom event via the pulse API", () => {
    installScript();
    run();
    beacon.mockClear();
    (window as unknown as { pulse: (t: string, e: string) => void }).pulse(
      "event",
      "signup",
    );
    expect(beacon).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(beacon.mock.calls[0]![1]));
    expect(body).toEqual({ sid: "pk_test0001", n: "signup" });
    expect(beacon.mock.calls[0]![0]).toBe("https://app.example/api/collect");
  });

  it("ignores pulse calls with a wrong type or missing name", () => {
    installScript();
    run();
    beacon.mockClear();
    const p = (
      window as unknown as { pulse: (t?: string, e?: string) => void }
    ).pulse;
    p("event");
    p("nope", "signup");
    p();
    expect(beacon).not.toHaveBeenCalled();
  });

  it("defines pulse as a safe no-op under Do Not Track", () => {
    Object.defineProperty(navigator, "doNotTrack", {
      value: "1",
      configurable: true,
    });
    installScript();
    run();
    const w = window as unknown as { pulse: (t: string, e: string) => void };
    expect(typeof w.pulse).toBe("function");
    expect(() => w.pulse("event", "signup")).not.toThrow();
    expect(beacon).not.toHaveBeenCalled();
  });
});
