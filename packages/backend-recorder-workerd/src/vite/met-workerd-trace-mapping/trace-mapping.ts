/**
 * Copied from @jridgewell/trace-mapping (src/trace-mapping.ts). See LICENSE in
 * this directory.
 *
 * Modifications, all subtractive:
 *
 *   - decode only: no `encode`, no `decodedMap`/`encodedMap`, no
 *     `generatedPositionFor` and none of the by-source index it needs.
 *   - no URI resolution, and therefore no @jridgewell/resolve-uri dependency.
 *     `originalPositionFor` returns the raw `sourceIndex` instead of a resolved
 *     source string, and the caller reads {@link MetTraceMap.sources} itself.
 *     The plugin only needs to know *which* source a position came from so it
 *     can drop positions belonging to another file, and Vite hands it absolute
 *     paths with no `sourceRoot` — so resolving URLs would add a dependency to
 *     answer a question nobody asks.
 *   - a sectioned map (`sections`) is reported as unusable rather than
 *     flattened, since Vite never produces one for a single module's transform
 *     chain.
 */

import {
  type MemoState,
  memoizedState,
  traceSegmentIndex,
} from "./binary-search";
import {
  COLUMN,
  SOURCE_COLUMN,
  SOURCE_LINE,
  SOURCES_INDEX,
  type SourceMapSegment,
} from "./sourcemap-segment";
import { decode, maybeSort } from "./vlq";

/** The subset of a raw source map this needs. Structural, so any producer fits. */
export interface RawSourceMapLike {
  sources?: Array<string | null> | null;
  mappings?: string | SourceMapSegment[][] | null;
  sections?: unknown;
}

export interface OriginalPosition {
  /** Index into {@link MetTraceMap.sources}. */
  sourceIndex: number;
  /** 1-based line in that source. */
  line: number;
  /** 0-based column in that source. */
  column: number;
}

export class MetTraceMap {
  readonly sources: Array<string | null>;
  private readonly encoded: string | undefined;
  private decoded: SourceMapSegment[][] | undefined;
  private readonly memo: MemoState = memoizedState();

  constructor(map: RawSourceMapLike) {
    this.sources = map.sources ?? [];
    const { mappings } = map;
    if (typeof mappings === "string") {
      this.encoded = mappings;
    } else if (Array.isArray(mappings)) {
      this.decoded = maybeSort(mappings);
    } else {
      throw new Error("invalid source map: no mappings");
    }
  }

  private get lines(): SourceMapSegment[][] {
    this.decoded ??= decode(this.encoded ?? "");
    return this.decoded;
  }

  /**
   * The original position a generated position came from, or null when the
   * generated position has no mapping — which for our purposes means generated
   * code with no counterpart in any source.
   *
   * @param line 1-based line in the generated code.
   * @param column 0-based column in the generated code.
   */
  originalPositionFor(line: number, column: number): OriginalPosition | null {
    const lineIndex = line - 1;
    if (lineIndex < 0 || column < 0) {
      return null;
    }
    const lines = this.lines;
    if (lineIndex >= lines.length) {
      return null;
    }
    const segments = lines[lineIndex];
    const index = traceSegmentIndex(segments, this.memo, lineIndex, column);
    if (index === -1) {
      return null;
    }
    const segment = segments[index];
    if (segment.length === 1) {
      return null;
    }
    return {
      sourceIndex: segment[SOURCES_INDEX],
      line: segment[SOURCE_LINE] + 1,
      column: segment[SOURCE_COLUMN],
    };
  }
}

/** Exported for the tests, which assert against decoded segment columns. */
export { COLUMN };
