import { readFile } from "fs/promises";
import type { SessionFilter } from "@alwaysmeticulous/api";
import { validateSessionFilter } from "@alwaysmeticulous/session-filters";

const SESSION_START_URL_MATCHES_ANY_REGEX_KEY =
  "session-start-url-matches-any-regex";

/**
 * Sentinel for a filter file whose regex list is empty or holds only blank
 * entries: it matches no sessions, so the deployment is created but no test
 * run is triggered. A later run can still build its base on that deployment.
 */
export const MATCHES_NO_SESSIONS = "matches-no-sessions";

export type ParseSessionFilterResult =
  | { valid: true; filter: SessionFilter | typeof MATCHES_NO_SESSIONS }
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
 * An empty list, or one whose entries are all blank, yields
 * {@link MATCHES_NO_SESSIONS}.
 * Regexes use the RE2 syntax (https://github.com/google/re2/wiki/Syntax). The
 * backend validates regex syntax at the API boundary and returns a clear error
 * if compilation fails — the CLI performs only structural validation here.
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
  if (isEmptyOrAllBlank(regexes)) {
    return { valid: true, filter: MATCHES_NO_SESSIONS };
  }
  const result = validateSessionFilter({
    type: "session-start-url-matches-any-regex",
    regexes,
  });
  if (!result.valid) {
    return { valid: false, error: result.error };
  }
  return { valid: true, filter: result.filter };
};

const isEmptyOrAllBlank = (regexes: unknown): boolean =>
  Array.isArray(regexes) &&
  regexes.every(
    (regex) => typeof regex === "string" && regex.trim().length === 0,
  );

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
