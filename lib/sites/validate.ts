import { randomBytes } from "node:crypto";

/**
 * Hand-rolled validation for site registration, matching the pattern of the
 * ingest and stats validators. A domain must be a bare hostname (no scheme,
 * port, or path); a name is a non-empty label up to 80 chars.
 */

export const MAX_NAME_LENGTH = 80;

// Dotted hostname: labels of a-z0-9 (hyphens allowed inside), an alphabetic TLD.
const DOMAIN_PATTERN =
  /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/** Lowercase and validate a domain; returns the bare hostname or null. */
export function validateDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const domain = input.trim().toLowerCase();
  if (!DOMAIN_PATTERN.test(domain)) return null;
  return domain;
}

/** Trim and validate a display name; returns it or null. */
export function validateName(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const name = input.trim();
  if (name.length === 0 || name.length > MAX_NAME_LENGTH) return null;
  return name;
}

/** Generate a public site id of the form pk_ + 8 lowercase hex chars. */
export function generatePublicId(): string {
  return `pk_${randomBytes(4).toString("hex")}`;
}
