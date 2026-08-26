/**
 * Build-time line coverage contract, shared by the Vite plugin (which produces
 * the ids), the in-worker runtime (which reports hits against them) and the
 * sidecar (which turns hits back into file/line ranges).
 */

/** One instrumented source file's slice of the global id space. */
export interface CoverageMapFile {
  /**
   * Source path as the build saw it, relative to the build root — `../`-prefixed
   * for a file outside it, which the post-process strips to recover the
   * repo-relative path.
   */
  path: string;
  /** First global id assigned to this file. */
  firstId: number;
  /**
   * Inclusive 1-based line ranges, flattened as `[s1, e1, s2, e2, ...]` — the
   * range at pair index `i` belongs to global id `firstId + i`. Flat rather
   * than nested because this ships inside the customer's bundle, and it matches
   * the `[start, end]` flattening the V8 chunk format already uses.
   *
   * A range covers only the lines the marked statement occupies itself: nested
   * statements and function bodies carry their own ids, so an enclosing `if`
   * never credits its untaken branch.
   */
  lineRanges: number[];
}

export interface CoverageMap {
  /** Size of the global id space, and therefore of a request's sink. */
  totalIds: number;
  files: CoverageMapFile[];
}
