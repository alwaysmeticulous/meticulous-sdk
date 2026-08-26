import { requestCaptureContext } from "../context";
import type { CoverageMap, CoverageMapFile } from "./coverage.types";

/**
 * The in-worker half of build-time line coverage.
 *
 * The Meticulous Vite plugin rewrites the app's modules so each line marks
 * itself against a sink, and injects a manifest module that calls
 * {@link registerCoverageMap} once per isolate. Everything else here exists to
 * keep the hot path to a single array store.
 *
 * The sink lives on the per-request AsyncLocalStorage store rather than in a
 * module-scope global, which is the whole reason this can attribute coverage at
 * all: workerd interleaves concurrent requests in one isolate, so a shared
 * global would mix sessions together — the same over-attribution that makes
 * workerd's `getBestEffortCoverage` useless for this.
 *
 * Both entry points are no-ops when no sink is present (recording, an
 * uninstrumented request, module-level code running at isolate init), so an
 * instrumented bundle is safe to run with coverage off.
 */

const files: CoverageMapFile[] = [];
const registeredKeys = new Set<string>();
const reportedKeys = new Set<string>();
let totalIds = 0;

const fileKey = (file: CoverageMapFile): string =>
  `${file.path}#${file.firstId}`;

/**
 * Registers one module's slice of the id space, as a side effect of that module
 * being evaluated.
 *
 * Per-module rather than one generated manifest because the full map is not
 * known until every module has been transformed, and a manifest module would be
 * loaded by the bundler as soon as the *first* instrumented module imported it.
 * Self-registration sidesteps that ordering entirely.
 *
 * Deduplicated by path+id so a bundler that evaluates a module twice cannot
 * inflate the id space.
 */
export const registerCoverageFile = (file: CoverageMapFile): void => {
  const key = fileKey(file);
  if (registeredKeys.has(key)) {
    return;
  }
  registeredKeys.add(key);
  files.push(file);
  const idsInFile = file.lineRanges.length / 2;
  totalIds = Math.max(totalIds, file.firstId + idsInFile);
  growCurrentRequestSink();
};

/**
 * Extends the in-flight request's sink to cover the ids just registered.
 *
 * Registration happens as a module is evaluated, which for a code-split app is
 * inside whichever request first imported its chunk — usually the one about to
 * execute it. The sink was sized before that, so without this the request that
 * brings a module in is the one request whose coverage of it is lost, and on a
 * cold isolate that is the session's very first render.
 *
 * Replacing the array is safe because instrumented code re-reads the sink at
 * every function entry: only a function already executing keeps the old one, and
 * module evaluation itself carries no markers.
 */
const growCurrentRequestSink = (): void => {
  const store = requestCaptureContext.getStore();
  if (store === undefined) {
    return;
  }
  const sink = store.coverage;
  if (sink === undefined || sink.length >= totalIds) {
    return;
  }
  const grown = new Uint8Array(totalIds);
  grown.set(sink);
  store.coverage = grown;
};

/** The whole registered id space. Exposed for debugging an instrumented build. */
export const getCoverageMap = (): CoverageMap => ({ totalIds, files });

/**
 * The registered files the sidecar has not acknowledged yet.
 *
 * Reported per request rather than once per isolate because a code-split app
 * registers modules as their chunks are first imported — a route's server module
 * typically registers on the request that first calls into it, long after the
 * isolate's first report. Sending the map only once would leave every one of
 * that module's hits unresolvable, which is coverage silently lost rather than
 * coverage reported as missing.
 */
export const getUnreportedCoverageFiles = (): CoverageMapFile[] =>
  files.filter((file) => !reportedKeys.has(fileKey(file)));

/**
 * Marks files as delivered. Called only once the sidecar has accepted them, so a
 * report lost to a timeout or a 5xx goes out again with the next one — the
 * sidecar keeps the first map it sees for an id block, so a dropped map is
 * permanent otherwise.
 */
export const markCoverageFilesReported = (
  reported: readonly CoverageMapFile[],
): void => {
  for (const file of reported) {
    reportedKeys.add(fileKey(file));
  }
};

/**
 * Resolves the current request's sink. Called once per function invocation by
 * instrumented code, which then stores into the returned array directly.
 */
export const __mcEnter = (): Uint8Array | undefined =>
  requestCaptureContext.getStore()?.coverage;

/**
 * Marks one line hit. Used only for concise arrow bodies (`() => expr`), which
 * have no block in which to hoist the sink lookup.
 */
export const __mcHit = (id: number): void => {
  const sink = requestCaptureContext.getStore()?.coverage;
  if (sink !== undefined && id < sink.length) {
    sink[id] = 1;
  }
};

/**
 * Allocates a request's sink, sized to the id space registered so far — which on
 * a cold isolate is empty, since a code-split app registers nothing until its
 * chunks are imported. An empty sink is deliberately not the same as "no
 * instrumentation": {@link registerCoverageFile} grows it as modules arrive, so a
 * request that starts with nothing registered still collects what it loads.
 *
 * Never undefined, so an uninstrumented bundle costs one zero-length allocation
 * per request and reports nothing, rather than needing a per-isolate latch that
 * cannot tell "no instrumentation" from "not loaded yet".
 */
export const createCoverageSink = (): Uint8Array => new Uint8Array(totalIds);

/**
 * The ids marked during a request.
 *
 * Scanning the whole sink costs one pass over the id space per request — for a
 * large app a few hundred thousand array reads, well under a millisecond, and
 * paid once rather than on every line hit. The alternative (a push-list beside
 * the bitmap) would add a branch to the hot path to save that single pass.
 */
export const collectHitIds = (sink: Uint8Array): number[] => {
  const hits: number[] = [];
  for (let id = 0; id < sink.length; id++) {
    if (sink[id] !== 0) {
      hits.push(id);
    }
  }
  return hits;
};
