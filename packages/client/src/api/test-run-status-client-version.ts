/**
 * Test-run REST contract version this client speaks. Sent on requests that
 * return a {@link TestRun} so the backend can serve a version-appropriate
 * status. Older backends ignore it. Bump when the client adopts a new default
 * contract for statuses.
 *
 * - v0 (no clientVersion sent): pre-versioning clients. The backend downgrades
 *   unknown terminal statuses (e.g. `Skipped`) to `Aborted` so exhaustive
 *   switches in pinned CLIs do not hit `assertNever`.
 * - v1: understands the `Skipped` status.
 * - v2: understands the `Deferred` and `ResultsReused` statuses. Lower versions
 *   receive them as `Skipped` (v1) or `Aborted` (v0): in both cases the run
 *   executed nothing and nothing will replace it automatically, which is what
 *   those statuses tell an older client.
 */
export const TEST_RUN_STATUS_CLIENT_VERSION = 2;
