import { NextResponse } from "next/server";

/**
 * The single error-response shape used by every route:
 *   { "error": { "code": "invalid_payload", "message": "..." } }
 * Messages are short, human-readable, and never leak SQL, IPs, or secrets.
 */

export type ErrorCode =
  | "invalid_payload"
  | "payload_too_large"
  | "unknown_site"
  | "origin_mismatch"
  | "rate_limited"
  | "invalid_credentials"
  | "unauthorized"
  | "not_found"
  | "conflict"
  | "invalid_range"
  | "internal";

const DEFAULT_STATUS: Record<ErrorCode, number> = {
  invalid_payload: 400,
  payload_too_large: 413,
  unknown_site: 403,
  origin_mismatch: 403,
  rate_limited: 429,
  invalid_credentials: 401,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  invalid_range: 400,
  internal: 500,
};

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  invalid_payload: "The request payload was invalid.",
  payload_too_large: "The request body was too large.",
  unknown_site: "No site is registered for this identifier.",
  origin_mismatch: "The request origin does not match the registered site.",
  rate_limited: "Too many requests. Please slow down.",
  invalid_credentials: "Invalid email or password.",
  unauthorized: "Authentication is required.",
  not_found: "The requested resource was not found.",
  conflict: "The resource already exists.",
  invalid_range: "The requested range or dimension is invalid.",
  internal: "Something went wrong. Please try again.",
};

export interface ApiErrorBody {
  error: { code: ErrorCode; message: string };
}

/** Pure error body, independent of the HTTP layer (used in tests). */
export function errorBody(code: ErrorCode, message?: string): ApiErrorBody {
  return { error: { code, message: message ?? DEFAULT_MESSAGE[code] } };
}

/** Build the standard error response with the code's default (or given) status. */
export function apiError(
  code: ErrorCode,
  message?: string,
  status?: number,
): NextResponse<ApiErrorBody> {
  return NextResponse.json(errorBody(code, message), {
    status: status ?? DEFAULT_STATUS[code],
  });
}
