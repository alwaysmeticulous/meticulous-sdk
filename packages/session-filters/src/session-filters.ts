import type { SessionFilter } from "@alwaysmeticulous/api";

export const MAX_SESSION_FILTER_REGEXES = 100;
export const MAX_SESSION_FILTER_REGEX_LENGTH = 1_000;

export type SessionFilterValidationResult =
  | { valid: true; filter: SessionFilter }
  | { valid: false; error: string };

/**
 * Validates an untrusted value as a {@link SessionFilter}, including structural
 * validation of the filter object and basic constraints (length, count).
 *
 * Does NOT validate that regexes compile — regexes must use RE2 syntax, which
 * is validated by the backend at the API boundary.
 */
export const validateSessionFilter = (
  value: unknown,
): SessionFilterValidationResult => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { valid: false, error: "Session filter must be an object." };
  }

  const type = (value as { type?: unknown }).type;
  if (type !== "session-start-url-matches-any-regex") {
    return {
      valid: false,
      error: `Unknown session filter type ${JSON.stringify(type)}. Supported types: "session-start-url-matches-any-regex".`,
    };
  }

  const regexes = (value as { regexes?: unknown }).regexes;
  if (!Array.isArray(regexes)) {
    return {
      valid: false,
      error: "Session filter 'regexes' must be an array of strings.",
    };
  }
  if (regexes.length === 0) {
    return {
      valid: false,
      error:
        "Session filter 'regexes' must not be empty: an empty list would match no sessions. Omit the filter to run all selected sessions.",
    };
  }
  if (regexes.length > MAX_SESSION_FILTER_REGEXES) {
    return {
      valid: false,
      error: `Session filter 'regexes' must contain at most ${MAX_SESSION_FILTER_REGEXES} entries (got ${regexes.length}).`,
    };
  }

  for (const regex of regexes) {
    if (typeof regex !== "string") {
      return {
        valid: false,
        error: "Session filter 'regexes' must be an array of strings.",
      };
    }
    if (regex.length === 0) {
      return {
        valid: false,
        error:
          "Session filter 'regexes' must not contain empty strings (an empty regex matches every session).",
      };
    }
    if (regex.length > MAX_SESSION_FILTER_REGEX_LENGTH) {
      return {
        valid: false,
        error: `Session filter regexes must be at most ${MAX_SESSION_FILTER_REGEX_LENGTH} characters long (got one of length ${regex.length}).`,
      };
    }
  }

  return {
    valid: true,
    filter: {
      type: "session-start-url-matches-any-regex",
      regexes: regexes as string[],
    },
  };
};
