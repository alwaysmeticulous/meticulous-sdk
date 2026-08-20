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
 * Matches on `name` rather than `instanceof` so the check still holds when the
 * thrower and the catcher end up in different copies of this module (e.g. a
 * published CLI bundling its own `downloading-helpers`).
 */
export const isReplayHasNoArtifactsError = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (
    (error as { name?: unknown })["name"] === ReplayHasNoArtifactsError.type
  );
};
