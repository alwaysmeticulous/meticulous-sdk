/**
 * Copied from @jridgewell/trace-mapping (src/sourcemap-segment.ts). See LICENSE
 * in this directory.
 *
 * Modifications: only the fields `originalPositionFor` reads are kept.
 */

/**
 * A decoded mapping. One entry means "generated column only, no original
 * position"; four or five mean the generated column maps back to a source.
 */
export type SourceMapSegment =
  | [number]
  | [number, number, number, number]
  | [number, number, number, number, number];

export const COLUMN = 0;
export const SOURCES_INDEX = 1;
export const SOURCE_LINE = 2;
export const SOURCE_COLUMN = 3;
