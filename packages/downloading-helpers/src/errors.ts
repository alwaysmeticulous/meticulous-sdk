/**
 * A replay only gains a files index once it has uploaded its artifacts, so a
 * replay that failed, timed out, or has not finished running has nothing to
 * download: `GET /replays/:id/download-urls` returns 404 and the client maps
 * that to `null`.
 *
 * That is an ordinary state rather than a failure. Callers processing a set of
 * replays (post-processing, coverage) should skip the replay and carry on;
 * callers acting on the one replay a user named should still surface it.
 */
export class ReplayHasNoArtifactsError extends Error {
  static type = "ReplayHasNoArtifactsError";

  constructor(readonly replayId: string) {
    super(
      `Replay ${replayId} has no artifacts to download: it failed, timed out, or has not finished running`,
    );
    this.name = ReplayHasNoArtifactsError.type;
  }
}

/**
 * The requested test run download scope consists only of files the backend
 * withholds from this caller: pull-request coverage needs read access to the
 * project's source code.
 */
export class TestRunDataWithheldError extends Error {
  static type = "TestRunDataWithheldError";

  constructor(
    readonly testRunId: string,
    readonly scope: string,
  ) {
    super(
      `The ${scope} files of test run ${testRunId} need source-code access to the project, which this caller does not have.`,
    );
    this.name = TestRunDataWithheldError.type;
  }
}

/**
 * Matches on `name` rather than `instanceof` so the check still holds when the
 * thrower and the catcher end up in different copies of this module (e.g. a
 * published CLI bundling its own `downloading-helpers`).
 */
export const isReplayHasNoArtifactsError = (error: unknown): boolean =>
  hasErrorName(error, ReplayHasNoArtifactsError.type);

/** See {@link isReplayHasNoArtifactsError} for why this matches on `name`. */
export const isTestRunDataWithheldError = (
  error: unknown,
): error is TestRunDataWithheldError =>
  hasErrorName(error, TestRunDataWithheldError.type);

const hasErrorName = (error: unknown, name: string): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { name?: unknown })["name"] === name;
