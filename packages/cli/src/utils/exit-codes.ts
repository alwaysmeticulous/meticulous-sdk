/**
 * Exit codes the CLI uses in addition to the conventional 0 (success) and
 * 1 (any other failure). A distinct code exists only where a CI pipeline has a
 * reason to branch on the failure instead of treating it as a build error.
 *
 * Codes start at 4 to stay clear of 2 and 3, which shells and process managers
 * conventionally use for usage errors and signals.
 */
export const EXIT_CODES = {
  /**
   * The run was not triggered because `--sessionFilter` excluded every session
   * that would otherwise have been replayed. Nothing is wrong with the build:
   * either the filter is too narrow, or this change genuinely touches no
   * recorded flow, so pipelines commonly treat this as a skip.
   */
  ALL_SESSIONS_EXCLUDED_BY_SESSION_FILTER: 4,
} as const;
