/**
 * Auth constants with no crypto dependency, so both the Edge middleware and
 * the Node runtime can import them. The cookie is the session — there is no
 * server-side session table.
 */
export const SESSION_COOKIE = "pulse_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
