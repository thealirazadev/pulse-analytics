import { EVENT_NAME_PATTERN, normalizePath } from "@/lib/ingest/validate";

/**
 * Hand-rolled validation for goal registration, matching the ingest and site
 * validators. A goal's target is validated by reusing the existing ingest
 * validators: a `path` goal must be a normalized path (same rules as a
 * pageview), an `event` goal must be a valid custom-event name.
 */

export const GOAL_KINDS = ["path", "event"] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const MAX_GOAL_NAME_LENGTH = 80;

export interface ValidGoal {
  kind: GoalKind;
  name: string;
  matchValue: string;
}

export type GoalValidationResult = { ok: true; value: ValidGoal } | { ok: false };

function isGoalKind(input: unknown): input is GoalKind {
  return input === "path" || input === "event";
}

/** Trim and validate a display name; returns it or null. */
export function validateGoalName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (name.length === 0 || name.length > MAX_GOAL_NAME_LENGTH) return null;
  return name;
}

/**
 * Validate the match target for a kind: a normalized path for `path` goals, a
 * custom-event name for `event` goals. Returns the canonical value or null.
 */
export function validateMatchValue(
  kind: GoalKind,
  input: unknown,
): string | null {
  if (kind === "path") return normalizePath(input);
  if (typeof input !== "string") return null;
  return EVENT_NAME_PATTERN.test(input) ? input : null;
}

/** Parse and validate a goal registration payload `{ kind, name, match }`. */
export function validateGoal(input: unknown): GoalValidationResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false };
  }
  const body = input as Record<string, unknown>;
  if (!isGoalKind(body.kind)) return { ok: false };
  const name = validateGoalName(body.name);
  if (name === null) return { ok: false };
  const matchValue = validateMatchValue(body.kind, body.match);
  if (matchValue === null) return { ok: false };
  return { ok: true, value: { kind: body.kind, name, matchValue } };
}
