/**
 * Filters the set of sessions replayed by a test run: only sessions matching
 * the filter are replayed.
 *
 * Modelled as a discriminated union (on `type`) so new filter types and
 * combinators such as `and` / `or` can be added without breaking existing
 * callers.
 */
export type SessionFilter = SessionStartUrlMatchesAnyRegexFilter;

/**
 * Matches a session if its start URL (the URL the session started recording
 * on) matches at least one of `regexes`.
 */
export interface SessionStartUrlMatchesAnyRegexFilter {
  type: "session-start-url-matches-any-regex";
  /**
   * Regexes in Google's RE2 syntax (evaluated via the `re2` package); see
   * https://github.com/google/re2/wiki/Syntax. Matching is unanchored: a
   * regex matches if it matches anywhere in the start URL.
   */
  regexes: string[];
}
