import type { CompactRange } from "@alwaysmeticulous/client";

/**
 * Formats compact line ranges for TSV output, e.g. `[[1, 1], [4, 9]]` becomes
 * `"1;4-9"`. A single-line range (`start === end`) is rendered as just the line
 * number.
 */
export const formatCoverageRanges = (ranges: CompactRange[]): string =>
  ranges
    .map(([start, end]) => (start === end ? `${start}` : `${start}-${end}`))
    .join(";");
