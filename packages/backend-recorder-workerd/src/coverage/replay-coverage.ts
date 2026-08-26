import { type RequestReplayContext, requestCaptureContext } from "../context";
import { warnOnce } from "../log";
import { getOriginalFetch } from "../original-fetch";
import { postCoverageReport } from "../sidecar-client";
import {
  collectHitIds,
  createCoverageSink,
  getUnreportedCoverageFiles,
  markCoverageFilesReported,
} from "./runtime";

/**
 * The replay-mode half of line coverage: giving a request a sink, and reporting
 * what it marked. The marking itself is `runtime.ts`, which the instrumented
 * bundle calls directly.
 */

/**
 * Whether the sidecar has told us it will never take coverage (404 on the route: an older
 * sidecar, or one started without coverage enabled). Latched per isolate so a replay against
 * such a sidecar stops allocating sinks and serialising hits after the first report.
 */
let coverageDisabled = false;

/**
 * Runs the handler with a per-request coverage sink, reporting what it marked once the response
 * exists.
 *
 * The sink is per-request rather than per-isolate because workerd interleaves concurrent
 * requests, and every replayed request belongs to a different session — a shared sink would
 * merge their coverage. Reporting goes through `waitUntil` so serialising the hits never delays
 * the response, and every failure path leaves the response untouched: coverage is strictly
 * best-effort.
 */
export const runReplayWithCoverage = async (
  replayContext: RequestReplayContext,
  invokeHandler: () => Response | Promise<Response>,
): Promise<Response> => {
  if (coverageDisabled) {
    return requestCaptureContext.run(replayContext, invokeHandler);
  }

  let sink: Uint8Array | undefined;
  try {
    sink = createCoverageSink();
  } catch (error) {
    warnOnce("coverage-sink", "Could not allocate a coverage sink.", error);
  }
  if (sink === undefined) {
    // Allocation threw — run the request uncovered rather than failing it.
    return requestCaptureContext.run(replayContext, invokeHandler);
  }

  const contextWithCoverage: RequestReplayContext = {
    ...replayContext,
    coverage: sink,
  };
  try {
    return await requestCaptureContext.run(contextWithCoverage, invokeHandler);
  } finally {
    reportCoverage(contextWithCoverage);
  }
};

/**
 * Sends the hits, plus any id→line map the sidecar has not acknowledged yet.
 *
 * The map goes out incrementally rather than once per isolate because a
 * code-split app registers a module only when its chunk is first imported: a
 * route's server module usually registers on the request that first calls it,
 * after earlier requests have already reported. Without the delta its hits would
 * arrive against ids no file describes, and be dropped by the post-process.
 */
const reportCoverage = (context: RequestReplayContext): void => {
  try {
    // Read the sink off the context rather than closing over the one allocated at
    // request start: a module imported while the request ran will have grown it.
    const sink = context.coverage;
    if (sink === undefined) {
      return;
    }
    const hitIds = collectHitIds(sink);
    const files = getUnreportedCoverageFiles();
    if (hitIds.length === 0 && files.length === 0) {
      return;
    }
    context.waitUntil(
      postCoverageReport(getOriginalFetch(), context.sidecarUrl, {
        frontendSessionId: context.frontendSessionId,
        hitIds,
        ...(files.length > 0 ? { files } : {}),
      }).then((outcome) => {
        if (outcome === "unsupported") {
          coverageDisabled = true;
          return;
        }
        if (outcome === "accepted") {
          markCoverageFilesReported(files);
        }
      }),
    );
  } catch (error) {
    warnOnce("coverage-report", "Failed to report line coverage.", error);
  }
};
