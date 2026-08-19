/**
 * A partial copy of @jridgewell/trace-mapping, reduced to the one question the
 * coverage plugin asks: which original line does this position in the
 * transformed module come from?
 *
 * Vendored rather than depended on because it is needed only inside the Vite
 * plugin bundle, which tsdown inlines — a package installed into a Worker
 * project should not acquire build-tool dependencies (the same reasoning that
 * keeps acorn and magic-string as devDependencies).
 *
 * See LICENSE in this directory for the upstream notices, and the header of
 * each file for what was dropped.
 */

export {
  MetTraceMap,
  type OriginalPosition,
  type RawSourceMapLike,
} from "./trace-mapping";
