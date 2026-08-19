/**
 * Copied from @jridgewell/trace-mapping (src/binary-search.ts). See LICENSE in
 * this directory.
 *
 * Modifications: only the greatest-lower-bound path is kept (the sole bias
 * `originalPositionFor` uses here), so `upperBound` is dropped. The module-level
 * `found` flag is upstream's; it is read immediately after each search and this
 * runs single-threaded inside a build.
 */

import { COLUMN, type SourceMapSegment } from "./sourcemap-segment";

export interface MemoState {
  lastKey: number;
  lastNeedle: number;
  lastIndex: number;
}

let found = false;

export const memoizedState = (): MemoState => ({
  lastKey: -1,
  lastNeedle: -1,
  lastIndex: -1,
});

const binarySearch = (
  haystack: SourceMapSegment[],
  needle: number,
  low: number,
  high: number,
): number => {
  while (low <= high) {
    const mid = low + ((high - low) >> 1);
    const cmp = haystack[mid][COLUMN] - needle;
    if (cmp === 0) {
      found = true;
      return mid;
    }
    if (cmp < 0) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  found = false;
  return low - 1;
};

const lowerBound = (
  haystack: SourceMapSegment[],
  needle: number,
  index: number,
): number => {
  for (let i = index - 1; i >= 0; index = i--) {
    if (haystack[i][COLUMN] !== needle) {
      break;
    }
  }
  return index;
};

const memoizedBinarySearch = (
  haystack: SourceMapSegment[],
  needle: number,
  state: MemoState,
  key: number,
): number => {
  const { lastKey, lastNeedle, lastIndex } = state;

  let low = 0;
  let high = haystack.length - 1;
  if (key === lastKey) {
    if (needle === lastNeedle) {
      found = lastIndex !== -1 && haystack[lastIndex][COLUMN] === needle;
      return lastIndex;
    }
    if (needle >= lastNeedle) {
      low = lastIndex === -1 ? 0 : lastIndex;
    } else {
      high = lastIndex;
    }
  }
  state.lastKey = key;
  state.lastNeedle = needle;
  return (state.lastIndex = binarySearch(haystack, needle, low, high));
};

/**
 * Index of the segment covering `column` on `line`, or -1 when the line has
 * none at or before it.
 */
export const traceSegmentIndex = (
  segments: SourceMapSegment[],
  memo: MemoState,
  line: number,
  column: number,
): number => {
  let index = memoizedBinarySearch(segments, column, memo, line);
  if (found) {
    index = lowerBound(segments, column, index);
  }
  return index === -1 || index === segments.length ? -1 : index;
};
