import type { SessionFilter } from "@alwaysmeticulous/api";
import RE2 from "re2";

export const MAX_SESSION_FILTER_REGEXES = 100;
export const MAX_SESSION_FILTER_REGEX_LENGTH = 1_000;

export type SessionFilterValidationResult =
  | { valid: true; filter: SessionFilter }
  | { valid: false; error: string };

/**
 * Validates an untrusted value as a {@link SessionFilter}, including checking
 * that every regex compiles with the same engine used for matching (Google's
 * RE2 — linear-time, no backreferences or lookaround; see
 * https://github.com/google/re2/wiki/Syntax).
 *
 * Shared by the CLI (to reject bad filters before triggering a run) and the
 * backend (to reject bad filters at the API boundary), so validation semantics
 * cannot drift between the two.
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
    try {
      new RE2(regex);
    } catch (error) {
      return {
        valid: false,
        error: `Session filter regex ${JSON.stringify(regex)} does not compile: ${
          error instanceof Error ? error.message : String(error)
        }. Regexes use the RE2 syntax (https://github.com/google/re2/wiki/Syntax).`,
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

/**
 * Compiles a {@link SessionFilter} into a predicate over a session's start
 * URL. Throws if any regex does not compile — call
 * {@link validateSessionFilter} first at the system boundary.
 */
export const compileSessionFilter = (
  filter: SessionFilter,
): ((sessionStartUrl: string) => boolean) => {
  const compiledRegexes = filter.regexes.map((regex) => new RE2(regex));
  return (sessionStartUrl: string) =>
    compiledRegexes.some((regex) => regex.test(sessionStartUrl));
};
