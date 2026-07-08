import { readFile } from "fs/promises";
import type { SessionFilter } from "@alwaysmeticulous/api";
import { validateSessionFilter } from "@alwaysmeticulous/session-filters";

const SESSION_START_URL_MATCHES_ANY_REGEX_KEY =
  "session-start-url-matches-any-regex";

export type ParseSessionFilterResult =
  | { valid: true; filter: SessionFilter }
  | { valid: false; error: string };

/**
 * Parses the contents of a `--sessionFilter` JSON file, e.g.:
 *
 * ```json
 * {
 *   "session-start-url-matches-any-regex": ["my-path/", "your-path/two/"]
 * }
 * ```
 *
 * A session is replayed if its start URL matches at least one of the regexes.
 * Regexes use the RE2 syntax (https://github.com/google/re2/wiki/Syntax) and
 * are validated here, ahead of triggering the run, with the same engine the
 * backend matches with.
 */
export const parseSessionFilterFileContents = (
  contents: string,
): ParseSessionFilterResult => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch (error) {
    return {
      valid: false,
      error: `Session filter file is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      error: `Session filter file must contain a JSON object with a "${SESSION_START_URL_MATCHES_ANY_REGEX_KEY}" key.`,
    };
  }

  const keys = Object.keys(parsed);
  const unknownKeys = keys.filter(
    (key) => key !== SESSION_START_URL_MATCHES_ANY_REGEX_KEY,
  );
  if (unknownKeys.length > 0) {
    return {
      valid: false,
      error: `Session filter file contains unsupported keys: ${unknownKeys.join(", ")}. Supported keys: "${SESSION_START_URL_MATCHES_ANY_REGEX_KEY}".`,
    };
  }
  if (!keys.includes(SESSION_START_URL_MATCHES_ANY_REGEX_KEY)) {
    return {
      valid: false,
      error: `Session filter file must contain a "${SESSION_START_URL_MATCHES_ANY_REGEX_KEY}" key.`,
    };
  }

  const regexes = (parsed as Record<string, unknown>)[
    SESSION_START_URL_MATCHES_ANY_REGEX_KEY
  ];
  const result = validateSessionFilter({
    type: "session-start-url-matches-any-regex",
    regexes,
  });
  if (!result.valid) {
    return { valid: false, error: result.error };
  }
  return { valid: true, filter: result.filter };
};

export const readSessionFilterFile = async (
  sessionFilterPath: string,
): Promise<ParseSessionFilterResult> => {
  let contents: string;
  try {
    contents = await readFile(sessionFilterPath, "utf-8");
  } catch (error) {
    return {
      valid: false,
      error: `Could not read --sessionFilter file at ${sessionFilterPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  return parseSessionFilterFileContents(contents);
};
