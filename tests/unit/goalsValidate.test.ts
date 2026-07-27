import { describe, expect, it } from "vitest";
import {
  validateGoal,
  validateGoalName,
  validateMatchValue,
} from "@/lib/goals/validate";

describe("validateGoal", () => {
  it("accepts a path goal and normalizes the target path", () => {
    const res = validateGoal({
      kind: "path",
      name: "Thank you",
      match: "/thank-you?ref=x#top",
    });
    expect(res).toEqual({
      ok: true,
      value: { kind: "path", name: "Thank you", matchValue: "/thank-you" },
    });
  });

  it("accepts an event goal with a valid event name", () => {
    const res = validateGoal({ kind: "event", name: "Signups", match: "signup" });
    expect(res).toEqual({
      ok: true,
      value: { kind: "event", name: "Signups", matchValue: "signup" },
    });
  });

  it("rejects an unknown kind", () => {
    expect(validateGoal({ kind: "click", name: "x", match: "/a" }).ok).toBe(
      false,
    );
  });

  it("rejects an empty or over-length name", () => {
    expect(validateGoal({ kind: "path", name: "  ", match: "/a" }).ok).toBe(
      false,
    );
    expect(
      validateGoal({ kind: "path", name: "n".repeat(81), match: "/a" }).ok,
    ).toBe(false);
  });

  it("rejects a path goal whose target is not a normalized path", () => {
    expect(validateGoal({ kind: "path", name: "x", match: "no-slash" }).ok).toBe(
      false,
    );
  });

  it("rejects an event goal whose target fails the event name allowlist", () => {
    expect(
      validateGoal({ kind: "event", name: "x", match: "bad name!" }).ok,
    ).toBe(false);
    expect(
      validateGoal({ kind: "event", name: "x", match: "n".repeat(65) }).ok,
    ).toBe(false);
  });

  it("rejects non-object and non-string inputs", () => {
    expect(validateGoal(null).ok).toBe(false);
    expect(validateGoal([]).ok).toBe(false);
    expect(validateGoal({ kind: "path", name: 5, match: "/a" }).ok).toBe(false);
    expect(validateGoal({ kind: "event", name: "x", match: 5 }).ok).toBe(false);
  });
});

describe("validateGoalName / validateMatchValue", () => {
  it("trims and bounds the name", () => {
    expect(validateGoalName("  Hello  ")).toBe("Hello");
    expect(validateGoalName("")).toBeNull();
    expect(validateGoalName(123)).toBeNull();
  });

  it("validates a match value per kind", () => {
    expect(validateMatchValue("path", "/checkout")).toBe("/checkout");
    expect(validateMatchValue("path", "checkout")).toBeNull();
    expect(validateMatchValue("event", "purchase")).toBe("purchase");
    expect(validateMatchValue("event", "buy now")).toBeNull();
  });
});
