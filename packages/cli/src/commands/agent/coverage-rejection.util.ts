import { CliUserError } from "../../utils/cli-user-error";
import { errorResponseBody } from "../../utils/error-response-body";

/**
 * The backend's response-body `reason`s marking a routine refusal to serve
 * coverage, rather than a fault — matched instead of the prose (same convention
 * as `isAmbiguousTestRunError`) so a genuinely missing artifact on a completed
 * run stays an unexpected error. Kept in step with
 * `packages/webapp-backend/src/replay/test-run/utils/base-run.utils.ts`.
 *
 * Every one is actionable by the caller, and the backend's message says how
 * (replay the rest with `complete-base-run`, ask for project or whole-run
 * coverage instead, drop `prDiffOnly`, or complete the specific run
 * `--latestForProject` itself resolved to), so it is surfaced as-is.
 *
 * The last three matter most for `js-coverage-diff`, whose two commonest
 * refusals are structural rather than "not yet": a bare invocation on a
 * default-branch checkout resolves to a base run (`base-run-not-applicable`),
 * and a run triggered outside a PR has no base to diff against
 * (`no-base-test-run`). Without them here, the most likely invocation of that
 * command printed the unhelpful `--help` tip and fired a Sentry event.
 */
const BASE_RUN_COVERAGE_REJECTION_REASONS = new Set([
  "incomplete-base-run",
  "incomplete-base-run-in-union",
  "incomplete-base-run-as-diff-base",
  "base-run-no-pr-diff",
  "incomplete-project-coverage",
  "base-run-not-applicable",
  "no-base-test-run",
]);

/**
 * Relays a base-run coverage refusal as a `CliUserError`; anything else reaches
 * the generic error path, which pairs it with the unhelpful `--help` tip and
 * reports it to Sentry.
 *
 * Keyed on the reason rather than the response code: a genuinely missing
 * artifact on a completed run is a real fault that must keep reaching Sentry.
 * The backend's message names the specific run, so it's surfaced as-is.
 */
export const withBaseRunRejectionAsUserError = async <T>(
  request: () => Promise<T>,
): Promise<T> => {
  try {
    return await request();
  } catch (error) {
    const body = errorResponseBody(error);
    if (
      body?.reason != null &&
      BASE_RUN_COVERAGE_REJECTION_REASONS.has(body.reason) &&
      body.message != null
    ) {
      throw new CliUserError(body.message);
    }
    throw error;
  }
};
