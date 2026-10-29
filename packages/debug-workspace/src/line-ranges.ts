/** An inclusive `[startLine, endLine]` range, as coverage files store them. */
export type LineRange = [number, number];

const MAX_FORMATTED_RANGES = 40;

/** The parts of `ranges` not covered by `remove`. Both must be sorted and non-overlapping. */
export const subtractRanges = (
  ranges: readonly LineRange[],
  remove: readonly LineRange[],
): LineRange[] => {
  const result: LineRange[] = [];
  let i = 0;
  for (const [start, end] of ranges) {
    let cursor = start;
    while (i < remove.length && remove[i][1] < cursor) {
      i++;
    }
    for (let j = i; j < remove.length && remove[j][0] <= end; j++) {
      if (remove[j][0] > cursor) {
        result.push([cursor, remove[j][0] - 1]);
      }
      cursor = Math.max(cursor, remove[j][1] + 1);
    }
    if (cursor <= end) {
      result.push([cursor, end]);
    }
  }
  return result;
};

/** The lines (sorted) that fall inside one of `ranges`. */
export const linesInRanges = (
  lines: readonly number[],
  ranges: readonly LineRange[],
): number[] =>
  lines.filter((line) =>
    ranges.some(([start, end]) => line >= start && line <= end),
  );

/** Sorted line numbers as compact ranges, e.g. `3-5,9`. */
export const formatLines = (lines: readonly number[]): string => {
  const ranges: LineRange[] = [];
  for (const line of lines) {
    const last = ranges[ranges.length - 1];
    if (last != null && line === last[1] + 1) {
      last[1] = line;
    } else {
      ranges.push([line, line]);
    }
  }
  return formatRanges(ranges);
};

export const formatRanges = (ranges: readonly LineRange[]): string => {
  const shown = ranges
    .slice(0, MAX_FORMATTED_RANGES)
    .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
    .join(",");
  return ranges.length > MAX_FORMATTED_RANGES
    ? `${shown},... (${ranges.length - MAX_FORMATTED_RANGES} more)`
    : shown;
};
