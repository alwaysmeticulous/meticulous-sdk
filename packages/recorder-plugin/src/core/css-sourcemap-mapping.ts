import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decode, encode } from "@jridgewell/sourcemap-codec";
import type { PlacedStylesheet, RawSourceMap } from "./css-sourcemap-types";

/**
 * Builds one source map for a concatenated CSS asset by shifting each
 * stylesheet's mappings into the position it occupies within that asset.
 *
 * Concatenation places stylesheets side by side, so their individual maps
 * cannot be composed the way a chain of transforms would be — each has to be
 * translated into the asset's coordinate space instead.
 */
export const buildConcatenatedSourcemap = (
  placed: readonly PlacedStylesheet[],
  fileName: string,
  root: string,
): RawSourceMap => {
  const sources: string[] = [];
  const sourcesContent: (string | null)[] = [];

  const sourceIndex = (absolutePath: string, content: string | null) => {
    const relative = toPosix(path.relative(root, absolutePath));
    const existing = sources.indexOf(relative);
    if (existing !== -1) {
      return existing;
    }
    sources.push(relative);
    sourcesContent.push(content);
    return sources.length - 1;
  };

  const lines: [number, number, number, number][][] = [];
  const addSegment = (
    line: number,
    segment: [number, number, number, number],
  ) => {
    while (lines.length <= line) {
      lines.push([]);
    }
    lines[line]?.push(segment);
  };

  for (const { id, stylesheet, line, column, skippedLines, span } of placed) {
    // Only the first line is offset horizontally; later lines start at column 0.
    const shift = (index: number, col: number) =>
      index === 0 ? column + col : col;
    const { map } = stylesheet;
    const decoded = map == null ? null : decode(map.mappings);

    if (map != null && decoded?.some((segments) => segments.length > 0)) {
      const remapped = map.sources.map((source, index) =>
        sourceIndex(
          resolveSource(id, source),
          map.sourcesContent?.[index] ?? null,
        ),
      );

      // A stylesheet owns exactly the lines it occupies in the asset. Segments
      // past that would land inside the next stylesheet and win its lookups.
      decoded
        .slice(skippedLines, skippedLines + span)
        .forEach((segments, index) => {
          for (const segment of segments) {
            if (segment.length < 4) {
              continue;
            }
            addSegment(line + index, [
              shift(index, segment[0]),
              remapped[segment[1]] ?? 0,
              segment[2],
              segment[3],
            ]);
          }
        });
      continue;
    }

    // Without a preprocessor map the compiled CSS is line-for-line with its
    // source, except where a plugin generated CSS the source never spelled out
    // (Tailwind's utilities, for instance). Clamping keeps those attributed to
    // the stylesheet that produced them instead of pointing past its end.
    const index = sourceIndex(id, stylesheet.code);
    const lastLine = Math.max(0, countLines(id) - 1);
    for (let i = 0; i < span; i++) {
      addSegment(line + i, [
        shift(i, 0),
        index,
        Math.min(i + skippedLines, lastLine),
        0,
      ]);
    }
  }

  return {
    version: 3,
    file: path.basename(fileName),
    sources,
    sourcesContent,
    names: [],
    mappings: encode(
      lines.map((segments) => segments.sort((a, b) => a[0] - b[0])),
    ),
  };
};

export const readCombinedSourcemap = (
  get: () => unknown,
): RawSourceMap | null => {
  let map: unknown;
  try {
    map = get();
  } catch {
    // No preprocessor map is available for this stylesheet.
    return null;
  }
  if (!isRawSourceMap(map) || map.mappings === "" || map.sources.length === 0) {
    return null;
  }
  return map;
};

const isRawSourceMap = (value: unknown): value is RawSourceMap =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as RawSourceMap).mappings === "string" &&
  Array.isArray((value as RawSourceMap).sources);

const resolveSource = (id: string, source: string): string => {
  if (source.startsWith("file://")) {
    try {
      // Not `URL.pathname`, which leaves a Windows path as `/C:/...` and keeps
      // any percent-encoding.
      return fileURLToPath(source);
    } catch {
      // Not a well-formed file URL; fall through and treat it as a path.
    }
  }
  if (path.isAbsolute(source)) {
    return source;
  }
  return path.resolve(path.dirname(id), source);
};

/**
 * Source maps address files with POSIX separators regardless of the platform
 * that produced them, and coverage is matched against repository paths in that
 * same form.
 */
const toPosix = (value: string): string => value.split(path.sep).join("/");

const countLines = (file: string): number => {
  try {
    return fs.readFileSync(file, "utf8").split("\n").length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};
