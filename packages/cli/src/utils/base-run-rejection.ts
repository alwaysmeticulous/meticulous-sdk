import { CliUserError } from "./cli-user-error";
import { errorResponseBody } from "./error-response-body";

/**
 * The backend's response-body `reason` for refusing a base run something it
 * structurally cannot have. Kept in step with
 * `BASE_RUN_NOT_APPLICABLE_REASON` in
 * `packages/webapp-backend/src/replay/test-run/utils/base-run.utils.ts`.
 */
const BASE_RUN_NOT_APPLICABLE_REASON = "base-run-not-applicable";

/**
 * Relays the backend's base-run refusal as a `CliUserError`.
 *
 * Asking a base run for diffs or check reports is a normal mistake — a
 * default-branch checkout resolves to one — not a fault, so it must not reach
 * the generic error path, which pairs it with the unhelpful `--help` tip and
 * reports it to Sentry.
 *
 * Needed because the commit-resolution path can no longer always recognise a
 * base run locally: a session pool that has settled into `Success`/`Failure`
 * looks like any other completed run unless you read its `configData`, and the
 * commit-lookup response deliberately carries only the id and status (it mirrors
 * the MCP tool exactly). Buying `configData` for every commit-path call to catch
 * that one case would cost a round trip on the common path, so the check runs
 * locally only where the run is already in hand, and this relays the backend's
 * verdict otherwise. Matched on the reason rather than the prose, the same
 * convention `js-coverage` follows, so a genuine 400 still reaches Sentry.
 */
export const relayingBaseRunRejection = async <T>(
  request: Promise<T>,
): Promise<T> => {
  try {
    return await request;
  } catch (error) {
    const body = errorResponseBody(error);
    if (
      body?.reason === BASE_RUN_NOT_APPLICABLE_REASON &&
      body.message != null
    ) {
      throw new CliUserError(body.message);
    }
    throw error;
  }
};
