import { logProgress } from "@alwaysmeticulous/common";
import { CliUserError } from "./cli-user-error";

/**
 * How often a result that reported itself as still being computed is asked
 * for again — the same cadence as the wait for the run itself, and the one
 * every tool description tells an agent to poll at. Deliberately not shortened
 * for the "run has finished, the result is moments away" case: the replay-scope
 * waits have no run to wait on first, so this interval covers a whole replay
 * execution, and each poll costs a database read.
 */
export const RESULT_POLL_INTERVAL_MS = 10_000;

/** The default budget — the same the wait for the run itself gets. */
export const RESULT_POLL_TIMEOUT_MS = 10 * 60_000;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Re-requests a result while it reports itself as still being computed — the
 * `{ status: "processing" }` every async agent endpoint returns for a result
 * that isn't there yet — and returns it once it isn't. One "Waiting…" line
 * when the wait starts, computed from the first processing response (so a
 * backend-provided `message` can be relayed verbatim), no per-poll output
 * (noisy context for agents), and a `CliUserError` rather than waiting
 * forever once the budget is spent.
 */
export const pollWhileProcessing = async <R, P extends R>(
  request: () => Promise<R>,
  {
    isProcessing,
    waitingMessage,
    timeoutMs = RESULT_POLL_TIMEOUT_MS,
    timeoutMessage,
  }: {
    isProcessing: (response: R) => response is P;
    waitingMessage: (firstResponse: P) => string;
    timeoutMs?: number;
    timeoutMessage: (lastResponse: P) => string;
  },
): Promise<Exclude<R, P>> => {
  let response = await request();
  if (!isProcessing(response)) {
    return response as Exclude<R, P>;
  }
  logProgress(waitingMessage(response));
  const deadline = performance.now() + timeoutMs;
  while (isProcessing(response)) {
    if (performance.now() >= deadline) {
      throw new CliUserError(timeoutMessage(response), 1, "error", {
        reason: "remote",
      });
    }
    await sleep(RESULT_POLL_INTERVAL_MS);
    response = await request();
  }
  return response as Exclude<R, P>;
};
